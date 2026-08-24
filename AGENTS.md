# Instructions for coding agents

This repository is a template for authoring **Agent Skills** — portable `SKILL.md` instruction packages per the spec
at <https://agentskills.io/specification> — distributed via the Vercel `skills` CLI, as a Claude Code
plugin/marketplace, and as plain skill directories for Codex and OpenCode.

## Layout rules

- Every skill lives at `skills/<skill-name>/SKILL.md`. One directory per skill.
- The frontmatter `name` MUST equal the directory name: 1–64 chars, lowercase letters/digits/hyphens, no
  leading/trailing/consecutive hyphens.
- `description` is required (1–1024 chars) and must state both what the skill does and when to use it, in the third
  person, with concrete trigger keywords.
- Keep `SKILL.md` under 500 lines. Move heavy material to `skills/<name>/references/`, executables to
  `skills/<name>/scripts/`, and static resources to `skills/<name>/assets/`. Link with relative paths.
- Claude plugin metadata lives ONLY in `.claude-plugin/` (`plugin.json`, `marketplace.json`). Never put `skills/` inside
  `.claude-plugin/`.

## When changing skills

- Run `node scripts/validate-skills.mjs` and `npm test` before finishing; fix all errors.
- Keep `version` in sync across `.claude-plugin/plugin.json`, `.claude-plugin/marketplace.json`, and `package.json`, and
  bump it on any user-visible change — Claude Code only offers updates when the version changes, and the OpenCode plugin
  (`src/opencode-plugin.js`) only re-syncs bundled skills when the npm package version changes. The validator fails
  (exit non-zero) on version mismatch, not just warns.
- Shell scripts under `skills/*/scripts/` must be executable (`chmod +x`).
- Do not add agent-specific directories (`.claude/`, `.codex/`, `.opencode/`) to this repo; the canonical source of
  truth is `skills/` and installers map it into each agent's own location.
- The OpenCode plugin must never delete or overwrite a skills directory it does not own (ownership is tracked by its
  manifest file). When editing `src/opencode-plugin.js`, preserve that guarantee and update `test/opencode-plugin.test.js`.
