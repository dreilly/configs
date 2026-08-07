# role-agents

Thin role-based delegation for Pi with two execution surfaces:

- `headless` — a disposable isolated Pi process whose activity and final output stream inline.
- `herdr` — a visible Pi session in a Herdr pane, optionally reused or launched in a worktree.

Roles are Markdown files under `~/.pi/agent/agents/` (symlinked to this repository's `agents/` directory). Frontmatter supports:

```yaml
---
name: scout
description: Fast read-only codebase reconnaissance
model: github-copilot/gpt-5.6-luna
thinking: low
tools: read, grep, find, ls
systemPromptMode: replace
---
```

The Markdown body is the role's system prompt.

## Usage

Ask naturally:

```text
Use the scout role agent to map the authentication flow.
Use the researcher role agent to compare the latest Pi subagent options.
Open the researcher role agent in Herdr and keep the pane available for follow-ups.
Open a worker role in a Herdr worktree for this implementation.
```

Model-facing tool examples:

```json
{
  "role": "scout",
  "task": "Find the authentication entry points.",
  "surface": "headless"
}
```

```json
{
  "role": "researcher",
  "task": "Research the latest Pi release.",
  "surface": "herdr",
  "reuse": true,
  "wait": true,
  "keepOpen": false
}
```

## Behavior

- One tool call runs one role. Independent calls in one assistant turn run in parallel through Pi's normal parallel tool execution.
- Roles do not receive `role_agent` unless it is explicitly listed in their `tools`, so the bundled roles cannot recurse.
- Headless runs use no Pi session and write no project artifacts.
- Herdr requires `HERDR_ENV=1`. It opens a real interactive Pi session that remains visible while it works.
- Herdr calls wait by default. After capturing output, a successfully completed newly created split pane closes automatically.
- Failed or blocked panes, reused panes, worktrees, and calls with `wait: false` remain open for inspection.
- Set `keepOpen: true` for a persistent successful pane that should accept follow-up prompts.
- `worktree: true` delegates worktree creation to Herdr and should be used for parallel writers; worktrees are never removed automatically.
- Herdr system-prompt snapshots are content-addressed under the OS temporary directory; they contain only the role prompt.

## Bundled roles

- `scout` — Luna/low, read-only local reconnaissance.
- `researcher` — Terra/medium, `websearch` and `webfetch` only.
- `worker` — Sol/high, focused implementation and validation.

Run `/reload` after changing the extension. Role Markdown files are rediscovered for every call, so prompt/model/tool edits do not require a reload.
