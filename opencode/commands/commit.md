# /commit

Generate a commit message using Conventional Commits style.

## Instructions

1. Run `git diff --cached` to see the staged changes
2. If nothing is staged, run `git diff` to see unstaged changes instead
3. Analyze the changes and generate a commit message in Conventional Commits format:

```
<type>(<scope>): <description>

<body>
```

Where:
- `<type>` is one of: feat, fix, docs, style, refactor, perf, test, build, ci, chore
- `<scope>` is optional, the area of the codebase affected
- `<description>` is a short summary in imperative mood (e.g., "add" not "added")
- `<body>` is optional, provides additional context if needed

Examples:
- `feat(auth): add OAuth2 login support`
- `fix: resolve null pointer in user service`
- `refactor(api): simplify error handling logic`

Do NOT attempt to run git commit. Just output the formatted message for the user to copy.
