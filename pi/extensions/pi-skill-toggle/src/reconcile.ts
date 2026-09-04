import type { SkillTogglePlanner } from "./apply/planner.ts";
import type { SkillChangeWriter } from "./apply/writer.ts";
import type { SkillInventory } from "./inventory/loader.ts";
import type { ApplyResult, SkillDraft } from "./types.ts";
import { preferredMode, skillPreferenceKey, type SkillPreferenceStore } from "./preferences/store.ts";

export interface SkillModeReconcilerDeps {
  inventory: SkillInventory;
  planner: SkillTogglePlanner;
  writer: SkillChangeWriter;
  preferences: SkillPreferenceStore;
}

export interface ReconcileResult {
  applyResult: ApplyResult;
  managed: number;
  missing: string[];
}

export async function reconcileSkillModes(cwd: string, deps: SkillModeReconcilerDeps): Promise<ReconcileResult> {
  const [skills, preferences] = await Promise.all([
    deps.inventory.load(cwd),
    deps.preferences.load(),
  ]);
  const foundKeys = new Set<string>();
  const drafts: SkillDraft[] = [];

  for (const skill of skills) {
    const key = skillPreferenceKey(skill);
    if (preferences.modes[key] === undefined) continue;
    foundKeys.add(key);
    drafts.push({ skill, desiredMode: preferredMode(skill, preferences) });
  }

  const changes = await deps.planner.plan(skills, drafts);
  const applyResult = await deps.writer.apply(changes);
  const missing = Object.keys(preferences.modes).filter((key) => !foundKeys.has(key)).sort();

  return { applyResult, managed: drafts.length, missing };
}
