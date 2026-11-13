---
name: rt-tickets
description: Work several RealTime GitHub issues in parallel, each in its own rtw worktree, SIS instance, browser, and pi session in its own Herdr tab. Use when the user pastes one or more GitHub issues and asks to start, fan out, or work them in worktrees/tabs/sessions.
---

# RealTime tickets → parallel worktrees

For each pasted GitHub issue: create an `rtw` worktree + SIS container, then start a pi session in a
new Herdr tab inside that worktree, kicked off with the issue. Each session gets its own
`https://<name>.sis.localhost` and its own Chrome (rt-browser picks both from the cwd), so the
sessions can verify their work in the browser without interfering.

The user's request to use this skill is the explicit request for Herdr tabs and for running `rtw new`.

## 0. Preconditions

```bash
test "${HERDR_ENV:-}" = 1 || echo "not in Herdr"   # stop and tell the user if not in Herdr
RTW="${RTW_BIN:-$HOME/code/containerization/containers/rtw}"
"$RTW" ls                                          # base stack must be up (Caddy + network)
```

If `rtw ls`/`rtw new` reports the base stack or image is missing, stop and tell the user what it said
(`rtc lucee up -d sis`, `rtc lucee build`); don't try to fix the container stack yourself.

## 1. Plan the tickets

From each pasted issue take the number `N` and the title.

- Branch: `g<N>.dr` (team convention), e.g. issue #9999 → `g9999.dr`.
- Instance name: `"$RTW" name g<N>.dr` → `g9999-dr`. This is also the Herdr tab label and agent name.
- Base ref for new branches: the remote default branch, after a fetch:

  ```bash
  REPO="$("$RTW" repo)"
  git -C "$REPO" fetch origin --quiet
  BASE="$(git -C "$REPO" symbolic-ref --short refs/remotes/origin/HEAD)"   # e.g. origin/master
  ```

  If the user named a base, use theirs. Existing branches are reused by `rtw new` (no base needed).

Show the plan (issue → branch → URL) in a short table before creating anything if there are more
than 4 tickets or anything is ambiguous (missing issue number, branch already has a worktree).
Each instance is a Lucee container (~1.5 GB); warn above 4 at once.

## 2. Create worktrees (sequentially)

```bash
"$RTW" new g9999.dr "$BASE"     # creates worktree + container, waits until the site answers (~30-60s)
```

Run them one at a time (parallel `git worktree add` can collide on repo locks). If one fails, report
it and continue with the others. Get the path and URL from `"$RTW" url <name> --json`
(`worktree`, `url`). If the worktree already exists, use `"$RTW" up <name>` instead.

## 3. Write each kickoff prompt

Write to `~/.cache/rt-tickets/<name>.md` (outside the repo so it's never committed):

```markdown
# GitHub issue #<N>: <title>

<the issue text exactly as the user pasted it>

---

You are working on this issue in the rtw worktree `<name>` (branch `g<N>.dr`) at `<worktree path>`.
This worktree's RealTime site is <url>; it has its own browser, already selected for this session.

1. Investigate and implement the change in this worktree only.
2. Verify it in the browser: call `rt_login` (it targets this worktree automatically), then use the
   chrome-devtools tools on <url> only. Exercise the scenario from the issue and check for errors.
3. Do not commit, push, or modify other worktrees or the main checkout. Leave changes uncommitted
   for the user to review.
4. Never execute SQL (no DB clients, driver scripts, or throwaway pages that run SQL). If the issue
   needs any schema or data change, write it to `db-changes/g<N>-<short-description>.sql` in this
   worktree following the Databases rules in AGENTS.md, and note which code can't be verified until
   the user runs it.
5. Finish with: root cause / approach, files changed, any SQL files the user must run (and against
   which databases), how you verified it (pages, steps, results), and anything left open or
   needing a decision.
```

## 4. Start a pi session per ticket in its own Herdr tab

```bash
TAB_JSON="$(herdr tab create --cwd "<worktree path>" --label "<name>" --no-focus)"
PANE="$(printf '%s' "$TAB_JSON" | python3 -c 'import json,sys;print(json.load(sys.stdin)["result"]["root_pane"]["pane_id"])')"
herdr agent start "<name>" --kind pi --pane "$PANE" -- "@$HOME/.cache/rt-tickets/<name>.md" "Work on the GitHub issue in the attached file, following its instructions."
```

Never pass the issue text on the command line; always use the prompt file. Use `--no-focus` so the
user's current tab stays put.

## 5. Report and monitor

Reply with a table: issue, branch, URL, Herdr tab/agent name, status. Then:

- `herdr agent list` / `herdr agent get <name>` for status (`working`, `blocked`, `done`, `idle`).
- `blocked` usually means the session is waiting on a browser-permission prompt or a question. Tell
  the user which tab needs them; don't answer prompts in other panes on their behalf.
- Only wait (`herdr agent wait <name> --until done --until idle --timeout <ms>`) if the user asks you
  to collect results; then read each summary with `herdr agent read <name> --source recent --lines 80`
  and give a combined report. Put any `db-changes/*.sql` files first, as action items for the user
  (you never run them).

## Cleanup (only when the user asks)

Closing a ticket is the user's call: `/rtw rm <name>` (removes container, worktree, and that
worktree's browser profile; keeps the branch). Close the Herdr tab with `herdr tab close <tab_id>`.
