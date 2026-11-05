# rtw (pi extension)

`/rtw` drives `~/code/containerization/containers/rtw` from inside pi and moves the current pi
session into the worktree so work starts there (with `rt-browser` pointed at that worktree's
`https://<name>.sis.localhost`).

| Command | What it does |
|---|---|
| `/rtw <branch> [--from <ref>] [prompt…]` | `rtw new` (or `rtw up` if the worktree exists), then switches this pi session into `~/code/realtime-wt/<name>`. Without a prompt it offers to resume an existing session there; with a prompt it starts a new session and sends it. |
| `/rtw main [prompt…]` | Switch back to the main checkout (`sis.localhost`). |
| `/rtw` / `/rtw ls` | `rtw ls`. |
| `/rtw up\|down\|restart <name>` | Container control. |
| `/rtw rm <name> [--force]` | Asks first; refuses if this session is inside that worktree. |

Examples: `/rtw g9999.dr`, `/rtw g9999.dr --from origin/master Fix the attendance export (ticket 9999)`.

## How the session switch works

pi reads a session's cwd from the session file header, so `/rtw` writes a header-only session file
for the worktree (recording the current session as its parent) and calls `ctx.switchSession()`, the
same path `/resume` uses. Tools, context files, and `rt-browser` detection all restart in the new cwd.
The old session stays intact and can be resumed from the main checkout.

`rtw` is found via `RTW_BIN`, then `PATH`, then `~/code/containerization/containers/rtw`.
