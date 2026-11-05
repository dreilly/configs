/**
 * Loads RealTime test credentials and redacts them from text.
 *
 * Values from this file must never be returned to the model: error messages name keys only.
 */
import { readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { INSTANCE_RE } from "./rtw.ts";

export const CREDS_PATH = process.env.RT_LOGIN_ENV ?? join(homedir(), ".config", "realtime-test", "login.env");
export const CREDS_DIR = dirname(CREDS_PATH);

/** District used when none is given (`/rt-browser` with no argument, rt_login without `district`). */
export const DEFAULT_DISTRICT = "realitdemo";
export const DISTRICT_PLACEHOLDER = "{district}";

export interface RtCreds {
	/** RT_BASE_URL, e.g. https://sis.localhost/{district}/stay.cfm */
	baseUrlTemplate: string;
	user: string;
	pass: string;
	secAnswer: string;
	/** askRememberQuestion "remember this computer": 0 = no, 1 = today, 2 = permanently */
	remember: "0" | "1" | "2";
}

export class CredentialsError extends Error {}

function parseEnv(text: string): Record<string, string> {
	const out: Record<string, string> = {};
	for (const raw of text.split(/\r?\n/)) {
		const line = raw.trim();
		if (!line || line.startsWith("#")) continue;
		const eq = line.indexOf("=");
		if (eq < 1) continue;
		const key = line.slice(0, eq).replace(/^export\s+/, "").trim();
		let value = line.slice(eq + 1).trim();
		if (value.length >= 2 && (value[0] === '"' || value[0] === "'") && value.at(-1) === value[0]) {
			value = value.slice(1, -1);
		}
		out[key] = value;
	}
	return out;
}

export function loadCreds(): RtCreds {
	let text: string;
	try {
		text = readFileSync(CREDS_PATH, "utf8");
	} catch {
		throw new CredentialsError(`Credentials file not found or unreadable: ${CREDS_PATH}`);
	}
	const env = parseEnv(text);
	const missing = ["RT_BASE_URL", "RT_USER", "RT_PASS", "RT_SEC_ANSWER"].filter((k) => !env[k]);
	if (missing.length) throw new CredentialsError(`Credentials file is missing: ${missing.join(", ")}`);
	try {
		new URL(env.RT_BASE_URL.replaceAll(DISTRICT_PLACEHOLDER, DEFAULT_DISTRICT));
	} catch {
		throw new CredentialsError("RT_BASE_URL is not a valid URL");
	}
	const remember = env.RT_REMEMBER_COMPUTER ?? "1";
	if (remember !== "0" && remember !== "1" && remember !== "2") {
		throw new CredentialsError("RT_REMEMBER_COMPUTER must be 0, 1, or 2");
	}
	return { baseUrlTemplate: env.RT_BASE_URL, user: env.RT_USER, pass: env.RT_PASS, secAnswer: env.RT_SEC_ANSWER, remember };
}

// ---- districts -------------------------------------------------------------

/** Validate and normalize a district path segment (e.g. "RealITDemo" -> "realitdemo"). */
export function normalizeDistrict(raw: string | undefined): string {
	const d = (raw ?? "").trim().replace(/^\/+|\/+$/g, "");
	if (!d) return DEFAULT_DISTRICT;
	if (!/^[A-Za-z0-9_-]+$/.test(d)) throw new CredentialsError(`Invalid district "${d}": use letters, digits, '_' or '-' only.`);
	return d.toLowerCase();
}

/**
 * Login entry URL for a district. Replaces `{district}` in RT_BASE_URL; if the template has no
 * placeholder, the first path segment is treated as the district (https://host/<district>/stay.cfm).
 */
export function districtBaseUrl(template: string, district: string): string {
	if (template.includes(DISTRICT_PLACEHOLDER)) return template.replaceAll(DISTRICT_PLACEHOLDER, encodeURIComponent(district));
	const url = new URL(template);
	const parts = url.pathname.split("/");
	if (parts.length > 2 && parts[1]) parts[1] = encodeURIComponent(district);
	url.pathname = parts.join("/");
	return url.toString();
}

// ---- instances (per-worktree hosts) -----------------------------------------

/** `district@main` targets the main checkout (RT_BASE_URL's host as-is). */
export const MAIN_INSTANCE = "main";

/** Where to log in: a district on the main host, or on `<instance>.<main host>` (an `rtw` worktree). */
export interface RtTarget {
	district: string;
	/** rtw instance name; undefined = main checkout. */
	instance?: string;
}

export const targetKey = (t: RtTarget) => (t.instance ? `${t.district}@${t.instance}` : t.district);

/** Validate an instance name. "" / "main" -> undefined (main checkout). */
export function normalizeInstance(raw: string | undefined): string | undefined {
	const i = (raw ?? "").trim().toLowerCase();
	if (!i || i === MAIN_INSTANCE) return undefined;
	if (!INSTANCE_RE.test(i)) {
		throw new CredentialsError(`Invalid instance "${i}": use the rtw name (lowercase letters, digits, '-'), e.g. g12996-dr.`);
	}
	return i;
}

/**
 * Parse `district[@instance]`. Missing parts fall back to `defaults`:
 *   "realitdemo"          -> realitdemo on defaults.instance (the detected worktree, if any)
 *   "realitdemo@g12-dr"   -> realitdemo on https://g12-dr.<host>
 *   "realitdemo@main"     -> realitdemo on the main host
 *   "@g12-dr"             -> defaults.district on g12-dr
 */
export function parseTarget(raw: string | undefined, defaults: RtTarget): RtTarget {
	const s = (raw ?? "").trim();
	const at = s.indexOf("@");
	const d = at < 0 ? s : s.slice(0, at);
	return {
		district: d ? normalizeDistrict(d) : defaults.district,
		instance: at < 0 ? defaults.instance : normalizeInstance(s.slice(at + 1)),
	};
}

/**
 * Login entry URL for a target. An instance only ever prepends one validated DNS label to RT_BASE_URL's
 * host, so credentials can't be sent anywhere but the configured host or its direct subdomains.
 */
export function targetBaseUrl(template: string, target: RtTarget): string {
	const url = new URL(districtBaseUrl(template, target.district));
	const instance = normalizeInstance(target.instance);
	if (instance) url.hostname = `${instance}.${url.hostname}`;
	return url.toString();
}

/** Non-secret preview of the login URL for permission prompts. Never throws. */
export function previewLoginUrl(target: RtTarget): string | undefined {
	try {
		return targetBaseUrl(loadCreds().baseUrlTemplate, target);
	} catch {
		return undefined;
	}
}

// ---- redaction -------------------------------------------------------------

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const htmlEscape = (s: string) =>
	s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

function variants(value: string): string[] {
	const enc = encodeURIComponent(value);
	const form = new URLSearchParams({ v: value }).toString().slice(2); // browser form-post encoding
	return [value, enc, enc.replace(/%20/g, "+"), form, form.replace(/\+/g, "%20"), JSON.stringify(value).slice(1, -1), htmlEscape(value)];
}

let cache: { mtimeMs: number; re: RegExp | null } | undefined;

/** Regex matching any credential value (and common encodings), or null if creds are unavailable. */
function secretPattern(): RegExp | null {
	let mtimeMs: number;
	try {
		mtimeMs = statSync(CREDS_PATH).mtimeMs;
	} catch {
		return null;
	}
	if (cache?.mtimeMs === mtimeMs) return cache.re;

	let re: RegExp | null = null;
	try {
		const c = loadCreds();
		const all = new Set<string>();
		for (const v of [c.pass, c.secAnswer, c.user]) for (const x of variants(v)) if (x.length >= 3) all.add(x);
		const isWord = (ch: string) => /[A-Za-z0-9]/.test(ch);
		// Word-bounded (on alphanumeric edges) so short values don't mangle unrelated words.
		const alts = [...all]
			.sort((a, b) => b.length - a.length)
			.map((s) => `${isWord(s[0]) ? "(?<![A-Za-z0-9])" : ""}${escapeRe(s)}${isWord(s.at(-1)!) ? "(?![A-Za-z0-9])" : ""}`);
		if (alts.length) re = new RegExp(alts.join("|"), "gi");
	} catch {
		re = null;
	}
	cache = { mtimeMs, re };
	return re;
}

export const REDACTED = "[REDACTED]";

export function redact(text: string): string {
	const re = secretPattern();
	return re ? text.replace(re, REDACTED) : text;
}

/** Deep-redact strings inside any JSON-like value. Returns [newValue, changed]. */
export function redactDeep<T>(value: T): [T, boolean] {
	if (typeof value === "string") {
		const r = redact(value);
		return [r as T, r !== value];
	}
	if (Array.isArray(value)) {
		let changed = false;
		const out = value.map((v) => {
			const [r, c] = redactDeep(v);
			changed ||= c;
			return r;
		});
		return [(changed ? out : value) as T, changed];
	}
	if (value && typeof value === "object") {
		let changed = false;
		const out: Record<string, unknown> = {};
		for (const [k, v] of Object.entries(value)) {
			const [r, c] = redactDeep(v);
			changed ||= c;
			out[k] = r;
		}
		return [(changed ? out : value) as T, changed];
	}
	return [value, false];
}
