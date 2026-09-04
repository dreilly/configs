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
	skills: boolean;
	contextFiles: boolean;
	promptTemplates: boolean;
	systemPrompt: string;
	filePath: string;
}

const THINKING_LEVELS = new Set<ThinkingLevel>(["off", "minimal", "low", "medium", "high", "xhigh", "max"]);

type LocalModelOverrideConfig = {
	agents?: Record<string, unknown>;
	agentModels?: Record<string, unknown>;
	aliases?: Record<string, unknown>;
};

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

function modelCandidates(value: unknown): string[] {
	if (typeof value === "string") return [value.trim()].filter(Boolean);
	if (Array.isArray(value)) return value.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter(Boolean);
	if (value && typeof value === "object") {
		const model = stringValue((value as Record<string, unknown>).model);
		if (model) return [model];
		return modelCandidates((value as Record<string, unknown>).prefer);
	}
	return [];
}

function loadLocalModelOverrides(): LocalModelOverrideConfig {
	const agentDir = getAgentDir();
	const candidates = [path.join(agentDir, "agent-models.local.json")];
	try {
		const extensionDir = fs.realpathSync(path.join(agentDir, "extensions"));
		candidates.push(path.join(path.dirname(extensionDir), "agent-models.local.json"));
	} catch {
		// The extension directory may not exist in isolated tests.
	}

	for (const filePath of [...new Set(candidates)]) {
		try {
			return JSON.parse(fs.readFileSync(filePath, "utf8")) as LocalModelOverrideConfig;
		} catch {
			// Try the next location.
		}
	}
	return {};
}

function resolveAgentModel(agentName: string, configuredModel: string | undefined): string | undefined {
	const overrides = loadLocalModelOverrides();
	const agentEntry = overrides.agents?.[agentName] ?? overrides.agentModels?.[agentName];
	const override = modelCandidates(agentEntry)[0];
	if (override) return override;

	const configuredAlias = configuredModel ? modelCandidates(overrides.aliases?.[configuredModel])[0] : undefined;
	return configuredAlias ?? configuredModel;
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

	const configuredModel = stringValue(frontmatter.model);

	return {
		name,
		description,
		tools: listValue(frontmatter.tools),
		model: resolveAgentModel(name, configuredModel),
		thinking: thinkingValue && THINKING_LEVELS.has(thinkingValue) ? thinkingValue : undefined,
		systemPromptMode: promptMode === "append" ? "append" : "replace",
		skills: frontmatter.skills !== false,
		contextFiles: frontmatter.contextFiles !== false,
		promptTemplates: frontmatter.promptTemplates !== false,
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
