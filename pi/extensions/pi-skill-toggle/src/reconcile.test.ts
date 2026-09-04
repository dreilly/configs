import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, it } from "node:test";
import { DefaultSkillTogglePlanner } from "./apply/planner.ts";
import { AtomicSkillChangeWriter } from "./apply/writer.ts";
import { SimpleFrontmatterCodec } from "./frontmatter/parser.ts";
import { MinimalFrontmatterPatcher } from "./frontmatter/patcher.ts";
import type { SkillInventory } from "./inventory/loader.ts";
import { NodeFileSystem } from "./ports/fs.ts";
import { JsonSkillPreferenceStore } from "./preferences/store.ts";
import { reconcileSkillModes } from "./reconcile.ts";
import type { SkillRecord } from "./types.ts";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

describe("reconcileSkillModes", () => {
  it("reapplies a saved mode after an external update replaces SKILL.md", async () => {
    const dir = await mkdtemp(join(tmpdir(), "pi-skill-reconcile-"));
    temporaryDirectories.push(dir);
    const skillDir = join(dir, "skills", "handoff");
    const skillPath = join(skillDir, "SKILL.md");
    const preferencePath = join(dir, "skill-invocation.json");
    await mkdir(skillDir, { recursive: true });
    await writeFile(skillPath, skillContents(), "utf8");

    const skill: SkillRecord = {
      id: skillPath,
      name: "handoff",
      description: "Test skill",
      filePath: skillPath,
      baseDir: skillDir,
      source: { kind: "global", root: join(dir, "skills") },
      editable: true,
      mode: "agent-invocable",
      diagnostics: [],
    };
    const inventory: SkillInventory = { load: async () => [skill] };
    const fs = new NodeFileSystem();
    const codec = new SimpleFrontmatterCodec();
    const preferences = new JsonSkillPreferenceStore(preferencePath);
    await preferences.save({ version: 1, modes: { "global:handoff": "manual-only" } });
    const deps = {
      inventory,
      planner: new DefaultSkillTogglePlanner(fs, codec, new MinimalFrontmatterPatcher()),
      writer: new AtomicSkillChangeWriter(fs),
      preferences,
    };

    const first = await reconcileSkillModes(dir, deps);
    assert.equal(first.applyResult.applied.length, 1);
    assert.match(await readFile(skillPath, "utf8"), /^disable-model-invocation: true$/m);

    // Simulate an upstream installer replacing the complete skill file.
    await writeFile(skillPath, skillContents(), "utf8");
    const second = await reconcileSkillModes(dir, deps);
    assert.equal(second.applyResult.applied.length, 1);
    assert.match(await readFile(skillPath, "utf8"), /^disable-model-invocation: true$/m);
  });
});

function skillContents(): string {
  return "---\nname: handoff\ndescription: Test skill\n---\n\n# Handoff\n";
}
