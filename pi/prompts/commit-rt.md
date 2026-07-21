---
description: Generate a ticket-prefixed commit message from the current changes
argument-hint: "<issue-number>"
---
Generate a commit message for issue `$1`.

## Instructions

1. Run `git diff --cached` to inspect the staged changes.
2. If nothing is staged, run `git diff` to inspect unstaged changes instead.
3. Analyze the changes and generate a concise message that focuses on why the change was made rather than merely listing what changed.
4. Output the message in exactly this format:

```
Ticket #$1

<message>
```

Do not run `git commit` or modify any files. Output only the formatted commit message for the user to copy.
