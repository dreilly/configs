/**
 * Per-worktree RealTime instances (`rtw` in ~/code/containerization/containers).
 *
 * `rtw url --json` maps a checkout to its instance: the main checkout is served at
 * https://sis.localhost (name ""), a worktree at https://<name>.sis.localhost.
 */
import { execFile } from "node:child_process";
import { accessSync, constants } from "node:fs";
import { homedir } from "node:os";
import { delimiter, join } from "node:path";

export interface RtwInfo {
	/** Instance name; "" for the main checkout. */
	name: string;
	url: string;
	host: string;
	worktree: string;
	container: string;
	/** podman container state: running, exited, created, none, ... */
	state: string;
}

/** DNS-label-safe instance name, as produced by `rtw` (sanitize). */
export const INSTANCE_RE = /^[a-z0-9](?:[a-z0-9-]{0,48}[a-z0-9])?$/;

function isExecutable(p: string): boolean {
	try {
		accessSync(p, constants.X_OK);
		return true;
	} catch {
		return false;
	}
}

/** RTW_BIN, else `rtw` on PATH, else the default containerization checkout. */
export function findRtw(): string | undefined {
	const candidates = [
		process.env.RTW_BIN,
		...(process.env.PATH ?? "").split(delimiter).filter(Boolean).map((d) => join(d, "rtw")),
		join(homedir(), "code", "containerization", "containers", "rtw"),
	];
	return candidates.find((p): p is string => !!p && isExecutable(p));
}

/** Run `rtw url [target] --json`. Resolves undefined if rtw is missing or the target isn't an RT checkout. */
export function rtwUrl(opts: { cwd?: string; target?: string; timeoutMs?: number } = {}): Promise<RtwInfo | undefined> {
	const bin = findRtw();
	if (!bin) return Promise.resolve(undefined);
	const args = ["url", ...(opts.target ? [opts.target] : []), "--json"];
	return new Promise((resolve) => {
		execFile(bin, args, { cwd: opts.cwd, timeout: opts.timeoutMs ?? 10_000 }, (err, stdout) => {
			if (err) return resolve(undefined);
			try {
				const info = JSON.parse(stdout.trim()) as RtwInfo;
				resolve(typeof info?.url === "string" ? info : undefined);
			} catch {
				resolve(undefined);
			}
		});
	});
}
