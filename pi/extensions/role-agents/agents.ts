import * as fs from "node:fs";
import * as path from "node:path";
import { getAgentDir, parseFrontmatter } from "@earendil-works/pi-coding-agent";

export type ThinkingLevel = "off" | "minimal" | "low" | "medium" | "high" | "xhigh" | "max";
export type SystemPromptMode = "replace" | "append";

export interface RoleAgent {
	name: string;
	description: string;
	tools: string[];
	model?: string;
	thinking?: ThinkingLevel;
	systemPromptMode: SystemPromptMode;
	systemPrompt: string;
	filePath: string;
}

const THINKING_LEVELS = new Set<ThinkingLevel>(["off", "minimal", "low", "medium", "high", "xhigh", "max"]);

function stringValue(value: unknown): string | undefined {
	return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function listValue(value: unknown): string[] {
	if (Array.isArray(value)) {
		return value.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter(Boolean);
	}
	if (typeof value === "string") {
		return value.split(",").map((item) => item.trim()).filter(Boolean);
	}
	return [];
}

function loadAgent(filePath: string): RoleAgent | undefined {
	let content: string;
	try {
		content = fs.readFileSync(filePath, "utf8");
	} catch {
		return undefined;
	}

	const { frontmatter, body } = parseFrontmatter<Record<string, unknown>>(content);
	const name = stringValue(frontmatter.name);
	const description = stringValue(frontmatter.description);
	if (!name || !description || !body.trim()) return undefined;

	const thinkingValue = stringValue(frontmatter.thinking) as ThinkingLevel | undefined;
	const promptMode = stringValue(frontmatter.systemPromptMode);

	return {
		name,
		description,
		tools: listValue(frontmatter.tools),
		model: stringValue(frontmatter.model),
		thinking: thinkingValue && THINKING_LEVELS.has(thinkingValue) ? thinkingValue : undefined,
		systemPromptMode: promptMode === "append" ? "append" : "replace",
		systemPrompt: body.trim(),
		filePath,
	};
}

export function discoverRoleAgents(): RoleAgent[] {
	const dir = path.join(getAgentDir(), "agents");
	if (!fs.existsSync(dir)) return [];

	const agents: RoleAgent[] = [];
	for (const entry of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
		if (!entry.name.endsWith(".md") || (!entry.isFile() && !entry.isSymbolicLink())) continue;
		const agent = loadAgent(path.join(dir, entry.name));
		if (agent) agents.push(agent);
	}
	return agents;
}

export function findRoleAgent(name: string): RoleAgent | undefined {
	return discoverRoleAgents().find((agent) => agent.name.toLowerCase() === name.trim().toLowerCase());
}
