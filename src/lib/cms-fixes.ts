// Workaround for an emdash 1.3 bug: clearing an optional date in the admin sends "" but the server only accepts
// null for an empty optional datetime, so the save fails with "Invalid input". We rewrite "" to null first.

/** Optional datetime fields per collection (see scripts/build-seed.ts). */
const DATETIME_FIELDS: Record<string, string[]> = {
	matches: ["time_override"],
	sessions: ["starts_at"],
};

const CONTENT_PATH = /^\/_emdash\/api\/content\/([a-z][a-z0-9_]*)(?:\/[^/]+)?$/;

/** The collection an admin content save (PUT …/content/:collection/:id) or create (POST …/content/:collection) targets. */
export function contentCollection(method: string, pathname: string): string | null {
	if (method !== "PUT" && method !== "POST") return null;
	const collection = CONTENT_PATH.exec(pathname)?.[1];
	return collection && collection in DATETIME_FIELDS ? collection : null;
}

export function clearEmptyDatetimes(collection: string, body: unknown): unknown {
	const fields = DATETIME_FIELDS[collection];
	if (!fields || typeof body !== "object" || body === null) return body;
	const data = (body as { data?: unknown }).data;
	if (typeof data !== "object" || data === null) return body;
	const empty = fields.filter((field) => (data as Record<string, unknown>)[field] === "");
	if (empty.length === 0) return body;
	const fixed: Record<string, unknown> = { ...(data as Record<string, unknown>) };
	for (const field of empty) fixed[field] = null;
	return { ...body, data: fixed };
}
