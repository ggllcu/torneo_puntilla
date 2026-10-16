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

/** Browser push services; subscriptions to anything else are rejected (the API is public). */
const PUSH_HOSTS = [/^fcm\.googleapis\.com$/, /(^|\.)push\.apple\.com$/, /^updates\.push\.services\.mozilla\.com$/, /\.notify\.windows\.com$/];

const isKnownPushService = (endpoint: string) => PUSH_HOSTS.some((host) => host.test(new URL(endpoint).hostname));

/** Byte length of a base64url string, or -1 when it isn't base64url. */
function base64UrlBytes(v: string): number {
	if (!/^[A-Za-z0-9_-]+={0,2}$/.test(v)) return -1;
	return Math.floor((v.replace(/=+$/, "").length * 3) / 4);
}

export function parseSubscribeBody(body: unknown): SubscribeBody | null {
	if (!isRecord(body) || !isRecord(body.subscription)) return null;
	const { endpoint, keys } = body.subscription;
	if (!isPushEndpoint(endpoint) || !isKnownPushService(endpoint) || !isRecord(keys)) return null;
	if (!shortString(keys.p256dh, 512) || !shortString(keys.auth, 512) || !shortString(body.playerId, 512)) return null;
	// p256dh is an uncompressed P-256 public key (65 bytes), auth a 16-byte secret.
	if (base64UrlBytes(keys.p256dh) !== 65 || base64UrlBytes(keys.auth) !== 16) return null;
	return { endpoint, p256dh: keys.p256dh, auth: keys.auth, playerId: body.playerId };
}

export function parseEndpointBody(body: unknown): string | null {
	return isRecord(body) && isPushEndpoint(body.endpoint) ? body.endpoint : null;
}

export const json = (body: unknown, status = 200) =>
	Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

export const readJson = (request: Request): Promise<unknown> => request.json().catch(() => null);
