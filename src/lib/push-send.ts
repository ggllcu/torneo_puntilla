// Web Push delivery with VAPID (@pushforge/builder uses Web Crypto, so it runs on Workers).
import { buildPushHTTPRequest } from "@pushforge/builder";
import type { StoredSubscription } from "./push-db";
import type { PushPayload } from "./reminders";

export type Vapid = { privateJWK: JsonWebKey | string; subject: string };
/** Resolves to the push service's HTTP status. */
export type SendPush = (sub: StoredSubscription, payload: PushPayload) => Promise<number>;

/** A reminder is useless after the match starts: expire it after 20 minutes. */
const TTL_SECONDS = 20 * 60;

export function webPushSender(vapid: Vapid): SendPush {
	return async (sub, payload) => {
		const { endpoint, headers, body } = await buildPushHTTPRequest({
			privateJWK: vapid.privateJWK,
			subscription: { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
			message: {
				payload,
				adminContact: vapid.subject as `mailto:${string}`,
				options: { ttl: TTL_SECONDS, urgency: "high" },
			},
		});
		const res = await fetch(endpoint, { method: "POST", headers, body });
		return res.status;
	};
}
