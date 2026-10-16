import type { APIRoute } from "astro";
import { json, parseSubscribeBody, readJson } from "../../../lib/push-api";
import { playerExists, upsertSubscription } from "../../../lib/push-db";
import { db } from "../../../lib/push-env";

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
	const body = parseSubscribeBody(await readJson(request));
	if (!body) return json({ error: "Invalid subscription" }, 400);
	const sql = db();
	if (!(await playerExists(sql, body.playerId))) return json({ error: "Unknown player" }, 400);
	await upsertSubscription(sql, body, new Date());
	return json({ ok: true });
};
