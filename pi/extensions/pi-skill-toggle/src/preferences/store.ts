import fs from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import type { SkillDraft, SkillInvocationMode, SkillRecord } from "../types.ts";

export interface SkillInvocationPreferences {
  version: 1;
  modes: Record<string, SkillInvocationMode>;
}

export interface SkillPreferenceStore {
  readonly path: string;
  load(): Promise<SkillInvocationPreferences>;
  save(preferences: SkillInvocationPreferences): Promise<void>;
}

export class JsonSkillPreferenceStore implements SkillPreferenceStore {
  readonly path: string;

  constructor(path = getSkillPreferencePath()) {
    this.path = path;
  }

  async load(): Promise<SkillInvocationPreferences> {
    let raw: string;
    try {
      raw = await fs.readFile(this.path, "utf8");
    } catch (error) {
      if (isNodeError(error) && error.code === "ENOENT") return emptyPreferences();
      throw error;
    }

    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed) || parsed.version !== 1 || !isRecord(parsed.modes)) {
      throw new Error(`${this.path}: expected { version: 1, modes: { ... } }`);
    }

    const modes: Record<string, SkillInvocationMode> = {};
    for (const [key, value] of Object.entries(parsed.modes)) {
      if (value !== "agent-invocable" && value !== "manual-only") {
        throw new Error(`${this.path}: invalid mode for ${key}: ${String(value)}`);
      }
      modes[key] = value;
    }

    return { version: 1, modes };
  }

  async save(preferences: SkillInvocationPreferences): Promise<void> {
    await fs.mkdir(dirname(this.path), { recursive: true });
    const tmp = join(dirname(this.path), `.skill-invocation-${process.pid}-${Date.now()}.tmp`);
    const sortedModes = Object.fromEntries(Object.entries(preferences.modes).sort(([a], [b]) => a.localeCompare(b)));
    await fs.writeFile(tmp, `${JSON.stringify({ version: 1, modes: sortedModes }, null, 2)}\n`, "utf8");
    await fs.rename(tmp, this.path);
  }
}

export function getSkillPreferencePath(): string {
  const configured = process.env.PI_SKILL_INVOCATION_CONFIG?.trim();
  if (configured) return expandHome(configured);
  return join(homedir(), ".agents", "skill-invocation.json");
}

export function skillPreferenceKey(skill: Pick<SkillRecord, "name" | "source">): string {
  if (skill.source.kind === "project" || skill.source.kind === "project-legacy") {
    return `${skill.source.kind}:${skill.source.root}:${skill.name}`;
  }
  return `${skill.source.kind}:${skill.name}`;
}

export function preferredMode(
  skill: SkillRecord,
  preferences: SkillInvocationPreferences,
): SkillInvocationMode {
  return preferences.modes[skillPreferenceKey(skill)] ?? skill.mode;
}

export function mergeDraftPreferences(
  preferences: SkillInvocationPreferences,
  drafts: SkillDraft[],
): SkillInvocationPreferences {
  const modes = { ...preferences.modes };

  for (const draft of drafts) {
    const key = skillPreferenceKey(draft.skill);
    if (modes[key] !== undefined || draft.desiredMode !== draft.skill.mode) {
      modes[key] = draft.desiredMode;
    }
  }

  return { version: 1, modes };
}

export function emptyPreferences(): SkillInvocationPreferences {
  return { version: 1, modes: {} };
}

function expandHome(input: string): string {
  if (input === "~") return homedir();
  if (input.startsWith("~/")) return join(homedir(), input.slice(2));
  return input;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}
