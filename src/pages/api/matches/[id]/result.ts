// Public (no auth) result submission from the referee screen. The last submission wins.
import type { APIRoute } from "astro";
import { loadMatch, saveResult } from "../../../../lib/data";
import { checkSubmission } from "../../../../lib/scoring";
import type { SetScore } from "../../../../lib/types";

export const prerender = false;

const json = (body: unknown, status = 200) =>
	Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

export const POST: APIRoute = async ({ params, request }) => {
	const match = await loadMatch(params.id ?? "");
	if (!match) return json({ error: "Match not found" }, 404);

	const body: { sets?: unknown } | null = await request.json().catch(() => null);
	const sets = body?.sets;
	const error = checkSubmission(match, sets);
	if (error) return json({ error }, 400);

	await saveResult(match.id, sets as SetScore[]);
	return json({ ok: true, category: match.category, day: match.day });
};
