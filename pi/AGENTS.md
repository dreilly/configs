# Global Instructions

## Git

- Read-only git is always fine: `status`, `diff`, `log`, `show`, `blame`, `fetch`, listing branches/tags/remotes/stashes.
- Do not run git commands that change repository state unless I explicitly ask for that action in my current request. This includes `add`, `commit`, `push`, `pull`, `merge`, `rebase`, `reset`, `revert`, `cherry-pick`, `checkout`, `switch`, `restore`, `stash`, `clean`, `rm`, `mv`, creating/deleting branches or tags, and changing git config.
- Never force-push, amend, rewrite history, `reset --hard`, `clean -f`, discard uncommitted changes, or use `--no-verify` without my explicit approval, even if it looks like the fix.
- I make my own commits. When I ask for a commit message, output the message only; do not stage or commit.
- A `git-guard` extension asks me to confirm state-changing git commands. If it blocks one, do not retry it or work around it (different flags, `sh -c`, aliases, scripts). Say what you wanted to run and why, then wait.

## Databases

I run all database changes myself. Local and worktree RealTime instances share the real remote SQL Server (`realitcustomers` and the district databases), so anything run against it affects shared data.

- Never execute SQL of any kind: no `sqlcmd`/`psql`/`mysql`/other DB clients, no driver scripts (pyodbc, pymssql, tedious, ...), no `podman exec` into a DB, and no temporary `.cfm`/`.cfc` pages, scheduled tasks, or browser actions whose purpose is to run SQL or change schema or data.
- If a task needs a schema or data change (tables, columns, indexes, constraints, views, procs, functions, triggers, seed/lookup data, backfills, jobs rows), write the SQL to a file and stop there:
  - Location: `db-changes/<ticket>-<short-description>.sql` at the root of the checkout/worktree (for example `db-changes/g9999-add-export-flag.sql`). Leave it uncommitted for me to review.
  - T-SQL for SQL Server. Start with a comment header: ticket, purpose, and target database(s): `realitcustomers`, every district database, or specific ones.
  - Make it re-runnable (`IF NOT EXISTS` / `IF COL_LENGTH(...) IS NULL`, etc.), wrap changes in a transaction, and include a commented rollback section.
  - Call out anything destructive or slow (drops, data updates, large backfills) in the header.
- Code that depends on the change can't be verified until I run the script. Say what is unverified because of that, and keep the code compatible with the current schema where practical.
- In your summary, list each SQL file and what it does, and say I need to run it.
- A `db-guard` extension blocks database client commands. If it blocks one, do not work around it; write the SQL to a file instead.
