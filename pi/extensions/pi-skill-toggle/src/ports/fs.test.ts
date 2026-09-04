import assert from "node:assert/strict";
import { lstat, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, it } from "node:test";
import { NodeFileSystem } from "./fs.ts";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

describe("NodeFileSystem", () => {
  it("atomically updates a symlink target without replacing the symlink", async () => {
    const dir = await mkdtemp(join(tmpdir(), "pi-skill-fs-"));
    temporaryDirectories.push(dir);
    const target = join(dir, "upstream-SKILL.md");
    const link = join(dir, "SKILL.md");
    await writeFile(target, "old", "utf8");
    await symlink(target, link);

    await new NodeFileSystem().writeFileAtomic(link, "new");

    assert.equal((await lstat(link)).isSymbolicLink(), true);
    assert.equal(await readFile(target, "utf8"), "new");
  });
});
