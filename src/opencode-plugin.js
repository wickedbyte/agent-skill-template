/**
 * OpenCode plugin entry point.
 *
 * OpenCode plugins are JavaScript hooks — they cannot declare skills natively.
 * This plugin bridges that gap: on session start it syncs the `skills/`
 * directory bundled in this npm package into OpenCode's global skills
 * directory (`~/.config/opencode/skills/`), where OpenCode's native skill
 * discovery picks them up.
 *
 * Automated updates: users list this package in opencode.json as
 * `"<package-name>@latest"`. OpenCode re-resolves npm plugins with Bun at
 * startup, so publishing a new version updates the plugin, and the version
 * check below re-syncs the bundled skills exactly once per upgrade.
 *
 * Ownership: a manifest file records which skill *directories* this package
 * owns (never users' files). On every sync the plugin may only:
 *   - install/replace directories it owns (fresh copies, or names recorded
 *     in the previous manifest), and
 *   - remove previously-owned directories that were dropped from the bundle.
 * A directory it does not own is never touched: a same-named skill folder
 * the user installed by other means is skipped with a warning instead of
 * being overwritten, and unrelated folders are left alone.
 */
import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, join } from "node:path";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";

const packageRoot = dirname(dirname(fileURLToPath(import.meta.url)));

function globalSkillsDir(env = process.env) {
  const xdgConfig = env.XDG_CONFIG_HOME || join(homedir(), ".config");
  return join(xdgConfig, "opencode", "skills");
}

/**
 * Replace `dest` with a copy of `src` through a sibling temp directory.
 * The long part (the copy) happens before the destructive part, so an
 * interruption can only leave the old directory or the temp directory,
 * never a half-written one. POSIX `rename` can't replace a non-empty dir,
 * so full atomicity is impossible; this keeps the vulnerable window to the
 * final rm+rename pair.
 */
function replaceDir(src, dest) {
  const tmp = join(dirname(dest), `.sync-tmp-${basename(dest)}-${process.pid}`);
  rmSync(tmp, { recursive: true, force: true });
  cpSync(src, tmp, { recursive: true });
  rmSync(dest, { recursive: true, force: true });
  renameSync(tmp, dest);
}

/**
 * Sync bundled skills into `targetDir`.
 *
 * @param {object} [options]
 * @param {string} [options.packageDir] Defaults to this package's root.
 * @param {string} [options.targetDir]  Defaults to OpenCode's global skills dir.
 * @returns {{ installed: string[], skipped: string[], removed: string[] }}
 */
export function syncSkills({ packageDir = packageRoot, targetDir = globalSkillsDir() } = {}) {
  const result = { installed: [], skipped: [], removed: [] };
  const pkg = JSON.parse(readFileSync(join(packageDir, "package.json"), "utf8"));
  const bundledDir = join(packageDir, "skills");
  if (!existsSync(bundledDir)) return result;

  mkdirSync(targetDir, { recursive: true });

  // Manifest filename is derived from the package name so multiple skill
  // packages can coexist in the same skills directory.
  const manifestPath = join(
    targetDir,
    `.${pkg.name.replace(/[^a-z0-9-]+/gi, "-").replace(/^-+/, "")}.sync.json`,
  );

  let manifest = null;
  if (existsSync(manifestPath)) {
    try {
      manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    } catch {
      // Corrupt manifest: treat as never-owned and rebuild via a full sync.
    }
  }
  if (manifest?.version === pkg.version) return result;

  const ownedNames = new Set(Array.isArray(manifest?.skills) ? manifest.skills : []);

  const bundled = readdirSync(bundledDir, { withFileTypes: true })
    .filter((e) => e.isDirectory() && existsSync(join(bundledDir, e.name, "SKILL.md")))
    .map((e) => e.name);

  const installedNames = [];
  for (const name of bundled) {
    const dest = join(targetDir, name);
    if (existsSync(dest) && !ownedNames.has(name)) {
      // A directory we never owned. Deleting or replacing it could destroy
      // a skill the user installed by other means — skip instead.
      result.skipped.push(name);
      continue;
    }
    if (existsSync(dest)) {
      replaceDir(join(bundledDir, name), dest);
    } else {
      cpSync(join(bundledDir, name), dest, { recursive: true });
    }
    result.installed.push(name);
    installedNames.push(name);
  }

  // Remove skills this package owned in the previous manifest but which are
  // no longer bundled. Foreign directories are never listed here.
  for (const stale of [...ownedNames].filter((s) => !bundled.includes(s))) {
    rmSync(join(targetDir, stale), { recursive: true, force: true });
    result.removed.push(stale);
  }

  writeFileSync(
    manifestPath,
    JSON.stringify({ version: pkg.version, skills: installedNames }, null, 2) + "\n",
  );
  return result;
}

let label = "[skill-sync]";
try {
  label = `[${JSON.parse(readFileSync(join(packageRoot, "package.json"), "utf8")).name}]`;
} catch {
  // Non-fatal: the label only decorates log lines.
}

export const SkillSyncPlugin = async () => {
  try {
    const result = syncSkills();
    for (const name of result.skipped) {
      console.error(
        `${label} skipped "${name}": a directory with this name already exists in the skills folder and is not managed by this package. Rename or move it to let the plugin install its copy.`,
      );
    }
  } catch (err) {
    // Never break the OpenCode session over a sync failure.
    console.error(`${label} skill sync failed: ${err.message}`);
  }
  return {};
};
