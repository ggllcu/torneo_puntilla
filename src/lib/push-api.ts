// Request validation and helpers for the public push/player API (spec: pwa-notifications §5.2).

export type SubscribeBody = { endpoint: string; p256dh: string; auth: string; playerId: string };

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null;
const shortString = (v: unknown, max: number): v is string => typeof v === "string" && v.length > 0 && v.length <= max;

function isPushEndpoint(v: unknown): v is string {
	if (!shortString(v, 2048)) return false;
	try {
		return new URL(v).protocol === "https:";
	} catch {
		return false;
	}
}

export function parseSubscribeBody(body: unknown): SubscribeBody | null {
	if (!isRecord(body) || !isRecord(body.subscription)) return null;
	const { endpoint, keys } = body.subscription;
	if (!isPushEndpoint(endpoint) || !isRecord(keys)) return null;
	if (!shortString(keys.p256dh, 512) || !shortString(keys.auth, 512) || !shortString(body.playerId, 512)) return null;
	return { endpoint, p256dh: keys.p256dh, auth: keys.auth, playerId: body.playerId };
}

export function parseEndpointBody(body: unknown): string | null {
	return isRecord(body) && isPushEndpoint(body.endpoint) ? body.endpoint : null;
}

export const json = (body: unknown, status = 200) =>
	Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

export const readJson = (request: Request): Promise<unknown> => request.json().catch(() => null);
