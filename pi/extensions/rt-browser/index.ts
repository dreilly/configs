/**
 * rt-browser
 *
 * Lets the agent log into RealTime SIS in a shared Chrome without ever seeing the credentials.
 *
 *  - One Chrome per target (see chrome.ts): the main checkout uses 127.0.0.1:9222; each rtw instance
 *    gets its own port and profile. This extension registers the chrome-devtools MCP (not mcp.json)
 *    with --browser-url for the session's target, so rt_login and the MCP drive the same browser and
 *    parallel worktree sessions never share one.
 *  - rt_login tool: reads ~/.config/realtime-test/login.env in-process, fills the login form and
 *    security question over CDP, returns only status/URL. Values never appear in tool args/results.
 *  - Guard: blocks any tool call that references the credentials file/dir.
 *  - Redaction: scrubs credential values from chrome-devtools MCP results and rt_login output
 *    (some RealTime pages echo the password into hidden inputs, e.g. prevalidateuser.cfm).
 *  - Auto-start: launches the shared Chrome before any chrome-devtools MCP call if it isn't running.
 *  - Districts: RT_BASE_URL may contain {district}. Default is realitdemo; `/rt-browser <district>`
 *    switches (and logs in), and rt_login takes an optional `district`.
 *  - Instances: `district@instance` targets an `rtw` worktree at https://<instance>.<RT_BASE_URL host>;
 *    `district@main` targets the main checkout. At session start the instance is detected from the
 *    cwd with `rtw url --json`, so a bare district uses the current worktree.
 *  - Permission: agent-initiated browser use (rt_login, chrome-devtools MCP) asks the user first and
 *    names the district. Running /rt-browser yourself approves that district for the session.
 */
import { realpathSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { browserSlot, DEFAULT_CHROME_THEME, ensureChrome, type InstanceTheme } from "./chrome.ts";
import {
	CREDS_DIR,
	CREDS_PATH,
	CredentialsError,
	DEFAULT_DISTRICT,
	MAIN_INSTANCE,
	parseTarget,
	previewLoginUrl,
	redact,
	redactDeep,
	type RtTarget,
	targetKey,
} from "./credentials.ts";
import { type LoginResult, LoginError, rtLogin, safeErrorMessage } from "./login.ts";
import { rtwUrl } from "./rtw.ts";

const MCP_PREFIX = "mcp__chrome_devtools__";
const MCP_SERVER = "chrome-devtools";
const TOOL_NAME = "rt_login";
const COMMAND_NAME = "rt-browser";
const STATUS_KEY = "rt-browser";

const DENY = "No, block it";
const ALLOW_ONCE = "Yes, allow once";
const ALLOW_SESSION = "Yes, allow for this session";

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const credPathPatterns = [...new Set(["realtime-test", "login.env", basename(CREDS_DIR), basename(CREDS_PATH)])].map(
	(s) => new RegExp(escapeRe(s), "i"),
);

/** This extension's own source files may mention the credential path; editing them is fine. */
const EXT_DIR = (() => {
	try {
		return realPath(dirname(fileURLToPath(import.meta.url)));
	} catch {
		return undefined;
	}
})();

/** Resolve symlinks (e.g. ~/.pi/agent/extensions -> ~/code/configs/pi/extensions), even for files that don't exist yet. */
function realPath(p: string): string {
	try {
		return realpathSync(p);
	} catch {
		const parent = dirname(p);
		return parent === p ? p : resolve(realPath(parent), basename(p));
	}
}

function isOwnSourceEdit(toolName: string, input: unknown): boolean {
	if (!EXT_DIR || !["read", "write", "edit"].includes(toolName)) return false;
	const p = (input as { path?: unknown })?.path;
	if (typeof p !== "string") return false;
	const abs = realPath(resolve(p.replace(/^~(?=\/)/, homedir())));
	return abs.startsWith(`${EXT_DIR}/`) && !abs.startsWith(`${realPath(CREDS_DIR)}/`);
}

function referencesCredentials(input: unknown): boolean {
	let text: string;
	try {
		text = JSON.stringify(input) ?? "";
	} catch {
		return false;
	}
	return credPathPatterns.some((re) => re.test(text));
}

function formatResult(r: LoginResult): string {
	const head = r.status === "already-logged-in" ? "✓ Already logged in" : "✓ Logged in";
	const where = r.instance ? `${r.district}@${r.instance}` : r.district;
	return [
		`${head} to RealTime SIS (target: ${where}, origin: ${r.origin}).`,
		`Current page: ${r.url}${r.title ? ` ("${r.title}")` : ""}`,
		r.steps.length ? `Steps: ${r.steps.join("; ")}` : "",
		`Browser: Chrome for this target at ${browserSlot(r.instance).url} (its own window/profile). Use chrome-devtools MCP list_pages/select_page to continue in this session; stay on ${r.origin}.`,
	]
		.filter(Boolean)
		.join("\n");
}

function loginErrorMessage(err: unknown): string {
	const known = err instanceof LoginError || err instanceof CredentialsError;
	return known ? safeErrorMessage(err) : `unexpected error: ${safeErrorMessage(err)}`;
}

function describeTarget(t: RtTarget): string {
	const url = previewLoginUrl(t);
	return url ? `${targetKey(t)}  (${url})` : targetKey(t);
}

const statusText = (t: RtTarget, loggedIn: boolean) =>
	`RT: ${loggedIn ? t.district : ""}${t.instance ? `${loggedIn ? " " : ""}@ ${t.instance}` : ""}`;

/**
 * Status text as a pill in the target browser's own colors (toolbar background, tab-strip-colored dot),
 * so this pi session and its Chrome window are easy to match up. Truecolor ANSI (the footer keeps
 * escape codes; it only strips newlines/tabs).
 */
function coloredStatus(text: string, theme: InstanceTheme): string {
	const rgb = (hex: string) => {
		const n = Number.parseInt(hex.slice(1), 16);
		return [(n >> 16) & 255, (n >> 8) & 255, n & 255] as const;
	};
	const [r, g, b] = rgb(theme.toolbar);
	const light = 0.299 * r + 0.587 * g + 0.114 * b > 150;
	const fg = light ? "\x1b[38;2;32;33;36m" : "\x1b[38;2;255;255;255m";
	const dot = light ? rgb(theme.frame) : rgb(theme.frame).map((c) => Math.min(255, c + 60));
	return (
		`\x1b[48;2;${r};${g};${b}m\x1b[38;2;${dot.join(";")}m ● ` +
		`${fg}\x1b[1m${text} \x1b[0m`
	);
}

/** Fail fast with a useful message when a worktree's container isn't up (skipped if rtw isn't available). */
async function checkInstanceRunning(t: RtTarget): Promise<void> {
	if (!t.instance) return;
	const info = await rtwUrl({ target: t.instance });
	if (info && info.state !== "running") {
		throw new LoginError(
			`Instance "${t.instance}" is not running (container ${info.container}: ${info.state}). Ask the user to run \`rtw up ${t.instance}\`.`,
		);
	}
}

type BlockResult = { block: true; reason: string };

export default function rtBrowser(pi: ExtensionAPI) {
	/** rtw instance detected from the cwd at session start (undefined = main checkout / not detected). */
	let detectedInstance: string | undefined;
	/** Where the browser is (or will be) logged in. A bare district keeps this instance. */
	let target: RtTarget = { district: DEFAULT_DISTRICT };
	let isLoggedIn = false;
	/** Targets (targetKey) the user approved rt_login for, for the rest of this session. */
	const approvedTargets = new Set<string>();
	/** Whether the user approved chrome-devtools MCP use for the rest of this session. */
	let browserApproved = false;
	/** Debugging port the chrome-devtools MCP is registered against. */
	let mcpPort: number | undefined;

	/**
	 * Point the chrome-devtools MCP at the target's own Chrome (one browser per rtw instance, so parallel
	 * sessions never share tabs). Re-registering replaces the earlier server and reconnects.
	 */
	const useBrowserFor = (ctx: ExtensionContext, instance: string | undefined) => {
		try {
			const slot = browserSlot(instance);
			if (slot.port === mcpPort) return;
			pi.registerMcpServer(MCP_SERVER, {
				command: "npx",
				args: ["-y", "chrome-devtools-mcp@latest", `--browser-url=${slot.url}`],
				description: "Chrome DevTools for the RealTime test browser of this session's target (use rt_login first).",
			});
			mcpPort = slot.port;
		} catch (err) {
			if (ctx.hasUI) ctx.ui.notify(`rt-browser: could not set up the browser: ${safeErrorMessage(err)}`, "error");
		}
	};

	// Parallel tool calls must not stack several permission dialogs; ask one at a time.
	let promptChain: Promise<unknown> = Promise.resolve();
	const oneAtATime = <T>(fn: () => Promise<T>): Promise<T> => {
		const next = promptChain.then(fn, fn);
		promptChain = next.catch(() => undefined);
		return next;
	};

	const setStatus = (ctx: ExtensionContext) => {
		if (!ctx.hasUI) return;
		if (!isLoggedIn && !target.instance) return ctx.ui.setStatus(STATUS_KEY, undefined);
		let theme = DEFAULT_CHROME_THEME;
		try {
			theme = browserSlot(target.instance).theme ?? DEFAULT_CHROME_THEME;
		} catch {
			// no browser slot (e.g. no free port): default gray
		}
		ctx.ui.setStatus(STATUS_KEY, coloredStatus(statusText(target, isLoggedIn), theme));
	};

	const resetState = async (ctx: ExtensionContext) => {
		approvedTargets.clear();
		browserApproved = false;
		isLoggedIn = false;
		const info = await rtwUrl({ cwd: ctx.cwd, timeoutMs: 5_000 }).catch(() => undefined);
		detectedInstance = info?.name || undefined;
		target = { district: DEFAULT_DISTRICT, instance: detectedInstance };
		mcpPort = undefined;
		useBrowserFor(ctx, target.instance);
		setStatus(ctx);
	};

	const loggedIn = (ctx: ExtensionContext, r: LoginResult) => {
		target = { district: r.district, instance: r.instance };
		isLoggedIn = true;
		useBrowserFor(ctx, r.instance);
		setStatus(ctx);
	};

	/** Asks the user (like git-guard). Returns undefined when allowed, or a block result. */
	async function askPermission(
		ctx: ExtensionContext,
		opts: { what: string; target: RtTarget; isApproved: () => boolean; approveSession: () => void },
	): Promise<BlockResult | undefined> {
		const key = targetKey(opts.target);
		if (!ctx.hasUI) {
			return {
				block: true,
				reason:
					`rt-browser: browser access needs approval from an interactive user (${opts.what}; target: ${key}). ` +
					`Do not retry; tell the user to run /${COMMAND_NAME} ${key} or approve it interactively.`,
			};
		}
		return oneAtATime(async (): Promise<BlockResult | undefined> => {
			if (opts.isApproved()) return undefined; // approved by an earlier dialog while this one waited
			const choice = await ctx.ui.select(
				`Agent wants to use your browser — allow?\n\n  ${opts.what}\n  Target: ${describeTarget(opts.target)}`,
				[DENY, ALLOW_ONCE, ALLOW_SESSION],
			);
			if (choice === ALLOW_SESSION) {
				opts.approveSession();
				return undefined;
			}
			if (choice === ALLOW_ONCE) return undefined;
			return {
				block: true,
				reason:
					`rt-browser: the user declined browser access (${opts.what}; target: ${key}). ` +
					"Do not retry or work around this. Stop and ask the user how to proceed.",
			};
		});
	}

	pi.on("session_start", async (_event, ctx) => resetState(ctx));

	// Tell the agent which host to use, so it doesn't navigate to the main checkout from a worktree.
	pi.on("before_agent_start", async (event) => {
		const url = previewLoginUrl(target);
		const origin = url ? new URL(url).origin : undefined;
		const lines = [
			`RealTime target for this session: ${targetKey(target)}${origin ? ` at ${origin}` : ""}` +
				(target.instance ? ` (rtw worktree instance "${target.instance}", not the main checkout).` : " (main checkout)."),
			origin ? `When navigating RealTime pages with chrome-devtools, use ${origin}, not another host.` : "",
			detectedInstance && detectedInstance !== target.instance
				? `This session's cwd is the rtw worktree "${detectedInstance}", but the user switched the target.`
				: "",
		].filter(Boolean);
		event.systemPromptOptions.sections.realtime_target = lines.join("\n");
	});

	pi.registerCommand(COMMAND_NAME, {
		description:
			`Open the shared Chrome and log into RealTime. Usage: /${COMMAND_NAME} [district][@instance|@${MAIN_INSTANCE}] [--force] ` +
			`(default: ${DEFAULT_DISTRICT}, instance detected from cwd)`,
		getArgumentCompletions: (prefix) => {
			const districts = [...new Set([DEFAULT_DISTRICT, "realtime", target.district])];
			const instances = [...new Set([detectedInstance, target.instance].filter((i): i is string => !!i)), MAIN_INSTANCE];
			const options = [
				...new Set([
					...districts,
					...districts.flatMap((d) => instances.map((i) => `${d}@${i}`)),
					...approvedTargets,
					"--force",
				]),
			];
			const last = (prefix.split(/\s+/).pop() ?? "").toLowerCase();
			const items = options.filter((o) => o.startsWith(last)).map((o) => ({ value: o, label: o }));
			return items.length ? items : null;
		},
		handler: async (args, ctx) => {
			const tokens = args.trim().split(/\s+/).filter(Boolean);
			const force = tokens.includes("--force");
			let next: RtTarget;
			try {
				next = parseTarget(tokens.find((t) => !t.startsWith("--")), { district: DEFAULT_DISTRICT, instance: target.instance });
			} catch (err) {
				ctx.ui.notify(safeErrorMessage(err), "error");
				return;
			}

			ctx.ui.notify(`Logging the browser into RealTime ${describeTarget(next)}…`, "info");
			try {
				await checkInstanceRunning(next);
				const r = await rtLogin({ ...next, force });
				// You ran it yourself: the agent may use the browser for this target without asking again.
				approvedTargets.add(targetKey(next));
				browserApproved = true;
				loggedIn(ctx, r);
				const text = redact(formatResult(r));
				ctx.ui.notify(text.split("\n")[0], "info");
				pi.sendMessage(
					{
						customType: COMMAND_NAME,
						content: `The user ran /${COMMAND_NAME}; the shared browser is logged into RealTime ${targetKey(next)} (${r.origin}).\n${text}`,
						display: true,
						details: { district: r.district, instance: r.instance, origin: r.origin, url: r.url },
					},
					{ triggerTurn: false },
				);
			} catch (err) {
				ctx.ui.notify(`/${COMMAND_NAME} ${targetKey(next)} failed: ${loginErrorMessage(err)}`, "error");
			}
		},
	});

	pi.registerTool({
		name: TOOL_NAME,
		label: "RealTime Login",
		description:
			"Log the shared Chrome browser into the local RealTime SIS test site using stored test credentials. " +
			"Handles the certificate warning, username/password, and security question. Credentials are never shown to you. " +
			"The user is asked to approve the login and sees the target URL. " +
			"Returns only the outcome and current page URL. Afterwards use the chrome-devtools MCP tools (same browser) to navigate and verify.",
		promptSnippet: "Log the shared browser into the local RealTime SIS test site (credentials stay hidden)",
		promptGuidelines: [
			"Before browser-verifying RealTime SIS pages, call rt_login; if a chrome-devtools page shows the RealTime login page or logout, call rt_login again.",
			`rt_login logs into the target the user last chose with /${COMMAND_NAME} (default ${DEFAULT_DISTRICT} on the rtw worktree instance detected from the cwd). Pass \`district\` only when the user asked for a specific district or instance.`,
			`\`district\` accepts \`district@instance\` for an rtw worktree (https://<instance>.sis.localhost) or \`district@${MAIN_INSTANCE}\` for the main checkout (https://sis.localhost).`,
			"Never try to read, print, or locate the RealTime test credentials (~/.config/realtime-test); rt_login handles them. Values shown as [REDACTED] are credentials.",
			"Do not type credentials into the browser yourself, and do not answer security questions manually.",
			"If rt_login reports a rejected security answer or locked/forced-password state, stop and tell the user; do not retry repeatedly.",
			"If the user declines browser access, stop and ask how to proceed; do not retry.",
		],
		parameters: Type.Object({
			district: Type.Optional(
				Type.String({
					description:
						`RealTime target: district path segment (e.g. ${DEFAULT_DISTRICT}, realtime), optionally with @instance ` +
						`(rtw worktree) or @${MAIN_INSTANCE}. Defaults to the current target.`,
				}),
			),
			force: Type.Optional(
				Type.Boolean({ description: "Log out first and perform a fresh login even if the current session is valid. Default false." }),
			),
		}),
		async execute(_id, params, signal, _onUpdate, ctx) {
			try {
				// tool_call rewrote params.district to the exact target the user approved.
				const next = parseTarget(params.district, target);
				await checkInstanceRunning(next);
				const r = await rtLogin({ ...next, force: params.force === true, signal });
				loggedIn(ctx, r);
				return {
					content: [{ type: "text" as const, text: formatResult(r) }],
					details: { status: r.status, district: r.district, instance: r.instance, origin: r.origin, url: r.url },
				};
			} catch (err) {
				throw new Error(`rt_login failed: ${loginErrorMessage(err)}`);
			}
		},
	});

	pi.on("tool_call", async (event, ctx) => {
		// 1) Keep the agent away from the credentials file.
		if (event.toolName !== TOOL_NAME && referencesCredentials(event.input) && !isOwnSourceEdit(event.toolName, event.input)) {
			return {
				block: true,
				reason:
					"rt-browser: access to the RealTime test credentials is blocked. Use the rt_login tool to log in; " +
					"do not read, list, copy, or search for the credentials file. Do not retry or work around this.",
			};
		}

		// 2) Ask before the agent logs the browser in, naming the target.
		if (event.toolName === TOOL_NAME) {
			const input = event.input as { district?: string; force?: boolean };
			let next: RtTarget;
			try {
				next = parseTarget(input.district, target);
			} catch (err) {
				return { block: true, reason: `rt_login: ${safeErrorMessage(err)}` };
			}
			const key = targetKey(next);
			// Pin execute() to exactly the approved target (explicit @main so it can't drift to another host).
			input.district = next.instance ? key : `${next.district}@${MAIN_INSTANCE}`;
			if (approvedTargets.has(key)) return undefined;
			return askPermission(ctx, {
				what: `Log into RealTime${input.force ? " (log out first, then fresh login)" : ""}`,
				target: next,
				isApproved: () => approvedTargets.has(key),
				approveSession: () => {
					approvedTargets.add(key);
					browserApproved = true;
				},
			});
		}

		// 3) Ask before the agent drives the browser, then make sure the shared Chrome is up.
		if (event.toolName.startsWith(MCP_PREFIX)) {
			if (!browserApproved) {
				const url = (event.input as { url?: unknown })?.url;
				const blocked = await askPermission(ctx, {
					what: `chrome-devtools: ${event.toolName.slice(MCP_PREFIX.length)}${typeof url === "string" ? ` → ${url}` : ""}`,
					target,
					isApproved: () => browserApproved,
					approveSession: () => {
						browserApproved = true;
					},
				});
				if (blocked) return blocked;
			}
			await ensureChrome(browserSlot(target.instance)).catch(() => undefined); // let the MCP report its own connection error
		}
		return undefined;
	});

	// 4) Scrub credential values from anything browser-related that flows back to the model.
	pi.on("tool_result", async (event) => {
		if (!event.toolName.startsWith(MCP_PREFIX) && event.toolName !== TOOL_NAME) return undefined;
		const [content, contentChanged] = redactDeep(event.content);
		const [structuredContent, scChanged] = redactDeep(event.structuredContent);
		if (!contentChanged && !scChanged) return undefined;
		return { content, structuredContent };
	});
}
