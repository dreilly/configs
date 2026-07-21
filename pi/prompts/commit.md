---
description: Generate a Conventional Commit message from the current changes
---
Generate a commit message using Conventional Commits style.

## Instructions

1. Run `git diff --cached` to inspect the staged changes.
2. If nothing is staged, run `git diff` to inspect unstaged changes instead.
3. Analyze the changes and generate a commit message in this format:

```
<type>(<scope>): <description>

<body>
```

Where:
- `<type>` is one of: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `build`, `ci`, or `chore`.
- `<scope>` is optional and identifies the affected area of the codebase.
- `<description>` is a short summary in imperative mood (for example, "add", not "added").
- `<body>` is optional and provides additional context when needed.

Do not run `git commit` or modify any files. Output only the formatted commit message for the user to copy.
