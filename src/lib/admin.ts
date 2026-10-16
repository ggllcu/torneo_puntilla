// Lightweight admin mode: whoever opens the site once with ?admin=<ADMIN_TOKEN> gets a cookie that shows
// the Referee / Change score buttons and allows submitting scores. ?admin=off signs out.

export const ADMIN_COOKIE = "puntilla_admin";

/** Constant-time comparison; false when no secret is configured. */
export function isAdminToken(value: string | undefined, secret: string | undefined): boolean {
	if (!secret || !value || value.length !== secret.length) return false;
	let diff = 0;
	for (let i = 0; i < secret.length; i++) diff |= value.charCodeAt(i) ^ secret.charCodeAt(i);
	return diff === 0;
}

/** The ?admin value, and the same URL (path + other params) without it. */
export function adminParam(url: URL): { value: string; cleanUrl: string } | null {
	const value = url.searchParams.get("admin");
	if (value === null) return null;
	const params = new URLSearchParams(url.searchParams);
	params.delete("admin");
	const query = params.toString();
	return { value, cleanUrl: url.pathname + (query ? `?${query}` : "") };
}
