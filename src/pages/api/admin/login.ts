import type { APIRoute } from "astro";
import { ADMIN_COOKIE, ADMIN_COOKIE_MAX_AGE, isAdminToken, parsePasswordBody } from "../../../lib/admin";
import { adminSecret } from "../../../lib/admin-env";
import { json, readJson } from "../../../lib/push-api";

export const prerender = false;

/** Settings → "Become admin". */
export const POST: APIRoute = async ({ request, cookies }) => {
	const password = parsePasswordBody(await readJson(request));
	if (!password || !isAdminToken(password, adminSecret())) return json({ error: "Wrong password" }, 401);
	cookies.set(ADMIN_COOKIE, password, {
		path: "/",
		httpOnly: true,
		secure: true,
		sameSite: "lax",
		maxAge: ADMIN_COOKIE_MAX_AGE,
	});
	return json({ ok: true });
};
