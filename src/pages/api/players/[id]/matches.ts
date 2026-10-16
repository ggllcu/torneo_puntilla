import type { APIRoute } from "astro";
import { json } from "../../../../lib/push-api";
import { loadSnapshot, playerExists } from "../../../../lib/push-db";
import { db } from "../../../../lib/push-env";
import { playerMatches } from "../../../../lib/reminders";

export const prerender = false;

export const GET: APIRoute = async ({ params }) => {
	const id = params.id ?? "";
	const sql = db();
	if (!(await playerExists(sql, id))) return json({ error: "Player not found" }, 404);
	const matches = playerMatches(await loadSnapshot(sql), id, new Date());
	return json(matches.map((m) => ({ ...m, start: m.start.toISOString() })));
};
