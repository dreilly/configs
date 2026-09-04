import { createHash, randomUUID } from "node:crypto";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { RoleAgent } from "./agents.ts";

// Herdr's split ratio is the share retained by the target pane. Keeping 80%
// makes the caller remain the largest pane even when several roles are opened.
const CALLER_PANE_RATIO = "0.8";

interface ExecResult {
	stdout: string;
	stderr: string;
	code: number;
}

export type ExecCommand = (
	command: string,
	args: string[],
	options?: { signal?: AbortSignal; timeout?: number },
) => Promise<ExecResult>;

export interface HerdrRunResult {
	surface: "herdr";
	role: string;
	task: string;
	agentName: string;
	paneId: string;
	workspaceId?: string;
	reused: boolean;
	waited: boolean;
	keepOpen: boolean;
	closed: boolean;
	status?: string;
	output?: string;
	closeError?: string;
	message: string;
}

function parseJson(text: string): any {
	try {
		return JSON.parse(text);
	} catch {
		return undefined;
	}
}

function sanitizeName(value: string): string {
	let name = value.toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "");
	if (!/^[a-z]/.test(name)) name = `role-${name}`;
	return name.slice(0, 32) || `role-${randomUUID().slice(0, 6)}`;
}

function paneFromResult(payload: any): { paneId?: string; workspaceId?: string } {
	const result = payload?.result;
	const pane = result?.pane ?? result?.root_pane ?? result?.workspace?.root_pane;
	return {
		paneId: pane?.pane_id,
		workspaceId: pane?.workspace_id ?? result?.workspace?.workspace_id,
	};
}

function promptFile(agent: RoleAgent): string {
	const uid = typeof process.getuid === "function" ? process.getuid() : "user";
	const dir = path.join(os.tmpdir(), `pi-role-agents-${uid}`, "prompts");
	fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
	const digest = createHash("sha256").update(agent.systemPrompt).digest("hex").slice(0, 12);
	const filePath = path.join(dir, `${sanitizeName(agent.name)}-${digest}.md`);
	if (!fs.existsSync(filePath)) fs.writeFileSync(filePath, agent.systemPrompt, { encoding: "utf8", mode: 0o600 });
	return filePath;
}

function buildPiArgs(agent: RoleAgent): string[] {
	const args: string[] = ["--name", `${agent.name} (Herdr)`];
	if (agent.model) args.push("--model", agent.model);
	if (agent.thinking) args.push("--thinking", agent.thinking);
	if (agent.tools.length > 0) args.push("--tools", agent.tools.join(","));
	else args.push("--no-tools");
	if (!agent.skills) args.push("--no-skills");
	if (!agent.contextFiles) args.push("--no-context-files");
	if (!agent.promptTemplates) args.push("--no-prompt-templates");
	args.push(agent.systemPromptMode === "append" ? "--append-system-prompt" : "--system-prompt", promptFile(agent));
	return args;
}

async function findReusableAgent(exec: ExecCommand, name: string, cwd: string, tabId: string, signal?: AbortSignal) {
	const result = await exec("herdr", ["agent", "get", name], { signal, timeout: 5000 });
	if (result.code !== 0) return undefined;
	const payload = parseJson(result.stdout);
	const record = payload?.result?.agent ?? payload?.result?.pane ?? payload?.result;
	if (!record?.pane_id || record.cwd !== cwd || record.tab_id !== tabId) return undefined;
	return { paneId: record.pane_id as string, workspaceId: record.workspace_id as string | undefined };
}

export async function runHerdrRole(options: {
	agent: RoleAgent;
	task: string;
	cwd: string;
	exec: ExecCommand;
	signal?: AbortSignal;
	wait?: boolean;
	timeoutMs?: number;
	direction?: "right" | "down";
	reuse?: boolean;
	keepOpen?: boolean;
}): Promise<HerdrRunResult> {
	if (process.env.HERDR_ENV !== "1") {
		throw new Error("Herdr surface requires running Pi inside a Herdr-managed pane (HERDR_ENV=1). ");
	}
	const currentTabId = process.env.HERDR_TAB_ID;
	if (!currentTabId) {
		throw new Error("Herdr did not provide HERDR_TAB_ID, so role-agents cannot safely create a pane in the current tab.");
	}

	const { agent, task, cwd, exec, signal } = options;
	const wait = options.wait ?? true;
	const keepOpen = options.keepOpen ?? false;
	const timeoutMs = options.timeoutMs ?? 300_000;
	const reuse = options.reuse ?? true;
	const tabSuffix = sanitizeName(currentTabId);
	let agentName = sanitizeName(`${agent.name}-${tabSuffix}`);
	let paneId: string | undefined;
	let workspaceId: string | undefined;
	let reused = false;

	if (reuse) {
		const existing = await findReusableAgent(exec, agentName, cwd, currentTabId, signal);
		if (existing) {
			paneId = existing.paneId;
			workspaceId = existing.workspaceId;
			reused = true;
		}
	}

	if (!paneId) {
		if (!reuse) agentName = sanitizeName(`${agent.name}-${tabSuffix}-${randomUUID().slice(0, 6)}`);
		// Herdr delegation is intentionally pane-only: split the caller's pane so the
		// role remains visible in the current tab. Never create a tab, workspace, or worktree here.
		const createResult = await exec(
			"herdr",
			["pane", "split", "--current", "--direction", options.direction ?? "right", "--ratio", CALLER_PANE_RATIO, "--cwd", cwd, "--no-focus"],
			{ signal, timeout: 10_000 },
		);
		if (createResult.code !== 0) throw new Error(createResult.stderr.trim() || "Herdr could not create a pane.");
		const created = paneFromResult(parseJson(createResult.stdout));
		paneId = created.paneId;
		workspaceId = created.workspaceId;
		if (!paneId) throw new Error(`Herdr created a surface but returned no pane id: ${createResult.stdout.trim()}`);

		let startResult: ExecResult | undefined;
		for (let attempt = 0; attempt < 25; attempt++) {
			startResult = await exec(
				"herdr",
				["agent", "start", agentName, "--kind", "pi", "--pane", paneId, "--timeout", "30000", "--", ...buildPiArgs(agent)],
				{ signal, timeout: 45_000 },
			);
			if (startResult.code === 0) break;
			const errorText = `${startResult.stderr}\n${startResult.stdout}`;
			if (!errorText.includes("agent_pane_busy")) break;
			await new Promise((resolve) => setTimeout(resolve, 200));
		}
		if (!startResult || startResult.code !== 0) {
			await exec("herdr", ["pane", "close", paneId], { timeout: 5000 });
			throw new Error(startResult?.stderr.trim() || startResult?.stdout.trim() || "Herdr could not start Pi.");
		}
	}

	const promptArgs = ["agent", "prompt", agentName, task];
	if (wait) promptArgs.push("--wait", "--timeout", String(timeoutMs));
	const promptResult = await exec("herdr", promptArgs, { signal, timeout: wait ? timeoutMs + 5000 : 15_000 });
	if (promptResult.code !== 0) throw new Error(promptResult.stderr.trim() || promptResult.stdout.trim() || "Herdr could not prompt the role agent.");

	const promptPayload = parseJson(promptResult.stdout);
	const settledAgent = promptPayload?.result?.agent;
	const status = settledAgent?.agent_status as string | undefined;
	let output: string | undefined;
	if (wait) {
		const readResult = await exec(
			"herdr",
			["agent", "read", agentName, "--source", "recent-unwrapped", "--lines", "200"],
			{ signal, timeout: 10_000 },
		);
		if (readResult.code === 0) output = readResult.stdout.trim();
	}

	const completed = wait && (status === "done" || status === "idle");
	const shouldClose = completed && !keepOpen && !reused;
	let closed = false;
	let closeError: string | undefined;
	if (shouldClose) {
		const closeResult = await exec("herdr", ["pane", "close", paneId], { timeout: 5000 });
		closed = closeResult.code === 0;
		if (!closed) closeError = closeResult.stderr.trim() || closeResult.stdout.trim() || "Herdr could not close the completed pane.";
	}

	const lifecycle = closed
		? " Captured its output and closed the completed pane."
		: completed && (keepOpen || reused)
			? " The completed pane remains open."
			: !wait
				? " The pane remains open because the call did not wait for completion."
				: status === "blocked"
					? " The blocked pane remains open for inspection."
					: "";

	return {
		surface: "herdr",
		role: agent.name,
		task,
		agentName,
		paneId,
		workspaceId,
		reused,
		waited: wait,
		keepOpen,
		closed,
		status,
		output,
		closeError,
		message: `${reused ? "Prompted existing" : "Started"} Herdr agent ${agentName} in ${paneId}${wait ? " and waited for it to settle" : ""}.${lifecycle}${closeError ? ` Cleanup warning: ${closeError}` : ""}`,
	};
}
