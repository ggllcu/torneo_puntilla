// Worker bindings for the push API routes (only importable inside the Worker).
import { env } from "cloudflare:workers";
import { d1, type SqlDb } from "./push-db";
import { webPushSender, type SendPush } from "./push-send";

type PushVars = { DB: D1Database; VAPID_PRIVATE_JWK?: string; VAPID_SUBJECT?: string; VAPID_PUBLIC_KEY?: string };
const vars = () => env as unknown as PushVars;

export const db = (): SqlDb => d1(vars().DB);

/** null when the VAPID secret isn't configured. */
export function pushSender(): SendPush | null {
	const { VAPID_PRIVATE_JWK, VAPID_SUBJECT } = vars();
	return VAPID_PRIVATE_JWK && VAPID_SUBJECT ? webPushSender({ privateJWK: VAPID_PRIVATE_JWK, subject: VAPID_SUBJECT }) : null;
}

export const vapidPublicKey = (): string => vars().VAPID_PUBLIC_KEY ?? "";
