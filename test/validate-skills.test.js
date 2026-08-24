import { test } from "node:test";
import assert from "node:assert/strict";
import { checkManifests, parseFrontmatter } from "../scripts/validate-skills.mjs";

test("parseFrontmatter: folded and literal block scalars, including indicators", () => {
  const raw = [
    "---",
    "name: example",
    "description: >-",
    "  A folded",
    "  description.",
    "notes: |2",
    "  literal",
    "  text",
    "---",
    "",
    "# Body",
  ].join("\n");
  const { fields, errors, warnings } = parseFrontmatter(raw, "SKILL.md");
  assert.deepEqual(errors, []);
  assert.equal(warnings.length, 0, JSON.stringify(warnings));
  assert.equal(fields.name, "example");
  assert.equal(fields.description, "A folded description.");
  assert.equal(fields.notes, "literal\ntext");
});

test("parseFrontmatter: nested metadata map with string values", () => {
  const raw = ["---", "name: example", "metadata:", "  author: your-org", "  version: \"0.1.0\"", "---"].join("\n");
  const { fields, errors } = parseFrontmatter(raw, "SKILL.md");
  assert.deepEqual(errors, []);
  assert.deepEqual(fields.metadata, { author: "your-org", version: "0.1.0" });
});

test("parseFrontmatter: inline metadata map (valid YAML) is parsed as a map", () => {
  const raw = ["---", "name: example", "metadata: { author: your-org, version: \"1.0\" }", "---"].join("\n");
  const { fields, errors } = parseFrontmatter(raw, "SKILL.md");
  assert.deepEqual(errors, []);
  assert.deepEqual(fields.metadata, { author: "your-org", version: "1.0" });
});

test("parseFrontmatter: non-string metadata values are rejected", () => {
  const raw = ["---", "name: example", "metadata: { version: 1 }", "---"].join("\n");
  const { errors } = parseFrontmatter(raw, "SKILL.md");
  assert.equal(errors.length, 1);
  assert.match(errors[0], /metadata/i);
});

test("parseFrontmatter: missing terminator is an error", () => {
  const { fields, errors } = parseFrontmatter("---\nname: x\n", "SKILL.md");
  assert.equal(fields, null);
  assert.ok(errors.length > 0);
});

test("checkManifests: consistent versions pass", () => {
  const { errors, warnings } = checkManifests({
    pkg: { version: "0.2.0", exports: "./src/opencode-plugin.js", files: ["src", "skills"] },
    plugin: { name: "x", version: "0.2.0" },
    marketplace: { plugins: [{ name: "x", version: "0.2.0" }] },
  });
  assert.deepEqual(errors, []);
  assert.deepEqual(warnings, []);
});

test("checkManifests: package/plugin version mismatch is an error", () => {
  const { errors } = checkManifests({
    pkg: { version: "0.2.0" },
    plugin: { name: "x", version: "0.1.0" },
  });
  assert.equal(errors.length, 1);
  assert.match(errors[0], /version mismatch/);
});

test("checkManifests: marketplace/plugin version mismatch is an error", () => {
  const { errors } = checkManifests({
    plugin: { name: "x", version: "0.2.0" },
    marketplace: { plugins: [{ name: "x", version: "0.1.0" }] },
  });
  assert.equal(errors.length, 1);
  assert.match(errors[0], /version mismatch/);
});

test("checkManifests: plugin.json missing version is an error", () => {
  const { errors } = checkManifests({ plugin: { name: "x" } });
  assert.ok(errors.some((e) => /version/i.test(e)));
});

test("checkManifests: tolerates absent manifests (warn-only cases handled by caller)", () => {
  const { errors, warnings } = checkManifests({});
  assert.deepEqual(errors, []);
  assert.deepEqual(warnings, []);
});
