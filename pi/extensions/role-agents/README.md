# role-agents

Thin role-based delegation for Pi with two execution surfaces:

- `headless` — a disposable isolated Pi process whose activity and final output stream inline.
- `herdr` — a visible Pi session in a pane in the current Herdr tab, optionally reused.

Roles are Markdown files under `~/.pi/agent/agents/` (symlinked to this repository's `agents/` directory). Frontmatter supports:

```yaml
---
name: scout
description: Fast read-only codebase reconnaissance
model: github-copilot/gpt-5.6-luna
thinking: low
tools: read, grep, find, ls
systemPromptMode: replace
skills: false
contextFiles: true
promptTemplates: false
---
```

The Markdown body is the role's system prompt. `skills`, `contextFiles`, and `promptTemplates` default to `true`; set them to `false` to keep unnecessary discovered resources out of the child prompt.

Local machine model overrides can be placed in `~/.pi/agent/agent-models.local.json` or `configs/pi/agent-models.local.json` (gitignored in this repo). Exact per-agent overrides win over frontmatter models; aliases are used only when the frontmatter model matches an alias key:

```json
{
  "agents": {
    "scout": "openai-codex/gpt-5.4-mini",
    "researcher": "openai-codex/gpt-5.4-mini",
    "worker": "openai-codex/gpt-5.6-sol"
  },
  "aliases": {
    "fast": "openai-codex/gpt-5.4-mini",
    "coding": "openai-codex/gpt-5.6-sol"
  }
}
```

## Usage

Ask naturally:

```text
Use the scout role agent to map the authentication flow.
Use the researcher role agent to compare the latest Pi subagent options.
Open the researcher role agent in Herdr and keep the pane available for follow-ups.
Open a worker role in a Herdr pane for this implementation.
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
- Herdr delegation is pane-only: it splits the caller's pane in the current tab and never creates a tab, workspace, or worktree.
- New splits retain 80% of the available area for the caller, keeping the pane where the request originated larger than its delegated panes.
- Reuse is also scoped to the current tab, so an agent in another tab will not be selected.
- Herdr calls wait by default. After capturing output, a successfully completed newly created split pane closes automatically.
- Failed or blocked panes, reused panes, and calls with `wait: false` remain open for inspection.
- Successful newly created panes close by default; set `keepOpen: true` only when the user explicitly requests persistence, inspection, or follow-up access.
- Herdr system-prompt snapshots are content-addressed under the OS temporary directory; they contain only the role prompt.

## Bundled roles

- `scout` — Gemini Flash/low, read-only local reconnaissance.
- `researcher` — Terra/medium, `websearch` and `webfetch` only.
- `worker` — Sol/high, focused implementation and validation.

Run `/reload` after changing the extension. Role Markdown files are rediscovered for every call, so prompt/model/tool edits do not require a reload.
