# Global Instructions

## Git

- Read-only git is always fine: `status`, `diff`, `log`, `show`, `blame`, `fetch`, listing branches/tags/remotes/stashes.
- Do not run git commands that change repository state unless I explicitly ask for that action in my current request. This includes `add`, `commit`, `push`, `pull`, `merge`, `rebase`, `reset`, `revert`, `cherry-pick`, `checkout`, `switch`, `restore`, `stash`, `clean`, `rm`, `mv`, creating/deleting branches or tags, and changing git config.
- Never force-push, amend, rewrite history, `reset --hard`, `clean -f`, discard uncommitted changes, or use `--no-verify` without my explicit approval, even if it looks like the fix.
- I make my own commits. When I ask for a commit message, output the message only; do not stage or commit.
- A `git-guard` extension asks me to confirm state-changing git commands. If it blocks one, do not retry it or work around it (different flags, `sh -c`, aliases, scripts). Say what you wanted to run and why, then wait.
