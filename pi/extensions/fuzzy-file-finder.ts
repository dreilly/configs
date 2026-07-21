import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import {
	type AutocompleteItem,
	type AutocompleteProvider,
	type AutocompleteSuggestions,
	fuzzyMatch,
} from "@earendil-works/pi-tui";
import { basename } from "node:path";

const MAX_SUGGESTIONS = 20;
const INDEX_REFRESH_MS = 30_000;

type FileEntry = {
	path: string;
	name: string;
	isDirectory: boolean;
};

type AtQuery = {
	prefix: string;
	query: string;
	isQuoted: boolean;
};

type ScoredEntry = FileEntry & {
	matchScope: number;
	score: number;
};

function extractAtQuery(textBeforeCursor: string): AtQuery | undefined {
	const quotedMatch = textBeforeCursor.match(/(?:^|[ \t'=])(@"[^"]*)$/);
	if (quotedMatch?.[1]) {
		return {
			prefix: quotedMatch[1],
			query: quotedMatch[1].slice(2),
			isQuoted: true,
		};
	}

	const unquotedMatch = textBeforeCursor.match(/(?:^|[ \t"'=])(@[^ \t"'=]*)$/);
	if (!unquotedMatch?.[1]) {
		return undefined;
	}

	return {
		prefix: unquotedMatch[1],
		query: unquotedMatch[1].slice(1),
		isQuoted: false,
	};
}

function parseFdOutput(stdout: string): FileEntry[] {
	return stdout
		.split("\n")
		.filter(Boolean)
		.map((rawPath) => {
			const path = rawPath.replace(/\\/g, "/");
			const isDirectory = path.endsWith("/");
			const pathWithoutSlash = isDirectory ? path.slice(0, -1) : path;
			return {
				path: pathWithoutSlash,
				name: basename(pathWithoutSlash),
				isDirectory,
			};
		});
}

function parseGitOutput(stdout: string): FileEntry[] {
	const entries = new Map<string, FileEntry>();

	for (const rawPath of stdout.split("\0").filter(Boolean)) {
		const path = rawPath.replace(/\\/g, "/");
		entries.set(path, { path, name: basename(path), isDirectory: false });

		let separatorIndex = path.lastIndexOf("/");
		while (separatorIndex > 0) {
			const directoryPath = path.slice(0, separatorIndex);
			if (!entries.has(directoryPath)) {
				entries.set(directoryPath, {
					path: directoryPath,
					name: basename(directoryPath),
					isDirectory: true,
				});
			}
			separatorIndex = directoryPath.lastIndexOf("/");
		}
	}

	return [...entries.values()];
}

function scoreEntry(entry: FileEntry, query: string): ScoredEntry | undefined {
	const nameMatch = fuzzyMatch(query, entry.name);
	if (nameMatch.matches) {
		return { ...entry, matchScope: 0, score: nameMatch.score };
	}

	const pathMatch = fuzzyMatch(query, entry.path);
	if (pathMatch.matches) {
		return { ...entry, matchScope: 1, score: pathMatch.score };
	}

	return undefined;
}

function formatCompletionValue(entry: FileEntry, isQuoted: boolean): string {
	const path = entry.isDirectory ? `${entry.path}/` : entry.path;
	if (isQuoted || path.includes(" ")) {
		return `@"${path}"`;
	}
	return `@${path}`;
}

function findSuggestions(entries: FileEntry[], query: AtQuery): AutocompleteItem[] {
	return entries
		.map((entry) => scoreEntry(entry, query.query))
		.filter((entry): entry is ScoredEntry => entry !== undefined)
		.sort((a, b) =>
			a.matchScope - b.matchScope ||
			a.score - b.score ||
			a.path.length - b.path.length ||
			a.path.localeCompare(b.path),
		)
		.slice(0, MAX_SUGGESTIONS)
		.map((entry) => ({
			value: formatCompletionValue(entry, query.isQuoted),
			label: entry.name + (entry.isDirectory ? "/" : ""),
			description: entry.path,
		}));
}

function createProvider(
	current: AutocompleteProvider,
	getEntries: () => Promise<FileEntry[] | undefined>,
): AutocompleteProvider {
	return {
		async getSuggestions(lines, cursorLine, cursorCol, options): Promise<AutocompleteSuggestions | null> {
			const currentLine = lines[cursorLine] ?? "";
			const query = extractAtQuery(currentLine.slice(0, cursorCol));

			if (!query || !query.query) {
				return current.getSuggestions(lines, cursorLine, cursorCol, options);
			}

			const entries = await getEntries();
			if (options.signal.aborted) {
				return null;
			}
			if (!entries) {
				return current.getSuggestions(lines, cursorLine, cursorCol, options);
			}

			const items = findSuggestions(entries, query);
			if (items.length === 0) {
				return current.getSuggestions(lines, cursorLine, cursorCol, options);
			}

			return { items, prefix: query.prefix };
		},

		applyCompletion(lines, cursorLine, cursorCol, item, prefix) {
			return current.applyCompletion(lines, cursorLine, cursorCol, item, prefix);
		},

		shouldTriggerFileCompletion(lines, cursorLine, cursorCol) {
			return current.shouldTriggerFileCompletion?.(lines, cursorLine, cursorCol) ?? true;
		},
	};
}

export default function (pi: ExtensionAPI): void {
	pi.on("session_start", (_event, ctx) => {
		let entries: FileEntry[] | undefined;
		let loadedAt = 0;
		let loadPromise: Promise<FileEntry[] | undefined> | undefined;
		let loadErrorShown = false;

		const getEntries = (): Promise<FileEntry[] | undefined> => {
			if (entries && Date.now() - loadedAt < INDEX_REFRESH_MS) {
				return Promise.resolve(entries);
			}

			loadPromise ??= (async () => {
				const gitResult = await pi.exec(
					"git",
					["ls-files", "--cached", "--others", "--exclude-standard", "-z"],
					{ cwd: ctx.cwd, timeout: 10_000 },
				);

				if (gitResult.code === 0) {
					entries = parseGitOutput(gitResult.stdout);
					loadedAt = Date.now();
					return entries;
				}

				const fdResult = await pi.exec(
					"fd",
					[
						"--type",
						"f",
						"--type",
						"d",
						"--follow",
						"--hidden",
						"--exclude",
						".git",
						".",
					],
					{ cwd: ctx.cwd, timeout: 10_000 },
				);

				if (fdResult.code !== 0) {
					if (!loadErrorShown) {
						loadErrorShown = true;
						const gitError = gitResult.stderr.trim() || `exit code ${gitResult.code}`;
						const fdError = fdResult.stderr.trim() || `exit code ${fdResult.code}`;
						ctx.ui.notify(
							`fuzzy-file-finder: failed to index files (git: ${gitError}; fd: ${fdError})`,
							"error",
						);
					}
					return entries;
				}

				entries = parseFdOutput(fdResult.stdout);
				loadedAt = Date.now();
				return entries;
			})().finally(() => {
				loadPromise = undefined;
			});

			return loadPromise;
		};

		void getEntries();
		ctx.ui.addAutocompleteProvider((current) => createProvider(current, getEntries));
	});
}
