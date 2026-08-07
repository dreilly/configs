import * as os from "node:os";
import * as path from "node:path";
import type { AgentToolResult } from "@earendil-works/pi-agent-core";
import { StringEnum } from "@earendil-works/pi-ai";
import { type ExtensionAPI, getMarkdownTheme } from "@earendil-works/pi-coding-agent";
import { Container, Markdown, Spacer, Text } from "@earendil-works/pi-tui";
import { Type } from "typebox";
import { discoverRoleAgents, findRoleAgent } from "./agents.ts";
import { type ActivityItem, type HeadlessRunState, runHeadlessRole } from "./headless-runner.ts";
import { type HerdrRunResult, runHerdrRole } from "./herdr-runner.ts";

const OUTPUT_CAP_BYTES = 50 * 1024;
const COLLAPSED_ACTIVITY_COUNT = 8;

type RoleAgentDetails = HeadlessRunState | HerdrRunResult | { surface: "error"; available: string[] };

const RoleAgentParams = Type.Object({
	role: Type.String({ description: "Role name from ~/.pi/agent/agents, such as scout, researcher, or worker." }),
	task: Type.String({ description: "Focused task for the role agent." }),
	surface: Type.Optional(
		StringEnum(["headless", "herdr"] as const, {
			description: "headless returns a streamed result inline. herdr opens or reuses a visible Pi pane and must only be used when the user explicitly asks for Herdr or a visible agent.",
			default: "headless",
		}),
	),
	cwd: Type.Optional(Type.String({ description: "Working directory. Defaults to the parent Pi cwd." })),
	wait: Type.Optional(Type.Boolean({ description: "For Herdr, wait for the agent to settle and return recent pane output. Default true." })),
	reuse: Type.Optional(Type.Boolean({ description: "For Herdr, reuse the named role pane in this workspace when possible. Default true." })),
	keepOpen: Type.Optional(Type.Boolean({ description: "For Herdr, keep a successfully completed pane open. Default false for newly created non-worktree panes." })),
	worktree: Type.Optional(Type.Boolean({ description: "For Herdr, create an isolated worktree workspace. Use for parallel writers." })),
	direction: Type.Optional(StringEnum(["right", "down"] as const, { description: "Herdr split direction. Default right." })),
	timeoutMs: Type.Optional(Type.Integer({ minimum: 1000, maximum: 3_600_000, description: "Herdr wait deadline in milliseconds." })),
});

function formatTokens(value: number): string {
	if (value < 1000) return String(value);
	if (value < 1_000_000) return `${(value / 1000).toFixed(value < 10_000 ? 1 : 0)}k`;
	return `${(value / 1_000_000).toFixed(1)}M`;
}

function formatDuration(state: HeadlessRunState): string {
	const milliseconds = (state.endedAt ?? Date.now()) - state.startedAt;
	return milliseconds < 60_000 ? `${(milliseconds / 1000).toFixed(1)}s` : `${(milliseconds / 60_000).toFixed(1)}m`;
}

function shortenPath(value: string): string {
	const home = os.homedir();
	return value.startsWith(home) ? `~${value.slice(home.length)}` : value;
}

function activityText(item: ActivityItem): string {
	if (item.type === "text") return item.text.split("\n")[0].slice(0, 120);
	const args = item.args ?? {};
	switch (item.name) {
		case "read":
		case "write":
		case "edit":
			return `${item.name} ${shortenPath(String(args.path ?? args.file_path ?? ""))}`.trim();
		case "grep":
			return `grep /${String(args.pattern ?? "")}/ in ${shortenPath(String(args.path ?? "."))}`;
		case "find":
			return `find ${String(args.pattern ?? "*")} in ${shortenPath(String(args.path ?? "."))}`;
		case "ls":
			return `ls ${shortenPath(String(args.path ?? "."))}`;
		case "bash": {
			const command = String(args.command ?? "");
			return `$ ${command.length > 100 ? `${command.slice(0, 100)}…` : command}`;
		}
		case "websearch":
			return `websearch ${JSON.stringify(String(args.query ?? ""))}`;
		case "webfetch":
			return `webfetch ${String(args.url ?? "")}`;
		default:
			return `${item.name ?? "tool"} ${JSON.stringify(args).slice(0, 100)}`;
	}
}

function truncateOutput(value: string): string {
	if (Buffer.byteLength(value, "utf8") <= OUTPUT_CAP_BYTES) return value;
	let output = value.slice(0, OUTPUT_CAP_BYTES);
	while (Buffer.byteLength(output, "utf8") > OUTPUT_CAP_BYTES) output = output.slice(0, -1);
	return `${output}\n\n[Output truncated to ${formatTokens(OUTPUT_CAP_BYTES)}B.]`;
}

function renderHeadless(state: HeadlessRunState, expanded: boolean, theme: any) {
	const icon = state.status === "running" ? theme.fg("warning", "⏳") : state.status === "complete" ? theme.fg("success", "✓") : theme.fg("error", "✗");
	const header = `${icon} ${theme.fg("toolTitle", theme.bold(state.role))} ${theme.fg("muted", `${state.status} · ${formatDuration(state)}`)}`;
	const usage = `${state.usage.turns} turns ↑${formatTokens(state.usage.input)} ↓${formatTokens(state.usage.output)}${state.usage.cost ? ` $${state.usage.cost.toFixed(4)}` : ""}${state.model ? ` · ${state.model}` : ""}`;

	if (!expanded) {
		const recent = state.activity.slice(-COLLAPSED_ACTIVITY_COUNT);
		let text = header;
		if (state.activity.length > recent.length) text += `\n${theme.fg("muted", `… ${state.activity.length - recent.length} earlier events`)}`;
		for (const item of recent) text += `\n${theme.fg(item.type === "tool" ? "accent" : "toolOutput", `${item.type === "tool" ? "→ " : "  "}${activityText(item)}`)}`;
		if (state.error) text += `\n${theme.fg("error", state.error)}`;
		text += `\n${theme.fg("dim", usage)}`;
		if (state.status !== "running" && state.output) text += `\n${theme.fg("muted", "Ctrl+O to view full output")}`;
		return new Text(text, 0, 0);
	}

	const container = new Container();
	container.addChild(new Text(header, 0, 0));
	container.addChild(new Text(theme.fg("dim", usage), 0, 0));
	container.addChild(new Spacer(1));
	container.addChild(new Text(theme.fg("muted", "Activity"), 0, 0));
	for (const item of state.activity) container.addChild(new Text(`${item.type === "tool" ? "→ " : "  "}${activityText(item)}`, 0, 0));
	if (state.error) container.addChild(new Text(theme.fg("error", state.error), 0, 0));
	if (state.output) {
		container.addChild(new Spacer(1));
		container.addChild(new Text(theme.fg("muted", "Final output"), 0, 0));
		container.addChild(new Markdown(state.output, 0, 0, getMarkdownTheme()));
	}
	return container;
}

export default function roleAgentsExtension(pi: ExtensionAPI) {
	pi.registerTool({
		name: "role_agent",
		label: "Role Agent",
		description: [
			"Run one focused role defined in ~/.pi/agent/agents.",
			"Use headless for short independent scout/research tasks whose final answer is enough.",
			"Do not delegate routine work that the parent can perform directly.",
			"Use the herdr surface only when the user explicitly asks for Herdr, a visible pane, or a persistent agent.",
			"Parallelism comes from issuing independent role_agent calls in the same turn; roles cannot spawn other roles.",
		].join(" "),
		promptSnippet: "Run a focused Markdown-defined role headlessly or in an explicitly requested Herdr pane",
		parameters: RoleAgentParams,

		async execute(_toolCallId, params, signal, onUpdate, ctx) {
			const agent = findRoleAgent(params.role);
			if (!agent) {
				const available = discoverRoleAgents().map((item) => item.name);
				return {
					content: [{ type: "text", text: `Unknown role ${JSON.stringify(params.role)}. Available roles: ${available.join(", ") || "none"}.` }],
					details: { surface: "error", available } satisfies RoleAgentDetails,
					isError: true,
				};
			}

			const cwd = path.resolve(ctx.cwd, params.cwd ?? ".");
			if ((params.surface ?? "headless") === "herdr") {
				try {
					const result = await runHerdrRole({
						agent,
						task: params.task,
						cwd,
						exec: (command, args, options) => pi.exec(command, args, options),
						signal,
						wait: params.wait,
						reuse: params.reuse,
						keepOpen: params.keepOpen,
						worktree: params.worktree,
						direction: params.direction,
						timeoutMs: params.timeoutMs,
					});
					const output = result.output ? `\n\nRecent pane output:\n${result.output}` : "";
					return { content: [{ type: "text", text: `${result.message}${output}` }], details: result };
				} catch (error) {
					return {
						content: [{ type: "text", text: error instanceof Error ? error.message : String(error) }],
						details: { surface: "error", available: discoverRoleAgents().map((item) => item.name) } satisfies RoleAgentDetails,
						isError: true,
					};
				}
			}

			const result = await runHeadlessRole({
				agent,
				task: params.task,
				cwd,
				signal,
				onUpdate: (state) => {
					onUpdate?.({
						content: [{ type: "text", text: state.output || `${state.role}: ${state.status}` }],
						details: state,
					} as AgentToolResult<RoleAgentDetails>);
				},
			});
			return {
				content: [{ type: "text", text: truncateOutput(result.output || result.error || "(no output)") }],
				details: result,
				isError: result.status === "failed",
			};
		},

		renderCall(args, theme) {
			const surface = args.surface ?? "headless";
			const role = typeof args.role === "string" ? args.role : "…";
			const task = typeof args.task === "string" ? args.task : "…";
			const preview = task.length > 80 ? `${task.slice(0, 80)}…` : task;
			return new Text(`${theme.fg("toolTitle", theme.bold("role_agent "))}${theme.fg("accent", role)} ${theme.fg("muted", `[${surface}]`)}\n  ${theme.fg("dim", preview)}`, 0, 0);
		},

		renderResult(result, { expanded }, theme) {
			const details = result.details as RoleAgentDetails | undefined;
			if (details?.surface === "headless") return renderHeadless(details, expanded, theme);
			if (details?.surface === "herdr") {
				const icon = theme.fg("success", "✓");
				let text = `${icon} ${theme.fg("toolTitle", theme.bold(details.role))} ${theme.fg("muted", "in Herdr")}\n${theme.fg("accent", details.agentName)} ${theme.fg("dim", `· ${details.paneId}${details.reused ? " · reused" : " · new"}${details.closed ? " · closed" : " · open"}`)}`;
				if (expanded && details.output) text += `\n\n${details.output}`;
				else if (details.output) text += `\n${theme.fg("muted", "Ctrl+O to view recent pane output")}`;
				return new Text(text, 0, 0);
			}
			const first = result.content[0];
			return new Text(first?.type === "text" ? first.text : "Role agent failed.", 0, 0);
		},
	});
}
