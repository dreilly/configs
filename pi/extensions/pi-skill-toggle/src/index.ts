import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { AtomicSkillChangeWriter } from "./apply/writer.ts";
import { DefaultSkillTogglePlanner } from "./apply/planner.ts";
import { DefaultSkillLocator } from "./discovery/skill-locator.ts";
import { MinimalFrontmatterPatcher } from "./frontmatter/patcher.ts";
import { SimpleFrontmatterCodec } from "./frontmatter/parser.ts";
import { DefaultSkillInventory } from "./inventory/loader.ts";
import { NodeFileSystem } from "./ports/fs.ts";
import { runToggleSkillsCommand } from "./command.ts";
import { JsonSkillPreferenceStore } from "./preferences/store.ts";
import { reconcileSkillModes, type SkillModeReconcilerDeps } from "./reconcile.ts";

export default function piSkillToggle(pi: ExtensionAPI) {
  const fs = new NodeFileSystem();
  const codec = new SimpleFrontmatterCodec();
  const patcher = new MinimalFrontmatterPatcher();
  const locator = new DefaultSkillLocator(fs);
  const inventory = new DefaultSkillInventory(locator, fs, codec);
  const planner = new DefaultSkillTogglePlanner(fs, codec, patcher);
  const writer = new AtomicSkillChangeWriter(fs);
  const preferences = new JsonSkillPreferenceStore();
  const deps: SkillModeReconcilerDeps = { inventory, planner, writer, preferences };

  pi.on("resources_discover", async (event, ctx) => {
    try {
      const result = await reconcileSkillModes(event.cwd, deps);
      if (result.applyResult.applied.length > 0 && ctx.hasUI) {
        ctx.ui.notify(
          `Reapplied saved invocation modes to ${result.applyResult.applied.length} skill${result.applyResult.applied.length === 1 ? "" : "s"}.`,
          result.applyResult.errors.length > 0 ? "warning" : "info",
        );
      }
      if (result.applyResult.errors.length > 0 && ctx.hasUI) {
        ctx.ui.notify(formatErrors(result.applyResult.errors.map((error) => error.message)), "warning");
      }
    } catch (error) {
      if (ctx.hasUI) ctx.ui.notify(`Pi Skill Toggle reconciliation failed: ${errorMessage(error)}`, "warning");
    }
  });

  pi.registerCommand("toggle-skills", {
    description: "Configure persistent agent-invocable or manual-only skill modes",
    handler: async (_args, ctx) => {
      await runToggleSkillsCommand(ctx, { inventory, planner, writer, preferences });
    },
  });

  pi.registerCommand("sync-skill-modes", {
    description: "Reapply saved skill invocation modes after external updates",
    handler: async (_args, ctx) => {
      await runSyncCommand(ctx, deps);
    },
  });
}

async function runSyncCommand(ctx: ExtensionCommandContext, deps: SkillModeReconcilerDeps): Promise<void> {
  try {
    const result = await reconcileSkillModes(ctx.cwd, deps);
    const applied = result.applyResult.applied.length;
    const errors = result.applyResult.errors;
    const missing = result.missing.length;
    const summary = [
      `Skill modes: ${result.managed} managed, ${applied} reapplied`,
      missing > 0 ? `${missing} saved ${missing === 1 ? "skill is" : "skills are"} not currently installed` : "",
      errors.length > 0 ? `${errors.length} error${errors.length === 1 ? "" : "s"}` : "",
    ].filter(Boolean).join(" • ");
    ctx.ui.notify(summary, errors.length > 0 ? "warning" : "info");

    if (applied > 0) {
      await ctx.reload();
      return;
    }
  } catch (error) {
    ctx.ui.notify(`Pi Skill Toggle reconciliation failed: ${errorMessage(error)}`, "error");
  }
}

function formatErrors(errors: string[]): string {
  return `Skill mode errors:\n${errors.slice(0, 4).map((error) => `- ${error}`).join("\n")}`;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
