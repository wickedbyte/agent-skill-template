import { test } from "node:test";
import assert from "node:assert/strict";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { syncSkills } from "../src/opencode-plugin.js";

function makeFixture({ version = "1.0.0", skills = ["example-skill"] } = {}) {
  const root = mkdtempSync(join(tmpdir(), "skill-sync-"));
  const packageDir = join(root, "pkg");
  const targetDir = join(root, "target");
  for (const name of skills) {
    mkdirSync(join(packageDir, "skills", name), { recursive: true });
    writeFileSync(
      join(packageDir, "skills", name, "SKILL.md"),
      `---\nname: ${name}\ndescription: fixture\n---\n\n# ${name} v${version}\n`,
    );
  }
  writeFileSync(
    join(packageDir, "package.json"),
    `${JSON.stringify({ name: "@example/skill-pack", version }, null, 2)}\n`,
  );
  return { root, packageDir, targetDir };
}

const skillFile = (targetDir, name) => join(targetDir, name, "SKILL.md");
const manifestName = "example-skill-pack.sync.json";
const manifestPath = (targetDir) => join(targetDir, `.${manifestName}`);

try {
  test("fresh install copies bundled skills and records ownership", () => {
    const { packageDir, targetDir } = makeFixture();
    const result = syncSkills({ packageDir, targetDir });

    assert.deepEqual(result.installed, ["example-skill"]);
    assert.deepEqual(result.skipped, []);
    assert.equal(readFileSync(skillFile(targetDir, "example-skill"), "utf8").includes("v1.0.0"), true);

    const manifest = JSON.parse(readFileSync(manifestPath(targetDir), "utf8"));
    assert.equal(manifest.version, "1.0.0");
    assert.deepEqual(manifest.skills, ["example-skill"]);
  });

  test("same version is a no-op", () => {
    const { packageDir, targetDir } = makeFixture();
    syncSkills({ packageDir, targetDir });
    const result = syncSkills({ packageDir, targetDir });
    assert.deepEqual(result, { installed: [], skipped: [], removed: [] });
  });

  test("pre-existing foreign skill directory is never touched, and skipped", () => {
    const { packageDir, targetDir } = makeFixture();
    // User's own skill, installed by "other means", collides by name.
    mkdirSync(join(targetDir, "example-skill"), { recursive: true });
    writeFileSync(skillFile(targetDir, "example-skill"), "USER-OWNED CONTENT\n");

    const result = syncSkills({ packageDir, targetDir });

    // The user's content must survive verbatim.
    assert.equal(readFileSync(skillFile(targetDir, "example-skill"), "utf8"), "USER-OWNED CONTENT\n");
    // The bundled skill was NOT silently installed over it.
    assert.deepEqual(result.installed, []);
    assert.deepEqual(result.skipped, ["example-skill"]);
    // The manifest must not claim ownership of the foreign directory.
    const manifest = JSON.parse(readFileSync(manifestPath(targetDir), "utf8"));
    assert.deepEqual(manifest.skills, []);
  });

  test("upgrade replaces package-owned directory", () => {
    const { packageDir, targetDir } = makeFixture();
    syncSkills({ packageDir, targetDir });

    // Publish v2.0.0 with changed content.
    writeFileSync(
      join(packageDir, "skills", "example-skill", "SKILL.md"),
      "---\nname: example-skill\ndescription: fixture\n---\n\n# v2\n",
    );
    writeFileSync(
      join(packageDir, "package.json"),
      JSON.stringify({ name: "@example/skill-pack", version: "2.0.0" }),
    );

    const result = syncSkills({ packageDir, targetDir });
    assert.deepEqual(result.installed, ["example-skill"]);
    assert.equal(readFileSync(skillFile(targetDir, "example-skill"), "utf8").includes("# v2"), true);
  });

  test("upgrade removes skills dropped from the package, only if owned", () => {
    const { packageDir, targetDir } = makeFixture({ skills: ["example-skill", "obsolete-skill"] });
    syncSkills({ packageDir, targetDir });
    assert.equal(existsSync(skillFile(targetDir, "obsolete-skill")), true);

    // v2.0.0 drops obsolete-skill from the bundle.
    rmSync(join(packageDir, "skills", "obsolete-skill"), { recursive: true, force: true });
    writeFileSync(
      join(packageDir, "package.json"),
      JSON.stringify({ name: "@example/skill-pack", version: "2.0.0" }),
    );

    const result = syncSkills({ packageDir, targetDir });
    assert.deepEqual(result.removed, ["obsolete-skill"]);
    assert.equal(existsSync(skillFile(targetDir, "obsolete-skill")), false);
  });

  test("foreign directories are never removed on upgrade", () => {
    const { packageDir, targetDir } = makeFixture();
    // A totally unrelated foreign skill lives in the target dir.
    mkdirSync(join(targetDir, "my-native-skill"), { recursive: true });
    writeFileSync(skillFile(targetDir, "my-native-skill"), "FOREIGN\n");

    syncSkills({ packageDir, targetDir });
    writeFileSync(
      join(packageDir, "package.json"),
      JSON.stringify({ name: "@example/skill-pack", version: "2.0.0" }),
    );
    syncSkills({ packageDir, targetDir });

    assert.equal(readFileSync(skillFile(targetDir, "my-native-skill"), "utf8"), "FOREIGN\n");
  });

  test("corrupt manifest re-syncs without touching foreign directories", () => {
    const { packageDir, targetDir } = makeFixture();
    mkdirSync(targetDir, { recursive: true });
    writeFileSync(manifestPath(targetDir), "{not-json");
    mkdirSync(join(targetDir, "foreign"), { recursive: true });
    writeFileSync(skillFile(targetDir, "foreign"), "FOREIGN\n");

    const result = syncSkills({ packageDir, targetDir });
    assert.deepEqual(result.installed, ["example-skill"]);
    // Unrelated foreign folders are ignored, not skipped or removed.
    assert.deepEqual(result.skipped, []);
    assert.deepEqual(result.removed, []);
    assert.equal(readFileSync(skillFile(targetDir, "foreign"), "utf8"), "FOREIGN\n");
  });

  test("no bundled skills directory is a no-op", () => {
    const root = mkdtempSync(join(tmpdir(), "skill-sync-empty-"));
    const packageDir = join(root, "pkg");
    const targetDir = join(root, "target");
    mkdirSync(packageDir, { recursive: true });
    writeFileSync(join(packageDir, "package.json"), JSON.stringify({ name: "x", version: "1" }));
    const result = syncSkills({ packageDir, targetDir });
    assert.deepEqual(result, { installed: [], skipped: [], removed: [] });
    rmSync(root, { recursive: true, force: true });
  });
} finally {
  // Process-local cleanup is unnecessary; mkdtemp dirs are unique per test.
}
