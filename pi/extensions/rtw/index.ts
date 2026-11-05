/**
 * /rtw - per-worktree RealTime SIS instances from inside pi.
 *
 *   /rtw <branch> [--from <ref>] [prompt...]  create (or start) the worktree + container via `rtw`,
 *                                            then move this pi session into the worktree.
 *                                            With a prompt, the new session starts working on it.
 *   /rtw main [prompt...]                    move back to the main checkout
 *   /rtw ls                                  list worktrees, container state and URLs
 *   /rtw up|down|restart <name>              container control
 *   /rtw rm <name> [--force]                 remove container + worktree (asks first)
 *
 * Moving a session: pi takes a session's cwd from its file header, so this writes a header-only session
 * file for the target directory and switches to it (like /resume). The old session is kept and recorded
 * as the parent. Existing sessions in that directory can be resumed instead.
 */
import { spawn } from "node:child_process";
import { accessSync, constants, existsSync, mkdirSync, realpathSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { delimiter, dirname, join, sep } from "node:path";
import { type ExtensionAPI, type ExtensionCommandContext, SessionManager } from "@earendil-works/pi-coding-agent";
import { releaseInstanceBrowser } from "../rt-browser/chrome.ts";

const STATUS_KEY = "rtw";
const SUBCOMMANDS = ["ls", "main", "up", "down", "restart", "rm"];
const NEW_SESSION = "Start a new session";

interface RtwInfo {
	name: string;
	url: string;
	worktree: string;
	repo: string;
	container: string;
	state: string;
}

interface RunResult {
	code: number;
	stdout: string;
	stderr: string;
}

function findRtw(): string | undefined {
	const candidates = [
		process.env.RTW_BIN,
		...(process.env.PATH ?? "").split(delimiter).filter(Boolean).map((d) => join(d, "rtw")),
		join(homedir(), "code", "containerization", "containers", "rtw"),
	];
	return candidates.find((p): p is string => {
		if (!p) return false;
		try {
			accessSync(p, constants.X_OK);
			return true;
		} catch {
			return false;
		}
	});
}

/** Run rtw, streaming each output line to onLine (rtw logs progress on stderr). */
function run(bin: string, args: string[], opts: { cwd?: string; onLine?: (line: string) => void } = {}): Promise<RunResult> {
	return new Promise((resolve) => {
		const child = spawn(bin, args, { cwd: opts.cwd, stdio: ["ignore", "pipe", "pipe"] });
		let stdout = "";
		let stderr = "";
		const lines = (chunk: Buffer) => {
			for (const l of chunk.toString().split(/\r?\n/)) if (l.trim()) opts.onLine?.(l.trim());
		};
		child.stdout.on("data", (c: Buffer) => {
			stdout += c;
			lines(c);
		});
		child.stderr.on("data", (c: Buffer) => {
			stderr += c;
			lines(c);
		});
		child.on("error", (err) => resolve({ code: 127, stdout, stderr: stderr + String(err) }));
		child.on("close", (code) => resolve({ code: code ?? 1, stdout, stderr }));
	});
}

const lastLines = (s: string, n = 6) => s.trim().split(/\r?\n/).slice(-n).join("\n");

function realPath(p: string): string {
	try {
		return realpathSync(p);
	} catch {
		return p;
	}
}

const isWithin = (dir: string, p: string) => {
	const d = realPath(dir);
	const x = realPath(p);
	return x === d || x.startsWith(d + sep);
};

/** Split `/rtw` args into positional words, --flags, and `--from <ref>`. */
function parseArgs(raw: string) {
	const tokens = raw.trim().split(/\s+/).filter(Boolean);
	const words: string[] = [];
	const flags = new Set<string>();
	let from: string | undefined;
	for (let i = 0; i < tokens.length; i++) {
		const t = tokens[i];
		if (t === "--from") from = tokens[++i];
		else if (t === "--force") flags.add(t);
		else words.push(t);
	}
	return { words, flags, from };
}

export default function rtwExtension(pi: ExtensionAPI) {
	let nameCache: { at: number; names: string[] } | undefined;

	/** Worktree names from `rtw ls` (cached briefly for completions). */
	async function worktreeNames(bin: string): Promise<string[]> {
		if (nameCache && Date.now() - nameCache.at < 30_000) return nameCache.names;
		const r = await run(bin, ["ls"]);
		const names = r.stdout
			.split(/\r?\n/)
			.slice(1)
			.map((l) => l.split(/\s+/)[0])
			.filter((n) => n && /^[a-z0-9-]+$/.test(n));
		nameCache = { at: Date.now(), names };
		return names;
	}

	async function info(bin: string, target?: string, cwd?: string): Promise<RtwInfo | undefined> {
		const r = await run(bin, ["url", ...(target ? [target] : []), "--json"], { cwd });
		if (r.code !== 0) return undefined;
		try {
			return JSON.parse(r.stdout.trim()) as RtwInfo;
		} catch {
			return undefined;
		}
	}

	/** Run rtw with live progress in the status bar. Returns stdout, or undefined after reporting the error. */
	async function rtw(ctx: ExtensionCommandContext, bin: string, args: string[]): Promise<string | undefined> {
		ctx.ui.setStatus(STATUS_KEY, `rtw ${args[0]}…`);
		const r = await run(bin, args, {
			cwd: ctx.cwd,
			onLine: (l) => ctx.ui.setStatus(STATUS_KEY, `rtw: ${l.replace(/^rtw: /, "").slice(0, 100)}`),
		});
		ctx.ui.setStatus(STATUS_KEY, undefined);
		nameCache = undefined;
		if (r.code !== 0) {
			ctx.ui.notify(`rtw ${args.join(" ")} failed:\n${lastLines(r.stderr || r.stdout)}`, "error");
			return undefined;
		}
		return r.stdout;
	}

	/** Write a header-only session for `cwd` so switchSession() opens it with that working directory. */
	function createSessionIn(cwd: string, parentSession: string | undefined): string {
		const sm = SessionManager.create(cwd, undefined, { parentSession });
		const file = sm.getSessionFile();
		const header = sm.getHeader();
		if (!file || !header) throw new Error("could not create a session file");
		mkdirSync(dirname(file), { recursive: true });
		writeFileSync(file, `${JSON.stringify(header)}\n`, { flag: "wx" });
		return file;
	}

	/** Move this pi session into `cwd`: resume one of its sessions or start a new one, then send `prompt`. */
	async function enter(ctx: ExtensionCommandContext, cwd: string, label: string, prompt: string | undefined) {
		if (isWithin(cwd, ctx.cwd) && !prompt) {
			ctx.ui.notify(`Already in ${label} (${cwd}).`, "info");
			return;
		}
		await ctx.waitForIdle();

		let file: string | undefined;
		if (!prompt) {
			const sessions = (await SessionManager.list(cwd).catch(() => []))
				.filter((s) => s.messageCount > 0)
				.sort((a, b) => b.modified.getTime() - a.modified.getTime())
				.slice(0, 8);
			if (sessions.length) {
				const labels = sessions.map(
					(s) => `Resume: ${(s.name || s.firstMessage || s.id).replace(/\s+/g, " ").slice(0, 70)}  (${s.modified.toLocaleString()})`,
				);
				const choice = await ctx.ui.select(`Sessions in ${label}:`, [NEW_SESSION, ...labels]);
				if (!choice) return;
				if (choice !== NEW_SESSION) file = sessions[labels.indexOf(choice)].path;
			}
		}
		file ??= createSessionIn(cwd, ctx.sessionManager.getSessionFile());

		const result = await ctx.switchSession(file, {
			withSession: async (c) => {
				c.ui.notify(`Now working in ${label}: ${cwd}`, "info");
				if (prompt) await c.sendUserMessage(prompt);
			},
		});
		if (result.cancelled) ctx.ui.notify("Session switch was cancelled.", "warning");
	}

	pi.registerCommand("rtw", {
		description: "RealTime worktree: /rtw <branch> [--from <ref>] [prompt] | main | ls | up|down|restart|rm <name>",
		getArgumentCompletions: async (prefix) => {
			const bin = findRtw();
			const parts = prefix.split(/\s+/);
			const last = (parts.pop() ?? "").toLowerCase();
			let options: string[];
			if (parts.length === 0) options = [...SUBCOMMANDS, ...(bin ? await worktreeNames(bin).catch(() => []) : [])];
			else if (["up", "down", "restart", "rm"].includes(parts[0])) options = bin ? await worktreeNames(bin).catch(() => []) : [];
			else return null;
			const items = options.filter((o) => o.startsWith(last)).map((o) => ({ value: [...parts, o].join(" "), label: o }));
			return items.length ? items : null;
		},
		handler: async (args, ctx) => {
			const bin = findRtw();
			if (!bin) {
				ctx.ui.notify("rtw not found (set RTW_BIN or put rtw on PATH).", "error");
				return;
			}
			const { words, flags, from } = parseArgs(args);
			const [sub, ...rest] = words;

			switch (sub) {
				case undefined:
				case "ls": {
					const out = await rtw(ctx, bin, ["ls"]);
					if (out !== undefined) ctx.ui.notify(out.trimEnd(), "info");
					return;
				}
				case "up":
				case "down":
				case "restart": {
					if (!rest[0]) return ctx.ui.notify(`Usage: /rtw ${sub} <name>`, "error");
					const out = await rtw(ctx, bin, [sub, rest[0]]);
					if (out !== undefined) ctx.ui.notify(`rtw ${sub} ${rest[0]}: done${out.trim() ? ` (${out.trim()})` : ""}`, "info");
					return;
				}
				case "rm": {
					const name = rest[0];
					if (!name) return ctx.ui.notify("Usage: /rtw rm <name> [--force]", "error");
					const i = await info(bin, name);
					if (i && isWithin(i.worktree, ctx.cwd)) {
						return ctx.ui.notify(`This session is inside ${name}. Run /rtw main first.`, "error");
					}
					const force = flags.has("--force");
					const ok = await ctx.ui.confirm(
						`Remove worktree ${name}?`,
						`Removes container ${i?.container ?? name}, ${i?.worktree ?? "the worktree"}, and its browser profile (branch is kept).` +
							(force ? "\n--force: uncommitted changes will be DISCARDED." : ""),
					);
					if (!ok) return;
					const out = await rtw(ctx, bin, ["rm", name, ...(force ? ["--force"] : [])]);
					if (out === undefined) return;
					await releaseInstanceBrowser(name).catch((err) =>
						ctx.ui.notify(`Removed ${name}, but could not clean up its browser profile: ${String(err)}`, "warning"),
					);
					ctx.ui.notify(`Removed ${name} (worktree, container, browser profile).`, "info");
					return;
				}
				case "main": {
					const i = await info(bin, undefined, ctx.cwd);
					const repo = i?.repo;
					if (!repo || !existsSync(repo)) return ctx.ui.notify("Could not locate the main RealTime checkout.", "error");
					await enter(ctx, repo, "main checkout", rest.join(" ") || undefined);
					return;
				}
				default: {
					const branch = sub;
					const prompt = rest.join(" ") || undefined;
					const nameOut = await rtw(ctx, bin, ["name", branch]);
					const name = nameOut?.trim();
					if (!name) return;
					const before = await info(bin, name);
					if (!before) return ctx.ui.notify(`rtw url ${name} failed.`, "error");

					if (existsSync(before.worktree)) {
						if (from) ctx.ui.notify(`${name} already exists; ignoring --from ${from}.`, "warning");
						if (before.state !== "running") {
							ctx.ui.notify(`Starting ${before.container}…`, "info");
							if ((await rtw(ctx, bin, ["up", name])) === undefined) return;
						}
					} else {
						ctx.ui.notify(`Creating worktree ${name} for ${branch}${from ? ` from ${from}` : ""} (Lucee takes ~30-60s)…`, "info");
						if ((await rtw(ctx, bin, ["new", branch, ...(from ? [from] : [])])) === undefined) return;
					}
					ctx.ui.notify(`${name} is up at ${before.url}`, "info");
					await enter(ctx, before.worktree, `worktree ${name} (${before.url})`, prompt);
				}
			}
		},
	});
}
