// Result submission from the referee screen (admins only, see lib/admin.ts). The last submission wins.
import type { APIRoute } from "astro";
import { isAdmin } from "../../../../lib/admin-env";
import { loadMatch, saveResult } from "../../../../lib/data";
import { checkSubmission } from "../../../../lib/scoring";
import type { SetScore } from "../../../../lib/types";

export const prerender = false;

const json = (body: unknown, status = 200) =>
	Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

export const POST: APIRoute = async ({ params, request, cookies }) => {
	if (!isAdmin(cookies)) return json({ error: "Only the organizers can enter scores" }, 403);
	const match = await loadMatch(params.id ?? "");
	if (!match) return json({ error: "Match not found" }, 404);

	const body = (await request.json().catch(() => null)) as { sets?: unknown } | null;
	const sets = body?.sets;
	const error = checkSubmission(match, sets);
	if (error) return json({ error }, 400);

	await saveResult(match.id, sets as SetScore[]);
	return json({ ok: true, category: match.category, day: match.day });
};
