# Agent Skill Template

A GitHub template for authoring and distributing [Agent Skills](https://agentskills.io/specification) — portable
`SKILL.md` instruction packages that work across Claude Code, OpenAI Codex, OpenCode, Cursor, and 70+ other agents.

One canonical layout (`skills/<name>/SKILL.md`), four install paths, zero duplication:

| Install path              | Command                                                             | Covers                                                                                       |
|---------------------------|---------------------------------------------------------------------|----------------------------------------------------------------------------------------------|
| **Vercel `skills` CLI**   | `npx skills add <owner>/<repo>`                                     | Claude Code, Codex, OpenCode, Cursor, Copilot, Gemini CLI, and [70+ more](https://skills.sh) |
| **Claude Code plugin**    | `/plugin marketplace add <owner>/<repo>`                            | Claude Code (namespaced skills, versioned updates)                                           |
| **Codex** | copy/clone into `~/.agents/skills/` (personal) or `.agents/skills/` (project) | OpenAI Codex CLI + IDE extension |
| **OpenCode plugin** | add `"<npm-package>@latest"` to `opencode.json` | OpenCode, with automated updates on every new npm release |
| **OpenCode (file-based)** | copy/clone into `.opencode/skills/` or `~/.config/opencode/skills/` | OpenCode (also auto-discovers the user-global `~/.claude/skills/` and `~/.agents/skills/`) |

## Using this template

1. Click **Use this template** on GitHub (or clone this repo).
2. Rename `skills/example-skill/` to your skill's name (lowercase, hyphens)
   and set the matching `name` in its `SKILL.md` frontmatter.
3. Replace the TODO description and scaffold body in `SKILL.md` with your skill's real instructions. Delete
   `references/` and `scripts/` if unused.
4. Update `.claude-plugin/plugin.json`, `.claude-plugin/marketplace.json`, and `package.json`: names, descriptions,
   author, repository URLs. Keep
   `version` identical across all three (the validator checks this).
5. Update `LICENSE`, this README's install commands, and `AGENTS.md`.
6. Validate: `node scripts/validate-skills.mjs` and `npm test` (CI runs the
   same checks).
7. Push. Your repo is now installable by every mechanism below.

Add more skills by creating sibling directories under `skills/` — every install path below picks them up automatically.

## Installing skills from this repo

### Vercel `skills` CLI (recommended, cross-agent)

```bash
# Install into the current project (writes to each agent's skills dir):
npx skills add <owner>/<repo>

# Install globally for your user instead:
npx skills add <owner>/<repo> -g

# Or try a skill without installing:
npx skills use <owner>/<repo> --skill <skill-name>
```

The CLI discovers every `skills/<name>/SKILL.md` in the repo, lets you pick which agents to target, and installs into
each agent's own directory (`.claude/skills/`, `.codex/skills/`, `.agents/skills/`, …). Update later with
`npx skills update`.

### Claude Code (as a plugin)

This repo doubles as its own single-plugin marketplace (`.claude-plugin/marketplace.json` points at `./`):

```text
/plugin marketplace add <owner>/<repo>
/plugin install <plugin-name>@<marketplace-name>
```

Plugin skills are namespaced (`/<plugin-name>:<skill-name>`) and users receive updates when you bump `version` in the
manifests. For quick local testing without installing:

```bash
claude --plugin-dir /path/to/this/repo
```
### OpenAI Codex

Codex scans skills from `.agents/skills/` in the project (from the working
directory up to the repository root), `~/.agents/skills/` (personal), and
`/etc/codex/skills/` (admin). The `skills` CLI above handles this for you, or
manually:

```bash
git clone https://github.com/<owner>/<repo> /tmp/repo
mkdir -p ~/.agents/skills
cp -r /tmp/repo/skills/* ~/.agents/skills/
```

Start a new Codex session; invoke with `$<skill-name>` or let Codex select the
skill automatically from its description.

### OpenCode (as a plugin, with automated updates)

This repo is also an npm package that acts as an OpenCode plugin. OpenCode installs npm plugins with Bun at every
startup, so a `@latest` entry delivers automated updates whenever you publish a new version. Add to `opencode.json`
(project) or `~/.config/opencode/opencode.json` (global):

```jsonc
{
  "plugin": ["@wickedbyte/agent-skill-template@latest"]
}
```

Pin an exact version (`@0.1.0`) instead if you want reproducibility over auto-updates.
OpenCode plugins are JavaScript hooks and can't declare skills natively, so
the bundled plugin (`src/opencode-plugin.js`) bridges the gap: on session
start it syncs the packaged `skills/` into `~/.config/opencode/skills/`,
where OpenCode's native skill discovery finds them. The sync is
version-gated (a no-op until the package version changes), copies through a
temp directory so an interruption can't leave a half-written skill, and a
manifest tracks ownership so it only ever deletes or overwrites directories
it previously installed: skills that disappear from the package are cleaned
up on upgrade, while a directory it does not own — including a same-named
skill you installed by other means — is skipped with a warning instead of
being overwritten.
Publishing flow: bump the version → create a GitHub release →
`.github/workflows/publish.yml` publishes to npm (requires an `NPM_TOKEN`
repository secret) → users get the update at their next OpenCode startup.

### OpenCode (file-based)

Without npm, OpenCode still discovers `SKILL.md` files from
`.opencode/skills/` (or `.opencode/skill/`), `~/.config/opencode/skills/` (or
`skill/`), plus the user-global `~/.claude/skills/` and `~/.agents/skills/`
locations — so an install done by the `skills` CLI or for Claude/Codex is
picked up automatically. Manual project install:

```bash
mkdir -p .opencode/skills
cp -r /tmp/repo/skills/* .opencode/skills/
```

## Repository layout

```text
.
├── .claude-plugin/
│   ├── plugin.json          # Claude Code plugin manifest (repo root = plugin root)
│   └── marketplace.json     # Makes this repo its own one-plugin marketplace
├── .github/workflows/
│   ├── validate.yml         # CI: spec-validate all skills + manifests
│   └── publish.yml          # npm publish on GitHub release (OpenCode auto-updates)
├── skills/
│   └── example-skill/       # ← rename me; one directory per skill
│       ├── SKILL.md         # Required: frontmatter + instructions
│       ├── references/      # Optional: docs loaded on demand
│       ├── scripts/         # Optional: executable helpers
│       └── assets/          # Optional: templates, data files
├── scripts/
│   └── validate-skills.mjs  # Zero-dependency spec validator (pure functions, testable)
├── src/
│   └── opencode-plugin.js   # OpenCode plugin: syncs bundled skills on startup
├── test/                    # node:test suites for the plugin and validator
├── AGENTS.md                # Repo instructions for coding agents (all vendors)
├── LICENSE
├── package.json             # npm packaging for the OpenCode plugin
└── README.md
```

Only `skills/` is the source of truth. `.claude-plugin/` adds Claude plugin packaging on top; no skill content is
duplicated anywhere.

## Authoring guidelines

`SKILL.md` frontmatter, per the [Agent Skills spec](https://agentskills.io/specification):

| Field           | Required | Rules                                                                                        |
|-----------------|----------|----------------------------------------------------------------------------------------------|
| `name`          | yes      | ≤64 chars; lowercase letters, digits, hyphens; must match the directory name                 |
| `description`   | yes      | ≤1024 chars; what the skill does **and** when to use it, third person, with trigger keywords |
| `license`       | no       | short license name or bundled file reference                                                 |
| `compatibility` | no       | ≤500 chars; only if the skill has environment requirements                                   |
| `metadata`      | no       | free-form string→string map (author, version, …)                                             |
| `allowed-tools` | no       | experimental; space-separated pre-approved tools                                             |

Structure for **progressive disclosure** — agents load in three stages:
metadata at startup (~100 tokens), the `SKILL.md` body on activation (keep it under 500 lines / ~5k tokens), and
supporting files only on demand. The
`description` alone determines whether your skill activates, so make it specific and keyword-rich. See
`skills/example-skill/SKILL.md` for an annotated scaffold.

## Validation

```bash
node scripts/validate-skills.mjs   # spec checks: naming, frontmatter, sizes, manifests
npm test                           # node:test suites for the plugin and validator
claude plugin validate .           # optional: Claude Code's own plugin validation
```

CI (`.github/workflows/validate.yml`) runs the validator and the tests on every
push and PR, and fails if a bundled shell script isn't executable.

## License

MIT — see [LICENSE](LICENSE). Template users: replace the copyright holder.
