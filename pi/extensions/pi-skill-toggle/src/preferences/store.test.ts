import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, it } from "node:test";
import type { SkillRecord } from "../types.ts";
import {
  JsonSkillPreferenceStore,
  emptyPreferences,
  mergeDraftPreferences,
  preferredMode,
  skillPreferenceKey,
} from "./store.ts";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

describe("JsonSkillPreferenceStore", () => {
  it("round-trips modes in deterministic key order", async () => {
    const dir = await mkdtemp(join(tmpdir(), "pi-skill-preferences-"));
    temporaryDirectories.push(dir);
    const path = join(dir, "skill-invocation.json");
    const store = new JsonSkillPreferenceStore(path);

    await store.save({
      version: 1,
      modes: {
        "user:zeta": "agent-invocable",
        "global:alpha": "manual-only",
      },
    });

    assert.deepEqual(await store.load(), {
      version: 1,
      modes: {
        "global:alpha": "manual-only",
        "user:zeta": "agent-invocable",
      },
    });
    assert.match(await readFile(path, "utf8"), /global:alpha[\s\S]*user:zeta/);
  });

  it("returns empty preferences when the file does not exist", async () => {
    const dir = await mkdtemp(join(tmpdir(), "pi-skill-preferences-"));
    temporaryDirectories.push(dir);
    const store = new JsonSkillPreferenceStore(join(dir, "missing.json"));

    assert.deepEqual(await store.load(), emptyPreferences());
  });
});

describe("skill preference helpers", () => {
  it("keys global preferences by source scope and skill name", () => {
    const skill = makeSkill("handoff", "manual-only");
    assert.equal(skillPreferenceKey(skill), "global:handoff");
  });

  it("includes the root in project preference keys", () => {
    const skill = makeSkill("repo-helper", "manual-only");
    skill.source = { kind: "project", root: "/code/one/.pi/skills" };
    assert.equal(skillPreferenceKey(skill), "project:/code/one/.pi/skills:repo-helper");
  });

  it("uses managed policy instead of the current frontmatter mode", () => {
    const skill = makeSkill("handoff", "agent-invocable");
    assert.equal(preferredMode(skill, {
      version: 1,
      modes: { "global:handoff": "manual-only" },
    }), "manual-only");
  });

  it("only starts managing skills whose desired mode changes", () => {
    const handoff = makeSkill("handoff", "agent-invocable");
    const visual = makeSkill("visual-explainer", "agent-invocable");
    const result = mergeDraftPreferences(emptyPreferences(), [
      { skill: handoff, desiredMode: "manual-only" },
      { skill: visual, desiredMode: "agent-invocable" },
    ]);

    assert.deepEqual(result.modes, { "global:handoff": "manual-only" });
  });
});

function makeSkill(name: string, mode: SkillRecord["mode"]): SkillRecord {
  return {
    id: `/skills/${name}/SKILL.md`,
    name,
    description: "Test skill",
    filePath: `/skills/${name}/SKILL.md`,
    baseDir: `/skills/${name}`,
    source: { kind: "global", root: "/skills" },
    editable: true,
    mode,
    diagnostics: [],
  };
}
