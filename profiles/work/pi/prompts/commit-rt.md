---
description: Generate a ticket-prefixed commit message from the current changes
argument-hint: "[issue-number]"
---
Generate a ticket-prefixed commit message. Issue number argument: `${1:-none}`.

## Determine the issue number

- If an issue number argument was given above (not `none`), use it, stripping any leading `#` or `g`.
- Otherwise derive it from the current branch: run `git branch --show-current`. RealTime branches and worktrees are named like `g13110.dr` or `g13110-dr`; take the digits after the leading `g` (e.g. `g13110.dr` → `13110`).
- If the branch yields no number (detached HEAD or a different naming scheme), try the worktree directory name from `git rev-parse --show-toplevel` using the same pattern (e.g. `~/code/realtime-wt/g13110-dr` → `13110`).
- If neither yields a number, stop and reply only with: `Could not determine the issue number; rerun as /commit-rt <issue-number>.`

Call the resulting number `ISSUE` below.

## Instructions

1. Run `git diff --cached` to inspect the staged changes.
2. If nothing is staged, run `git diff` to inspect unstaged changes instead.
3. Analyze the changes and generate a concise message that focuses on why the change was made rather than merely listing what changed.
4. Structure the message as:
   - Line 1: `Ticket #ISSUE`
   - Line 2: blank
   - Line 3: a short summary line
   - Line 4: blank
   - Lines 5+: a body explaining why, wrapped at ~72 characters

## Length

Keep it brief. A reviewer should understand the change at a glance.
- Summary line: under ~60 characters.
- Body: a single paragraph of at most 3-4 lines (~50-60 words).
- State the problem/reason and the gist of the fix. Do not enumerate every change, UI string, or implementation detail.
- If the change has several parts, summarize them in one sentence rather than a paragraph each.

## Output rules

Your final response must be ONLY the raw commit message text, ready to paste directly into git:
- Do NOT wrap it in a code block or use ``` fences.
- Do NOT indent the lines.
- No preamble, explanation, headings, or trailing commentary.

Do not run `git commit` or modify any files.
