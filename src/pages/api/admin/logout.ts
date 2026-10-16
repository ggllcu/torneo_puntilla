import type { APIRoute } from "astro";
import { ADMIN_COOKIE } from "../../../lib/admin";
import { json } from "../../../lib/push-api";

export const prerender = false;

export const POST: APIRoute = async ({ cookies }) => {
	cookies.delete(ADMIN_COOKIE, { path: "/" });
	return json({ ok: true });
};
