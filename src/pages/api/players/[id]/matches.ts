import type { APIRoute } from "astro";
import { json } from "../../../../lib/push-api";
import { loadSnapshot, playerExists } from "../../../../lib/push-db";
import { db } from "../../../../lib/push-env";
import { playerMatches } from "../../../../lib/reminders";

export const prerender = false;

/** `?all=1` includes finished and past matches (used to highlight them on the calendar). */
export const GET: APIRoute = async ({ params, url }) => {
	const id = params.id ?? "";
	const sql = db();
	if (!(await playerExists(sql, id))) return json({ error: "Player not found" }, 404);
	const matches = playerMatches(await loadSnapshot(sql), id, new Date(), { includePast: url.searchParams.get("all") === "1" });
	return json(matches.map((m) => ({ ...m, start: m.start.toISOString() })));
};
