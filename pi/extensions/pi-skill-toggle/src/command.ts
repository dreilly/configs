import type { ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import type { SkillInventory } from "./inventory/loader.ts";
import type { SkillTogglePlanner } from "./apply/planner.ts";
import type { SkillChangeWriter } from "./apply/writer.ts";
import { showSkillToggleUi } from "./ui/overlay.ts";
import type { ApplyResult } from "./types.ts";
import {
  mergeDraftPreferences,
  type SkillInvocationPreferences,
  type SkillPreferenceStore,
} from "./preferences/store.ts";

export interface ToggleSkillsCommandDeps {
  inventory: SkillInventory;
  planner: SkillTogglePlanner;
  writer: SkillChangeWriter;
  preferences: SkillPreferenceStore;
}

export async function runToggleSkillsCommand(ctx: ExtensionCommandContext, deps: ToggleSkillsCommandDeps): Promise<void> {
  if (ctx.mode !== "tui") {
    ctx.ui.notify("/toggle-skills requires interactive TUI mode", "error");
    return;
  }

  let skills;
  let preferences: SkillInvocationPreferences;
  try {
    [skills, preferences] = await Promise.all([
      deps.inventory.load(ctx.cwd),
      deps.preferences.load(),
    ]);
  } catch (error) {
    ctx.ui.notify(`Pi Skill Toggle failed to load: ${errorMessage(error)}`, "error");
    return;
  }

  if (skills.length === 0) {
    ctx.ui.notify("Pi Skill Toggle: no skills found in global, user, or project skill directories", "info");
    return;
  }

  const result = await showSkillToggleUi(ctx, skills, preferences);
  if (result.action !== "apply") return;

  let changes;
  const nextPreferences = mergeDraftPreferences(preferences, result.drafts);
  const preferencesChanged = !sameModes(preferences, nextPreferences);
  try {
    changes = await deps.planner.plan(skills, result.drafts);
    if (preferencesChanged) await deps.preferences.save(nextPreferences);
  } catch (error) {
    ctx.ui.notify(`Pi Skill Toggle failed to plan changes: ${errorMessage(error)}`, "error");
    return;
  }

  if (changes.length === 0 && !preferencesChanged) {
    ctx.ui.notify("Pi Skill Toggle: no changes to apply", "info");
    return;
  }

  const applied = await deps.writer.apply(changes);
  ctx.ui.notify(
    formatApplyResult(applied, preferencesChanged, deps.preferences.path),
    applied.errors.length > 0 ? "warning" : "info",
  );

  if (applied.applied.length > 0 || preferencesChanged) {
    await ctx.reload();
    return;
  }
}

function formatApplyResult(
  result: ApplyResult,
  preferencesChanged: boolean,
  preferencePath: string,
): string {
  const lines = [`Pi Skill Toggle applied ${result.applied.length} file change${result.applied.length === 1 ? "" : "s"}.`];
  if (preferencesChanged) lines.push(`Saved invocation policy to ${preferencePath}.`);
  for (const change of result.applied.slice(0, 6)) {
    lines.push(`- ${change.skill.name}: ${change.from} → ${change.to}`);
  }
  if (result.applied.length > 6) {
    lines.push(`- … ${result.applied.length - 6} more`);
  }
  if (result.errors.length > 0) {
    lines.push(`Errors/skipped: ${result.errors.length}`);
    for (const error of result.errors.slice(0, 4)) {
      lines.push(`- ${error.message}`);
    }
  }
  if (result.applied.length > 0 || preferencesChanged) {
    lines.push("Reloaded skills, prompts, extensions, and themes.");
  }
  return lines.join("\n");
}

function sameModes(a: SkillInvocationPreferences, b: SkillInvocationPreferences): boolean {
  const aEntries = Object.entries(a.modes).sort(([left], [right]) => left.localeCompare(right));
  const bEntries = Object.entries(b.modes).sort(([left], [right]) => left.localeCompare(right));
  return JSON.stringify(aEntries) === JSON.stringify(bEntries);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
