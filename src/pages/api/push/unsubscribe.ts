import type { APIRoute } from "astro";
import { json, parseEndpointBody, readJson } from "../../../lib/push-api";
import { deleteSubscription } from "../../../lib/push-db";
import { db } from "../../../lib/push-env";

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
	const endpoint = parseEndpointBody(await readJson(request));
	if (!endpoint) return json({ error: "Invalid endpoint" }, 400);
	await deleteSubscription(db(), endpoint);
	return json({ ok: true });
};
