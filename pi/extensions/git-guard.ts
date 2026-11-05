/**
 * Git Guard
 *
 * Gates git commands the agent runs through the bash tool:
 *   - read-only commands (status, diff, log, show, blame, fetch, branch/tag listing, ...) run freely
 *   - anything that changes repo state (commit, push, reset, checkout, stash, add, ...) asks for confirmation
 *   - destructive commands (force push, reset --hard, clean, branch -D, commit --amend, ...) get a louder warning
 *   - with no UI (print/json mode, headless role agents) every non-read-only command is blocked
 *
 * Commands you type yourself with `!` are not affected (those are user_bash, not tool_call).
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

type Level = "read" | "write" | "danger";

interface GitInvocation {
	text: string;
	sub: string | undefined;
	args: string[];
	level: Level;
	why?: string;
}

// `git` in command position: start of string, after a separator / subshell / quote, optionally
// preceded by env assignments or wrappers like sudo/env/command/xargs.
const GIT_RE =
	/(?:^|[;&|(`'"\n{]|\$\()\s*(?:(?:[A-Za-z_][A-Za-z0-9_]*=\S*|sudo|command|exec|time|nohup|env|xargs(?:\s+-\S+)*)\s+)*(?:\S*\/)?git(?=\s|$|[;&|)`'"])/g;

const ALWAYS_READ = new Set([
	"status", "diff", "log", "show", "blame", "annotate", "rev-parse", "rev-list", "ls-files", "ls-tree",
	"ls-remote", "cat-file", "describe", "shortlog", "grep", "merge-base", "name-rev", "for-each-ref",
	"show-ref", "check-ignore", "check-attr", "check-ref-format", "whatchanged", "count-objects", "version",
	"help", "var", "diff-tree", "diff-files", "diff-index", "show-branch", "cherry", "range-diff",
	"verify-commit", "verify-tag", "fsck", "fetch",
]);

// Global options (before the subcommand) that consume the following token.
const GLOBAL_OPTS_WITH_VALUE = new Set(["-C", "-c", "--git-dir", "--work-tree", "--namespace", "--config-env", "--super-prefix"]);

/** Tokenize from `start` until an unquoted shell separator (or the given closing quote). */
function tokenize(src: string, start: number, closingQuote?: string): string[] {
	const tokens: string[] = [];
	let cur = "";
	let has = false;
	let quote: string | null = null;
	for (let i = start; i < src.length; i++) {
		const ch = src[i];
		if (quote) {
			if (ch === quote) quote = null;
			else if (ch === "\\" && quote === '"' && i + 1 < src.length) cur += src[++i];
			else cur += ch;
			continue;
		}
		if (closingQuote && ch === closingQuote) break;
		if (";&|\n)`".includes(ch)) break;
		if (ch === "'" || ch === '"') {
			quote = ch;
			has = true;
			continue;
		}
		if (ch === "\\" && i + 1 < src.length) {
			cur += src[++i];
			has = true;
			continue;
		}
		if (/\s/.test(ch)) {
			if (has) tokens.push(cur);
			cur = "";
			has = false;
			continue;
		}
		cur += ch;
		has = true;
	}
	if (has) tokens.push(cur);
	return tokens;
}

function positionals(args: string[], valueOpts: Set<string> = new Set()): string[] {
	const out: string[] = [];
	for (let i = 0; i < args.length; i++) {
		const a = args[i];
		if (a === "--") {
			out.push(...args.slice(i + 1));
			break;
		}
		if (a.startsWith("-")) {
			if (valueOpts.has(a)) i++;
			continue;
		}
		out.push(a);
	}
	return out;
}

const has = (args: string[], ...flags: string[]) =>
	args.some((a) => flags.includes(a) || flags.some((f) => f.startsWith("--") && a.startsWith(`${f}=`)));

/** Short-flag cluster check, e.g. `-fd` contains `f`. */
const hasShort = (args: string[], letter: string) => args.some((a) => /^-[A-Za-z]+$/.test(a) && a.includes(letter));

function classify(sub: string | undefined, args: string[]): { level: Level; why?: string } {
	if (!sub) return { level: "read" };
	if (ALWAYS_READ.has(sub)) return { level: "read" };

	switch (sub) {
		case "branch": {
			if (has(args, "-D", "--delete", "-f", "--force", "-M", "-C")) return { level: "danger", why: "force/delete branch" };
			if (has(args, "-d", "-m", "--move", "-c", "--copy", "-u", "--set-upstream-to", "--unset-upstream", "--edit-description", "-t", "--track"))
				return { level: "write" };
			if (has(args, "-l", "--list", "--show-current")) return { level: "read" };
			const vo = new Set(["--contains", "--no-contains", "--merged", "--no-merged", "--points-at", "--sort", "--format", "--color"]);
			return positionals(args, vo).length === 0 ? { level: "read" } : { level: "write" };
		}
		case "tag": {
			if (has(args, "-d", "--delete", "-f", "--force")) return { level: "danger", why: "force/delete tag" };
			if (has(args, "-l", "--list")) return { level: "read" };
			const vo = new Set(["--contains", "--no-contains", "--merged", "--no-merged", "--points-at", "--sort", "--format", "-m", "-F", "-u"]);
			return positionals(args, vo).length === 0 && !has(args, "-a", "-s", "-m", "-F") ? { level: "read" } : { level: "write" };
		}
		case "stash": {
			const action = args.find((a) => !a.startsWith("-"));
			if (action === "list" || action === "show") return { level: "read" };
			if (action === "drop" || action === "clear") return { level: "danger", why: `stash ${action} discards stashed work` };
			return { level: "write" };
		}
		case "remote": {
			const action = args.find((a) => !a.startsWith("-"));
			if (!action || action === "show" || action === "get-url") return { level: "read" };
			return { level: "write" };
		}
		case "config": {
			if (has(args, "--get", "--get-all", "--get-regexp", "--get-urlmatch", "--list", "-l", "--get-color", "--get-colorbool"))
				return { level: "read" };
			const pos = positionals(args, new Set(["--file", "-f", "--blob", "--type", "--default"]));
			if (pos[0] === "get" || pos[0] === "list") return { level: "read" };
			if (pos.length === 1 && !has(args, "--unset", "--unset-all", "--add", "--replace-all", "--rename-section", "--remove-section", "-e", "--edit"))
				return { level: "read" };
			return { level: "write", why: "changes git config" };
		}
		case "worktree": {
			const action = args.find((a) => !a.startsWith("-"));
			if (action === "list") return { level: "read" };
			if (action === "remove" || action === "prune") return { level: "danger", why: `worktree ${action}` };
			return { level: "write" };
		}
		case "reflog": {
			const action = args.find((a) => !a.startsWith("-"));
			if (!action || action === "show" || action === "exists") return { level: "read" };
			if (action === "expire" || action === "delete") return { level: "danger", why: `reflog ${action}` };
			return { level: "read" }; // `git reflog <ref>` == show
		}
		case "submodule": {
			const action = args.find((a) => !a.startsWith("-"));
			if (!action || action === "status" || action === "summary") return { level: "read" };
			return { level: "write" };
		}
		case "notes": {
			const action = args.find((a) => !a.startsWith("-"));
			if (!action || action === "list" || action === "show") return { level: "read" };
			return { level: "write" };
		}
		case "symbolic-ref": {
			if (has(args, "-d", "--delete")) return { level: "write" };
			return positionals(args).length <= 1 ? { level: "read" } : { level: "write" };
		}

		case "push": {
			if (has(args, "-f", "--force", "--force-with-lease", "--force-if-includes", "--mirror", "-d", "--delete", "--prune") || hasShort(args, "f"))
				return { level: "danger", why: "force/delete push" };
			if (positionals(args).some((a) => a.startsWith("+") || a.startsWith(":"))) return { level: "danger", why: "force/delete refspec" };
			return { level: "write" };
		}
		case "reset":
			if (has(args, "--hard", "--merge", "--keep")) return { level: "danger", why: "reset discards changes" };
			return { level: "write" };
		case "clean":
			return { level: "danger", why: "clean deletes untracked files" };
		case "checkout":
			if (has(args, "-f", "--force", "-B", "--") || positionals(args).includes(".")) return { level: "danger", why: "checkout can discard changes" };
			return { level: "write" };
		case "restore":
			if (has(args, "--staged", "-S") && !has(args, "--worktree", "-W")) return { level: "write" };
			return { level: "danger", why: "restore discards working-tree changes" };
		case "switch":
			if (has(args, "-C", "--force-create", "-f", "--force", "--discard-changes")) return { level: "danger", why: "switch can discard changes" };
			return { level: "write" };
		case "commit":
			if (has(args, "--amend")) return { level: "danger", why: "amend rewrites history" };
			if (has(args, "--no-verify", "-n")) return { level: "danger", why: "skips hooks" };
			return { level: "write" };
		case "rebase":
			return { level: "danger", why: "rebase rewrites history" };
		case "filter-branch":
		case "filter-repo":
		case "replace":
			return { level: "danger", why: "rewrites history" };
		case "update-ref":
			return has(args, "-d") ? { level: "danger", why: "deletes a ref" } : { level: "write" };
		case "gc":
		case "prune":
			return { level: "danger", why: "prunes objects" };
		case "rm":
			return has(args, "-f", "--force") || hasShort(args, "f") ? { level: "danger", why: "force removes files" } : { level: "write" };
		default:
			return { level: "write" };
	}
}

export function findGitInvocations(command: string): GitInvocation[] {
	const found: GitInvocation[] = [];
	GIT_RE.lastIndex = 0;
	let m: RegExpExecArray | null;
	while ((m = GIT_RE.exec(command))) {
		const lead = m[0].trimStart()[0];
		const closingQuote = lead === "'" || lead === '"' ? lead : undefined;
		const tokens = tokenize(command, m.index + m[0].length, closingQuote);

		let i = 0;
		while (i < tokens.length && tokens[i].startsWith("-")) {
			if (GLOBAL_OPTS_WITH_VALUE.has(tokens[i])) i++;
			i++;
		}
		const sub = tokens[i];
		const args = tokens.slice(i + 1);
		const { level, why } = classify(sub, args);
		const text = ["git", ...tokens].join(" ");
		found.push({ text: text.length > 200 ? `${text.slice(0, 200)}…` : text, sub, args, level, why });
	}
	return found;
}

export default function (pi: ExtensionAPI) {
	pi.on("tool_call", async (event, ctx) => {
		if (event.toolName !== "bash") return undefined;
		const command = String((event.input as { command?: unknown }).command ?? "");
		if (!/\bgit\b/.test(command)) return undefined;

		const gated = findGitInvocations(command).filter((g) => g.level !== "read");
		if (gated.length === 0) return undefined;

		const danger = gated.some((g) => g.level === "danger");
		const summary = gated.map((g) => `  ${g.level === "danger" ? "⚠️ " : "• "}${g.text}${g.why ? `   (${g.why})` : ""}`).join("\n");

		if (!ctx.hasUI) {
			return {
				block: true,
				reason: `git-guard: git commands that change repository state are blocked without an interactive user.\n${summary}\nDo not retry or work around this; report what you wanted to run.`,
			};
		}

		const title = danger ? "⚠️  DESTRUCTIVE git command — allow?" : "Agent wants to run a git command that changes the repo — allow?";
		const choice = await ctx.ui.select(`${title}\n\n${summary}\n\nFull command:\n  ${command.length > 500 ? `${command.slice(0, 500)}…` : command}`, [
			"No, block it",
			"Yes, allow once",
		]);

		if (choice !== "Yes, allow once") {
			return {
				block: true,
				reason: `git-guard: the user declined this git command.\n${summary}\nDo not retry it or work around the block (other flags, sh -c, aliases, scripts). Stop and ask the user how to proceed.`,
			};
		}
		return undefined;
	});
}
