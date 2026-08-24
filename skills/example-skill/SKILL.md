---
name: example-skill
description: >-
  TODO — Replace this. Describe what the skill does AND when to use it, in the
  third person, with concrete trigger keywords (error messages, file types,
  tool names, symptoms). Example: "Extracts text and tables from PDF files,
  fills PDF forms, and merges PDFs. Use when working with PDF documents or when
  the user mentions PDFs, forms, or document extraction."
license: MIT
metadata:
  author: WickedByte
  version: "0.0.1"
---

# Example Skill

> **Template note:** Everything below is a scaffold. Replace the prose with your
> skill's actual instructions, delete sections you don't need, and delete this
> note. Keep `SKILL.md` under 500 lines — move heavy detail into
> `references/` (see [Progressive disclosure](#progressive-disclosure)).

## Overview

State the core purpose in one or two sentences: what problem this skill solves
and the single most important principle for solving it well.

## When to use

- Concrete situation or symptom that should trigger this skill
- Another trigger (error message, file type, user phrasing)

**When NOT to use:**

- A neighboring situation this skill does not cover, and what to do instead

## Instructions

1. First step. Be imperative and specific — write for an agent that has never
   seen this task before.
2. Second step. Prefer commands and exact file paths over vague guidance.
3. If a step needs heavy reference material, link it instead of inlining it:
   see [references/REFERENCE.md](references/REFERENCE.md).
4. If a step is deterministic, script it instead of describing it:

   ```bash
   scripts/example.sh --input <file>
   ```

## Examples

**Input:** a realistic request a user might make.

**Expected behavior:** what the agent should do and what the output looks like.

## Common mistakes

| Mistake | Fix |
| ------- | --- |
| A wrong turn agents actually take | The correction |

## Progressive disclosure

Agents load skills in three stages — structure your content accordingly:

1. **Metadata** (`name` + `description`) is loaded at startup for every skill.
   The description alone decides whether this skill gets activated.
2. **This file** is loaded in full when the skill is activated. Budget ~5k
   tokens; keep it under 500 lines.
3. **Supporting files** (`references/`, `scripts/`, `assets/`) are loaded only
   on demand. Put anything long or optional there and link to it with relative
   paths from the skill root.
