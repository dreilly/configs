import { spawn } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import type { Message } from "@earendil-works/pi-ai";
import type { RoleAgent } from "./agents.ts";

export interface UsageStats {
	input: number;
	output: number;
	cacheRead: number;
	cacheWrite: number;
	cost: number;
	turns: number;
}

export interface ActivityItem {
	type: "tool" | "text";
	name?: string;
	text: string;
	args?: Record<string, unknown>;
}

export interface HeadlessRunState {
	surface: "headless";
	role: string;
	task: string;
	status: "running" | "complete" | "failed";
	startedAt: number;
	endedAt?: number;
	model?: string;
	thinking?: string;
	activity: ActivityItem[];
	usage: UsageStats;
	output: string;
	stopReason?: string;
	errorMessage?: string;
	error?: string;
	exitCode?: number;
}

export type HeadlessUpdate = (state: HeadlessRunState) => void;

function getPiInvocation(args: string[]): { command: string; args: string[] } {
	const currentScript = process.argv[1];
	const isBunVirtualScript = currentScript?.startsWith("/$bunfs/root/");
	if (currentScript && !isBunVirtualScript && fs.existsSync(currentScript)) {
		return { command: process.execPath, args: [currentScript, ...args] };
	}

	const execName = path.basename(process.execPath).toLowerCase();
	if (!/^(node|bun)(\.exe)?$/.test(execName)) return { command: process.execPath, args };
	return { command: "pi", args };
}

function finalAssistantText(messages: Message[]): string {
	for (let index = messages.length - 1; index >= 0; index--) {
		const message = messages[index];
		if (message.role !== "assistant") continue;
		const texts = message.content.filter((part) => part.type === "text").map((part) => part.text);
		if (texts.length) return texts.join("\n");
	}
	return "";
}

function appendAssistantActivity(state: HeadlessRunState, message: Message): void {
	if (message.role !== "assistant") return;
	for (const part of message.content) {
		if (part.type === "toolCall") {
			state.activity.push({ type: "tool", name: part.name, text: part.name, args: part.arguments });
		} else if (part.type === "text" && part.text.trim()) {
			state.activity.push({ type: "text", text: part.text.trim() });
		}
	}

	state.usage.turns += 1;
	const usage = message.usage;
	if (usage) {
		state.usage.input += usage.input || 0;
		state.usage.output += usage.output || 0;
		state.usage.cacheRead += usage.cacheRead || 0;
		state.usage.cacheWrite += usage.cacheWrite || 0;
		state.usage.cost += usage.cost?.total || 0;
	}
	if (!state.model && message.model) state.model = message.model;
	state.stopReason = message.stopReason;
	state.errorMessage = message.errorMessage;
}

export async function runHeadlessRole(options: {
	agent: RoleAgent;
	task: string;
	cwd: string;
	signal?: AbortSignal;
	onUpdate?: HeadlessUpdate;
}): Promise<HeadlessRunState> {
	const { agent, task, cwd, signal, onUpdate } = options;
	const args = ["--mode", "json", "-p", "--no-session"];
	if (agent.model) args.push("--model", agent.model);
	if (agent.thinking) args.push("--thinking", agent.thinking);
	if (agent.tools.length > 0) args.push("--tools", agent.tools.join(","));
	else args.push("--no-tools");
	if (!agent.skills) args.push("--no-skills");
	if (!agent.contextFiles) args.push("--no-context-files");
	if (!agent.promptTemplates) args.push("--no-prompt-templates");
	args.push(agent.systemPromptMode === "append" ? "--append-system-prompt" : "--system-prompt", agent.systemPrompt);
	args.push(task);

	const state: HeadlessRunState = {
		surface: "headless",
		role: agent.name,
		task,
		status: "running",
		startedAt: Date.now(),
		model: agent.model,
		thinking: agent.thinking,
		activity: [],
		usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0, turns: 0 },
		output: "",
	};
	const messages: Message[] = [];
	const emit = () => onUpdate?.({ ...state, activity: [...state.activity], usage: { ...state.usage } });
	emit();

	const invocation = getPiInvocation(args);
	let stderr = "";
	let buffer = "";
	let aborted = false;

	const exitCode = await new Promise<number>((resolve) => {
		const proc = spawn(invocation.command, invocation.args, {
			cwd,
			shell: false,
			stdio: ["ignore", "pipe", "pipe"],
			env: { ...process.env, PI_OFFLINE: "1", PI_ROLE_AGENT: agent.name },
		});
		let exited = false;
		let forceKillTimer: NodeJS.Timeout | undefined;

		const removeAbortListener = () => signal?.removeEventListener("abort", abort);
		const finish = (code: number) => {
			exited = true;
			if (forceKillTimer) clearTimeout(forceKillTimer);
			removeAbortListener();
			resolve(code);
		};

		const processLine = (line: string) => {
			if (!line.trim()) return;
			let event: any;
			try {
				event = JSON.parse(line);
			} catch {
				return;
			}

			if (event.type === "message_end" && event.message) {
				const message = event.message as Message;
				messages.push(message);
				appendAssistantActivity(state, message);
				state.output = finalAssistantText(messages);
				emit();
			}
		};

		proc.stdout.on("data", (chunk) => {
			buffer += chunk.toString();
			const lines = buffer.split("\n");
			buffer = lines.pop() || "";
			for (const line of lines) processLine(line);
		});
		proc.stderr.on("data", (chunk) => {
			stderr += chunk.toString();
		});
		proc.on("error", (error) => {
			stderr += error.message;
			finish(1);
		});
		proc.on("close", (code) => {
			if (buffer.trim()) processLine(buffer);
			finish(code ?? 1);
		});

		function abort() {
			if (exited) return;
			aborted = true;
			proc.kill("SIGTERM");
			forceKillTimer = setTimeout(() => {
				if (!exited) proc.kill("SIGKILL");
			}, 3000);
			forceKillTimer.unref();
		}
		if (signal?.aborted) abort();
		else signal?.addEventListener("abort", abort, { once: true });
	});

	state.exitCode = exitCode;
	state.endedAt = Date.now();
	state.output = finalAssistantText(messages);
	if (aborted) {
		state.status = "failed";
		state.error = "Role agent was aborted.";
	} else if (exitCode !== 0) {
		state.status = "failed";
		state.error = stderr.trim() || state.errorMessage || `Pi exited with status ${exitCode}.`;
	} else if (state.stopReason === "error" || state.stopReason === "aborted") {
		state.status = "failed";
		state.error = state.errorMessage || `Role agent stopped with reason ${state.stopReason}.`;
	} else {
		state.status = "complete";
	}
	emit();
	return state;
}
