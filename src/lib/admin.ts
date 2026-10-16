// Lightweight admin mode: entering the ADMIN_TOKEN password in Settings → "Become admin" sets a cookie that shows
// the Referee / Change score buttons and allows submitting scores. Just a check, not real security.

export const ADMIN_COOKIE = "puntilla_admin";

/** Constant-time comparison; false when no secret is configured. */
export function isAdminToken(value: string | undefined, secret: string | undefined): boolean {
	if (!secret || !value || value.length !== secret.length) return false;
	let diff = 0;
	for (let i = 0; i < secret.length; i++) diff |= value.charCodeAt(i) ^ secret.charCodeAt(i);
	return diff === 0;
}

export function parsePasswordBody(body: unknown): string | null {
	const password = typeof body === "object" && body !== null ? (body as { password?: unknown }).password : null;
	return typeof password === "string" && password.length > 0 && password.length <= 200 ? password : null;
}

export const ADMIN_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;
