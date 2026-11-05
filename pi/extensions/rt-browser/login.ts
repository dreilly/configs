/**
 * RealTime SIS login flow, driven over CDP so credential values never pass through the model.
 *
 * Flow (see student/general/login.cfm, includes/osk8.5.cfm, general/preValidateuser.cfm,
 * security/INC_askRememberQuestion.cfm, security/setRemember.cfm):
 *   RT_BASE_URL (stay.cfm) -> login.cfm ([SSO: click #toggle-login-template] #login_form, ajax)
 *   -> prevalidateuser.cfm (auto-post)
 *   -> validateuser.cfm -> [askRememberQuestion.cfm (#myans)] -> welcome.cfm
 */
import puppeteer, { type Browser, type Page } from "puppeteer-core";
import { browserSlot, ensureChrome } from "./chrome.ts";
import { loadCreds, normalizeDistrict, normalizeInstance, redact, type RtCreds, targetBaseUrl } from "./credentials.ts";

export class LoginError extends Error {}

export interface LoginResult {
	status: "already-logged-in" | "logged-in";
	district: string;
	/** rtw instance; undefined = main checkout. */
	instance?: string;
	/** Origin logged into, e.g. https://g12996-dr.sis.localhost */
	origin: string;
	url: string;
	title: string;
	steps: string[];
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type State =
	| "cert-warning"
	| "login"
	| "ask-remember"
	| "two-factor"
	| "set-password"
	| "set-security-questions"
	| "logged-out"
	| "no-district"
	| "error"
	| "logged-in"
	| "unknown";

interface PageInfo {
	state: State;
	href: string;
	title: string;
	detail?: string;
}

async function inspect(page: Page): Promise<PageInfo> {
	const raw = await page
		.evaluate(() => {
			const body = document.body?.innerText ?? "";
			const err = body.match(/Error details:\s*([^\n]*)/);
			return {
				href: location.href,
				title: document.title,
				certWarning: location.href.startsWith("chrome-error://") && !!document.querySelector("#details-button, #proceed-link"),
				loginForm: !!document.querySelector("#login_form #username"),
				myAns: !!document.querySelector("#myans"),
				totp: !!document.querySelector('input[name="totpkey"]:not([type="hidden"])'),
				hasError: body.includes("An unexpected error has occurred"),
				errorDetail: err?.[1]?.slice(0, 300) ?? null,
			};
		})
		.catch(() => null);
	if (!raw) return { state: "unknown", href: page.url(), title: "" };

	const url = new URL(raw.href, "http://x");
	const path = url.pathname.toLowerCase();
	const msg = url.searchParams.get("Message") ?? url.searchParams.get("message") ?? url.searchParams.get("msg") ?? undefined;
	const base = { href: raw.href, title: raw.title };

	if (raw.certWarning) return { ...base, state: "cert-warning" };
	if (raw.hasError) return { ...base, state: "error", detail: raw.errorDetail ?? undefined };
	if (raw.myAns || path.endsWith("/askrememberquestion.cfm")) return { ...base, state: "ask-remember", detail: msg };
	if (raw.totp || path.endsWith("/validateuser2fa.cfm")) return { ...base, state: "two-factor" };
	if (path.endsWith("/setpassword.cfm")) return { ...base, state: "set-password" };
	if (path.endsWith("/setsecurityquestions.cfm")) return { ...base, state: "set-security-questions" };
	if (raw.loginForm || path.endsWith("/login.cfm")) return { ...base, state: "login", detail: msg };
	if (path.endsWith("/logout.cfm")) return { ...base, state: "logged-out" };
	if (path.includes("nodistrict")) return { ...base, state: "no-district" };
	if (path.startsWith("/student/") || path.startsWith("/ppt/")) return { ...base, state: "logged-in" };
	return { ...base, state: "unknown" };
}

/** Wait until the URL has been stable and the document complete for a moment (JS redirects included). */
async function settle(page: Page, maxMs = 20_000) {
	const deadline = Date.now() + maxMs;
	let last = page.url();
	let stableSince = Date.now();
	while (Date.now() < deadline) {
		await sleep(300);
		const url = page.url();
		if (url !== last) {
			last = url;
			stableSince = Date.now();
			continue;
		}
		const ready = await page.evaluate(() => document.readyState === "complete").catch(() => false);
		if (!ready) {
			stableSince = Date.now();
			continue;
		}
		if (Date.now() - stableSince >= 1200) return;
	}
}

/** Chrome's "Your connection is not private" page: Advanced -> Proceed to <host> (unsafe). */
async function passCertWarning(page: Page) {
	const details = await page.$("#details-button");
	if (details) {
		await details.click();
		await sleep(300);
	}
	const proceed = await page.$("#proceed-link");
	if (proceed) {
		await Promise.all([page.waitForNavigation({ timeout: 20_000 }).catch(() => undefined), proceed.click()]);
	} else {
		// Fallback Chrome supports on its interstitial when the link isn't offered.
		await Promise.all([page.waitForNavigation({ timeout: 20_000 }).catch(() => undefined), page.keyboard.type("thisisunsafe")]);
	}
}

async function goto(page: Page, url: string, steps: string[]) {
	await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30_000 }).catch(() => undefined);
	await sleep(300);
	if ((await inspect(page)).state === "cert-warning") {
		await passCertWarning(page);
		steps.push("clicked through certificate warning");
	}
	await settle(page);
}

async function pickPage(browser: Browser, origin: string): Promise<Page> {
	const pages = await browser.pages();
	const page =
		pages.find((p) => p.url().startsWith(origin)) ??
		pages.find((p) => p.url() === "about:blank" || p.url().startsWith("chrome-error://")) ??
		(await browser.newPage());
	await page.bringToFront().catch(() => undefined);
	return page;
}

/**
 * Districts with SSO enabled show only a "Login with Single Sign On" button; the standard form
 * (#main-login-template) is hidden until "Use Standard Login" (#toggle-login-template) is clicked.
 * Returns true if the toggle was clicked.
 */
async function revealStandardLogin(page: Page): Promise<boolean> {
	const isVisible = () =>
		page
			.evaluate(() => {
				const el = document.querySelector<HTMLElement>("#login_form #username");
				return !!el && el.getClientRects().length > 0 && getComputedStyle(el).visibility !== "hidden";
			})
			.catch(() => false);
	if (await isVisible()) return false;
	const toggle = await page.$("#toggle-login-template");
	if (!toggle) return false;
	await toggle.click();
	const deadline = Date.now() + 5_000;
	while (Date.now() < deadline) {
		if (await isVisible()) return true;
		await sleep(150);
	}
	throw new LoginError("Clicked 'Use Standard Login' but the standard login form did not appear.");
}

async function submitLogin(page: Page, creds: RtCreds, steps: string[]) {
	await page.waitForSelector('#login_form input[type="submit"]', { timeout: 15_000 }).catch(() => {
		throw new LoginError("Login form did not finish loading (no Log In button).");
	});
	if (await revealStandardLogin(page)) steps.push("clicked 'Use Standard Login' (SSO login page)");
	await page.evaluate(
		(u: string, p: string) => {
			const set = (sel: string, v: string) => {
				const el = document.querySelector<HTMLInputElement>(sel);
				if (!el) throw new Error(`missing ${sel}`);
				el.value = v;
				el.dispatchEvent(new Event("input", { bubbles: true }));
				el.dispatchEvent(new Event("change", { bubbles: true }));
			};
			set("#username", u);
			set("#password", p);
		},
		creds.user,
		creds.pass,
	);

	const startUrl = page.url();
	await page.click('#login_form input[type="submit"]');

	const deadline = Date.now() + 30_000;
	while (Date.now() < deadline) {
		await sleep(300);
		if (page.url() !== startUrl) return;
		const msg = await page.evaluate(() => document.querySelector("#msgbox")?.textContent ?? "").catch(() => "");
		if (/invalid login/i.test(msg)) throw new LoginError("Login rejected: the login page reported 'Invalid Login'.");
	}
	throw new LoginError("Timed out waiting for the login page to redirect after submitting.");
}

async function answerSecurityQuestion(page: Page, creds: RtCreds): Promise<string> {
	const question = await page
		.evaluate(() => document.querySelector("#myans")?.closest("tr")?.querySelector("td")?.textContent?.trim() ?? "")
		.catch(() => "");
	await page.evaluate(
		(ans: string, rem: string) => {
			const sel = document.querySelector<HTMLSelectElement>('select[name="remcomp"]');
			if (sel) {
				const values = Array.from(sel.options).map((o) => o.value);
				sel.value = values.includes(rem) ? rem : (values.filter((v) => v <= rem).sort().pop() ?? values[0]);
			}
			const input = document.querySelector<HTMLInputElement>("#myans");
			if (!input) throw new Error("missing #myans");
			input.value = ans;
		},
		creds.secAnswer,
		creds.remember,
	);
	await Promise.all([
		page.waitForNavigation({ timeout: 20_000 }).catch(() => undefined),
		page.click('form[name="go"] input[type="submit"]'),
	]);
	await settle(page);
	return question;
}

/** District the browser's RealTime session belongs to (setdistrictcookies.cfm sets `districtid`). */
async function sessionDistrict(page: Page, origin: string): Promise<string | undefined> {
	const cookies = await page.cookies(origin).catch(() => []);
	return cookies.find((c) => c.name.toLowerCase() === "districtid")?.value?.toLowerCase();
}

export async function rtLogin(
	opts: { district?: string; instance?: string; force?: boolean; signal?: AbortSignal } = {},
): Promise<LoginResult> {
	const creds = loadCreds();
	const district = normalizeDistrict(opts.district);
	const instance = normalizeInstance(opts.instance);
	const baseUrl = targetBaseUrl(creds.baseUrlTemplate, { district, instance });
	const origin = new URL(baseUrl).origin;
	const who = { district, instance, origin };
	const steps: string[] = [];

	const slot = browserSlot(instance);
	await ensureChrome(slot);
	const browser = await puppeteer.connect({ browserURL: slot.url, defaultViewport: null });
	try {
		const page = await pickPage(browser, origin);

		if (opts.force) {
			await goto(page, `${origin}/student/general/logout.cfm`, steps);
			steps.push("logged out (force)");
		} else {
			await goto(page, `${origin}/student/general/welcome.cfm`, steps);
			const info = await inspect(page);
			if (info.state === "logged-in") {
				const current = await sessionDistrict(page, origin);
				if (current === district) {
					return { status: "already-logged-in", ...who, url: info.href, title: info.title, steps: [...steps, "existing session is valid"] };
				}
				await goto(page, `${origin}/student/general/logout.cfm`, steps);
				steps.push(`logged out of ${current ?? "unknown district"} to switch to ${district}`);
			}
		}

		await goto(page, baseUrl, steps);
		let submittedLogin = false;
		let answeredQuestion = false;

		for (let i = 0; i < 8; i++) {
			opts.signal?.throwIfAborted();
			const info = await inspect(page);
			switch (info.state) {
				case "cert-warning":
					await passCertWarning(page);
					await settle(page);
					steps.push("clicked through certificate warning");
					continue;
				case "login":
					if (submittedLogin) {
						throw new LoginError(`Returned to the login page after submitting${info.detail ? `: "${info.detail}"` : "."}`);
					}
					await submitLogin(page, creds, steps);
					await settle(page);
					submittedLogin = true;
					steps.push("submitted username/password");
					continue;
				case "ask-remember": {
					if (answeredQuestion) {
						// Never retry: 3 wrong answers logs the user out (security/setRemember.cfm).
						throw new LoginError(
							`Security answer was rejected${info.detail ? ` (${info.detail})` : ""}. Not retrying to avoid lockout. Check RT_SEC_ANSWER.`,
						);
					}
					const question = await answerSecurityQuestion(page, creds);
					answeredQuestion = true;
					steps.push(`answered security question${question ? `: "${question}"` : ""}`);
					continue;
				}
				case "two-factor":
					throw new LoginError("Account requires a two-factor code; rt_login does not support 2FA.");
				case "set-password":
					throw new LoginError("Account is being forced to set a new password (setPassword.cfm). Fix the test account manually.");
				case "set-security-questions":
					throw new LoginError("Account must set up security questions first (setSecurityQuestions.cfm). Fix the test account manually.");
				case "logged-out":
					throw new LoginError("Landed on logout.cfm (possibly too many wrong security answers or an expired session).");
				case "no-district":
					throw new LoginError(`No district resolved (${info.href}). Check the district name "${district}" and RT_BASE_URL.`);
				case "error":
					throw new LoginError(`Application error page at ${info.href}${info.detail ? `: ${info.detail}` : ""}`);
				case "logged-in":
					return { status: "logged-in", ...who, url: info.href, title: info.title, steps };
				default:
					throw new LoginError(`Unrecognized page during login: ${info.href} ("${info.title}")`);
			}
		}
		throw new LoginError("Login did not complete within the expected number of steps.");
	} finally {
		await browser.disconnect().catch(() => undefined);
	}
}

/** Error text safe to show the model. */
export function safeErrorMessage(err: unknown): string {
	const msg = err instanceof Error ? err.message : String(err);
	return redact(msg);
}
