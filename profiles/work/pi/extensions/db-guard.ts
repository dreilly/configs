/**
 * DB Guard
 *
 * The agent must never execute SQL: local and worktree RealTime instances share the real remote SQL
 * Server. Database changes are written to db-changes/*.sql for the user to run (see AGENTS.md).
 *
 * Hard-blocks (no prompt) bash tool calls (including ones made from codemode scripts, which go through
 * tool_call too) that:
 *   - run a database client in command position (sqlcmd, psql, mysql, sqlite3, bcp, usql, ...)
 *   - exec into a container and run a database client there (podman/docker exec ... sqlcmd)
 *   - run a script interpreter with an inline DB driver (python -c "import pyodbc ...", node -e ... tedious)
 *
 * Best effort: it catches accidents and direct attempts, not determined workarounds. Commands you type
 * yourself with `!` are not affected (those are user_bash, not tool_call).
 */
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const CLIENTS = [
	"sqlcmd", "osql", "isql", "bcp", "mssql-cli", "mssql", "usql", "sqlpackage", "mssql-scripter",
	"psql", "pg_restore", "pgcli", "mysql", "mariadb", "mysqlsh", "mycli", "sqlite3", "litecli",
	"mongosh", "mongo", "Invoke-Sqlcmd", "duckdb",
];
const CLIENT_ALT = CLIENTS.map((c) => c.replace(/[-]/g, "\\-")).join("|");

// Client in command position: start, after a separator/subshell, or at the start of a `sh -c "..."`
// string, optionally behind env assignments or wrappers (sudo, env, exec, xargs, ...) and a path
// (/opt/mssql-tools/bin/sqlcmd). Quoted mentions like `rg "sqlcmd"` are not blocked.
const CLIENT_RE = new RegExp(
	`(?:^|[;&|(\`\\n{]|\\$\\(|-c\\s+['"])\\s*(?:(?:[A-Za-z_][A-Za-z0-9_]*=\\S*|sudo|command|exec|time|nohup|env|xargs(?:\\s+-\\S+)*|npx(?:\\s+-y)?|uvx|pipx\\s+run)\\s+)*(?:\\S*\\/)?(${CLIENT_ALT})(?=\\s|$|[;&|)\`'"])`,
	"i",
);
const CONTAINER_RE = new RegExp(`\\b(?:podman|docker|nerdctl|kubectl)\\b[^\\n;|&]*\\bexec\\b[^\\n;|&]*\\b(${CLIENT_ALT})\\b`, "i");
const DRIVER_RE =
	/\b(?:python3?|node|bun|deno|ruby|perl|php|pwsh|powershell)\b[^\n]*\b(pyodbc|pymssql|tedious|mssql|sqlalchemy|psycopg2?|mysql\.connector|pymysql|sqlite3|System\.Data\.SqlClient|Microsoft\.Data\.SqlClient)\b/i;

export function findDbExecution(text: string): string | undefined {
	return text.match(CLIENT_RE)?.[1] ?? text.match(CONTAINER_RE)?.[1] ?? text.match(DRIVER_RE)?.[1];
}

export default function dbGuard(pi: ExtensionAPI) {
	pi.on("tool_call", async (event) => {
		if (event.toolName !== "bash") return undefined;
		const text = (event.input as { command?: unknown }).command;
		if (typeof text !== "string") return undefined;

		const hit = findDbExecution(text);
		if (!hit) return undefined;
		return {
			block: true,
			reason:
				`db-guard: executing database commands is not allowed (matched "${hit}"). The user runs all SQL themselves; ` +
				"local instances share the real remote databases. Write the SQL to db-changes/<ticket>-<short-description>.sql " +
				"(see the Databases rules in AGENTS.md) and tell the user it needs to be run. Do not retry or work around this.",
		};
	});
}
