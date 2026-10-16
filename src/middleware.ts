import { defineMiddleware } from "astro:middleware";
import { ADMIN_COOKIE, adminParam, isAdminToken } from "./lib/admin";
import { adminSecret } from "./lib/admin-env";
import { clearEmptyDatetimes, contentCollection } from "./lib/cms-fixes";

const YEAR = 60 * 60 * 24 * 365;

/**
 * Lets the admin clear an optional date (emdash 1.3 bug, see lib/cms-fixes.ts).
 * emdash's content routes read the body with `request.json()` on the original request (an Astro rewrite with a new
 * Request doesn't replace it), so we give that request the corrected JSON.
 */
export const onRequest = defineMiddleware(async (context, next) => {
	const { request } = context;

	// ?admin=<token> signs this browser in as admin, ?admin=off signs out; then drop the parameter from the URL.
	const admin = request.method === "GET" ? adminParam(context.url) : null;
	if (admin) {
		if (admin.value === "off") context.cookies.delete(ADMIN_COOKIE, { path: "/" });
		else if (isAdminToken(admin.value, adminSecret()))
			context.cookies.set(ADMIN_COOKIE, admin.value, { path: "/", httpOnly: true, secure: true, sameSite: "lax", maxAge: YEAR });
		return context.redirect(admin.cleanUrl, 302);
	}

	const collection = contentCollection(request.method, context.url.pathname);
	if (!collection || !request.headers.get("content-type")?.includes("application/json")) return next();

	let body: unknown;
	try {
		body = await request.clone().json();
	} catch {
		return next();
	}
	const fixed = clearEmptyDatetimes(collection, body);
	if (fixed !== body) Object.defineProperty(request, "json", { value: async () => fixed });
	return next();
});
