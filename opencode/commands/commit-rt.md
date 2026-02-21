# /commit-rt

Generate a commit message for the user to copy.

## Usage

```
/commit-rt <issue-number>
```

## Instructions

1. Run `git diff --cached` to see the staged changes
2. If nothing is staged, run `git diff` to see unstaged changes instead
3. Analyze the changes and generate a commit message
4. Output the message in this exact format for the user to copy:

```
Issue #<issue-number>

<message>
```

Where:
- `<issue-number>` is the argument passed to this command
- `<message>` is a concise description focusing on the "why" rather than the "what"

Do NOT attempt to run git commit. Just output the formatted message.
