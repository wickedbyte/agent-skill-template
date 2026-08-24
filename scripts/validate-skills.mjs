#!/usr/bin/env node
/**
 * Zero-dependency validator for Agent Skills (https://agentskills.io/specification)
 * and the Claude plugin manifests in this repository.
 *
 * Usage: node scripts/validate-skills.mjs
 * Exits non-zero on errors; warnings are advisory.
 *
 * The YAML-subset parser below intentionally covers only what the Agent Skills
 * spec's frontmatter needs:
 *   key: value            (plain and quoted scalars)
 *   key: >|>|->-|-        (folded/literal block scalars, + chomping, indicator digits)
 *   key:                  (nested one-level map, e.g. metadata)
 *   key: { a: b, c: d }   (inline one-level map)
 * Anything outside that subset is reported as an unparsed line (warning) or a
 * spec violation (error), never silently ignored.
 */
import { readdirSync, readFileSync, statSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const skillsDir = join(repoRoot, "skills");

// The spec requires: 1-64 chars, lowercase alphanumerics and hyphens,
// no leading/trailing hyphen, no consecutive hyphens.
const NAME_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;

const KEY_RE = /^([A-Za-z][A-Za-z0-9_-]*):\s*(.*)$/;
const BLOCK_RE = /^[>|][-+]?[0-9]?$/;
const INLINE_MAP_RE = /^\{.*\}$/;
const isQuoted = (s) =>
  (s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"));
const stripQuotes = (s) => (isQuoted(s) ? s.slice(1, -1) : s);
// YAML scalars that are NOT strings. metadata (string → string map) rejects these.
const NON_STRING_SCALAR_RE = /^(~|null|true|false|[-+]?(\d+(\.\d+)?|\.\d+)|\.nan|[+-]?\.inf)$/i;

function mapFromEntries(entries, file, field) {
  const map = {};
  const errors = [];
  for (const { key, raw } of entries) {
    const trimmed = raw.trim();
    map[key] = stripQuotes(trimmed);
    if (field === "metadata" && !isQuoted(trimmed) && NON_STRING_SCALAR_RE.test(trimmed)) {
      errors.push(
        `${file}: metadata.${key} must be a string (the spec defines metadata as a string→string map) — quote the value`,
      );
    }
  }
  return { map, errors };
}

/**
 * Parse SKILL.md frontmatter without a YAML library.
 *
 * @param {string} raw
 * @param {string} file Path used only in messages.
 * @returns {{ fields: object|null, errors: string[], warnings: string[] }}
 */
export function parseFrontmatter(raw, file) {
  const errors = [];
  const warnings = [];
  if (!raw.startsWith("---")) {
    return { fields: null, errors: [`${file}: missing YAML frontmatter (file must start with ---)`], warnings };
  }
  const end = raw.indexOf("\n---", 3);
  if (end === -1) {
    return {
      fields: null,
      errors: [`${file}: frontmatter is not terminated by a closing ---`],
      warnings,
    };
  }
  const lines = raw.slice(raw.indexOf("\n") + 1, end).split("\n");
  const fields = {};
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim() || line.trim().startsWith("#")) {
      i++;
      continue;
    }
    const m = line.match(KEY_RE);
    if (!m) {
      warnings.push(`${file}: unparsed frontmatter line: ${JSON.stringify(line)}`);
      i++;
      continue;
    }
    const [, key, rest] = m;
    if (BLOCK_RE.test(rest)) {
      const block = [];
      i++;
      while (i < lines.length && (/^\s+\S/.test(lines[i]) || !lines[i].trim())) {
        block.push(lines[i].trim());
        i++;
      }
      fields[key] = block.filter(Boolean).join(rest.startsWith(">") ? " " : "\n");
    } else if (INLINE_MAP_RE.test(rest.trim())) {
      const inner = rest.trim().slice(1, -1).trim();
      const entries = inner
        ? inner
            .split(",")
            .map((part) => part.match(/^\s*([A-Za-z][A-Za-z0-9_-]*)\s*:\s*(.*)$/))
            .filter(Boolean)
            .map((nm) => ({ key: nm[1], raw: nm[2] }))
        : [];
      const { map, errors: mapErrors } = mapFromEntries(entries, file, key);
      fields[key] = map;
      errors.push(...mapErrors);
      if (key !== "metadata" && entries.length) {
        warnings.push(`${file}: "${key}" is a map field the spec does not define — only "metadata" is a map`);
      }
      i++;
    } else if (rest === "") {
      const entries = [];
      i++;
      while (i < lines.length && /^\s+\S/.test(lines[i])) {
        const nm = lines[i].trim().match(KEY_RE);
        if (nm) entries.push({ key: nm[1], raw: nm[2] });
        i++;
      }
      const { map, errors: mapErrors } = mapFromEntries(entries, file, key);
      fields[key] = map;
      errors.push(...mapErrors);
      if (key !== "metadata" && entries.length) {
        warnings.push(`${file}: "${key}" is a map field the spec does not define — only "metadata" is a map`);
      }
    } else {
      fields[key] = stripQuotes(rest);
      i++;
    }
  }
  return { fields, errors, warnings };
}

/**
 * Validate one skill directory's SKILL.md content.
 *
 * @param {string} dir Directory name under skills/ (must equal frontmatter name).
 * @param {string} raw File content of that SKILL.md.
 */
export function validateSkill(dir, raw) {
  const errors = [];
  const warnings = [];
  const rel = `skills/${dir}/SKILL.md`;

  const parsed = parseFrontmatter(raw, rel);
  errors.push(...parsed.errors);
  warnings.push(...parsed.warnings);
  const fm = parsed.fields;
  if (fm) {
    const { name, description, compatibility } = fm;
    if (!name) errors.push(`${rel}: frontmatter is missing required field "name"`);
    else {
      if (name.length > 64) errors.push(`${rel}: name exceeds 64 characters`);
      if (!NAME_RE.test(name))
        errors.push(
          `${rel}: name "${name}" is invalid (lowercase letters, digits, single hyphens; no leading/trailing hyphen)`,
        );
      if (name !== dir) errors.push(`${rel}: name "${name}" must match its directory name "${dir}"`);
    }

    if (!description) {
      errors.push(`${rel}: frontmatter is missing required field "description"`);
    } else {
      if (description.length > 1024)
        errors.push(`${rel}: description exceeds 1024 characters (${description.length})`);
      if (description.length < 20)
        warnings.push(`${rel}: description is very short — add what the skill does AND when to use it`);
      if (/^TODO/i.test(description))
        warnings.push(`${rel}: description still starts with TODO — replace it before publishing`);
    }

    if (compatibility && compatibility.length > 500)
      errors.push(`${rel}: compatibility exceeds 500 characters`);
  }

  const bodyLines = raw.split("\n").length;
  if (bodyLines > 500)
    warnings.push(`${rel}: file is ${bodyLines} lines — the spec recommends <500; move detail to references/`);

  return { errors, warnings };
}

/**
 * Consistency rules across the Claude plugin manifests and the npm package.
 *
 * Version drift fails the build (not just warns) because both update channels
 * are version-gated: Claude Code only offers updates on plugin version bumps,
 * and the OpenCode plugin only re-syncs on npm version bumps.
 *
 * @param {{ pkg?: object, plugin?: object, marketplace?: object }} manifests
 */
export function checkManifests({ pkg, plugin, marketplace }) {
  const errors = [];
  const warnings = [];

  if (plugin?.name && !NAME_RE.test(plugin.name))
    errors.push(`.claude-plugin/plugin.json: name "${plugin.name}" should be kebab-case`);
  if (plugin && !plugin.version)
    errors.push(`.claude-plugin/plugin.json: missing "version" (keep it in sync with package.json)`);

  if (marketplace && plugin) {
    const entry = marketplace.plugins?.find((p) => p.name === plugin.name);
    if (!entry)
      warnings.push(
        `.claude-plugin/marketplace.json: no plugin entry named "${plugin.name}" matching plugin.json`,
      );
    else if (entry.version && plugin.version && entry.version !== plugin.version)
      errors.push(
        `version mismatch: .claude-plugin/marketplace.json lists ${entry.version} but plugin.json is ${plugin.version}`,
      );
  }

  if (plugin?.version && pkg?.version && pkg.version !== plugin.version)
    errors.push(
      `version mismatch: package.json is ${pkg.version} but .claude-plugin/plugin.json is ${plugin.version}`,
    );

  return { errors, warnings };
}

function readJson(relPath, requiredKeys, errors, warnings) {
  const file = join(repoRoot, relPath);
  if (!existsSync(file)) {
    warnings.push(`${relPath}: not found (needed only for Claude plugin/marketplace install)`);
    return null;
  }
  let data;
  try {
    data = JSON.parse(readFileSync(file, "utf8"));
  } catch (e) {
    errors.push(`${relPath}: invalid JSON — ${e.message}`);
    return null;
  }
  for (const key of requiredKeys)
    if (!(key in data)) errors.push(`${relPath}: missing required field "${key}"`);
  return data;
}

function main() {
  const errors = [];
  const warnings = [];

  // --- Skills ---
  if (!existsSync(skillsDir)) {
    errors.push("skills/ directory not found");
  } else {
    const dirs = readdirSync(skillsDir).filter((d) => {
      if (d.startsWith(".")) return false;
      return statSync(join(skillsDir, d)).isDirectory();
    });
    if (dirs.length === 0) errors.push("skills/ contains no skill directories");
    for (const dir of dirs) {
      const skillFile = join(skillsDir, dir, "SKILL.md");
      if (!existsSync(skillFile)) {
        errors.push(`skills/${dir}/: missing SKILL.md`);
        continue;
      }
      const res = validateSkill(dir, readFileSync(skillFile, "utf8"));
      errors.push(...res.errors);
      warnings.push(...res.warnings);
    }
    console.log(`Checked ${dirs.length} skill(s): ${dirs.join(", ")}`);
  }

  // --- Manifests ---
  const plugin = readJson(".claude-plugin/plugin.json", ["name", "version"], errors, warnings);
  const marketplace = readJson(".claude-plugin/marketplace.json", ["name", "owner", "plugins"], errors, warnings);
  const pkg = readJson("package.json", ["name", "version", "exports"], errors, warnings);

  const manifestCheck = checkManifests({ pkg, plugin, marketplace });
  errors.push(...manifestCheck.errors);
  warnings.push(...manifestCheck.warnings);

  if (pkg) {
    if (typeof pkg.exports === "string" && !existsSync(join(repoRoot, pkg.exports)))
      errors.push(`package.json: exports entry "${pkg.exports}" does not exist`);
    if (!(pkg.files ?? []).includes("skills"))
      errors.push(`package.json: "files" must include "skills" or the npm package won't bundle them`);
  }

  // --- Report ---
  for (const w of warnings) console.log(`WARN  ${w}`);
  for (const e of errors) console.log(`ERROR ${e}`);
  if (errors.length) {
    console.log(`\n${errors.length} error(s), ${warnings.length} warning(s)`);
    process.exitCode = 1;
    return;
  }
  console.log(`\nOK — 0 errors, ${warnings.length} warning(s)`);
}

const invokedDirectly =
  process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) main();
