import { defineMiddleware } from "astro:middleware";
import { clearEmptyDatetimes, contentCollection } from "./lib/cms-fixes";

/**
 * Lets the admin clear an optional date (emdash 1.3 bug, see lib/cms-fixes.ts).
 * emdash's content routes read the body with `request.json()` on the original request (an Astro rewrite with a new
 * Request doesn't replace it), so we give that request the corrected JSON.
 */
export const onRequest = defineMiddleware(async (context, next) => {
	const { request } = context;
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
