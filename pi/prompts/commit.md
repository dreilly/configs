---
description: Generate a Conventional Commit message from the current changes
---
Generate a commit message using Conventional Commits style.

## Instructions

1. Run `git diff --cached` to inspect the staged changes.
2. If nothing is staged, run `git diff` to inspect unstaged changes instead.
3. Analyze the changes and generate a commit message with this structure:
   - Line 1: `<type>(<scope>): <description>`
   - Line 2: blank
   - Lines 3+: `<body>` (optional)

Where:
- `<type>` is one of: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `build`, `ci`, or `chore`.
- `<scope>` is optional and identifies the affected area of the codebase.
- `<description>` is a short summary in imperative mood (for example, "add", not "added").
- `<body>` is optional and provides additional context when needed. Wrap body lines at ~72 characters.

## Length

Keep it brief. A reviewer should understand the change at a glance.
- Subject line: under ~60 characters.
- Body: omit it for simple changes; otherwise a single paragraph of at most 3-4 lines (~50-60 words).
- Explain why, plus the gist of what. Do not enumerate every change, UI string, or implementation detail.
- If the change has several parts, summarize them in one sentence rather than a paragraph each.

## Output rules

Your final response must be ONLY the raw commit message text, ready to paste directly into git:
- Do NOT wrap it in a code block or use ``` fences.
- Do NOT indent the lines.
- No preamble, explanation, headings, or trailing commentary.

Do not run `git commit` or modify any files.
