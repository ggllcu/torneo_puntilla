import handler, { createScheduledHandler, PluginBridge } from "@emdash-cms/cloudflare/worker";
import { d1 } from "./lib/push-db";
import { webPushSender } from "./lib/push-send";
import { runReminders } from "./lib/reminder-job";

export { PluginBridge };

/** Push config: VAPID_PUBLIC_KEY / VAPID_SUBJECT are vars, VAPID_PRIVATE_JWK is a secret. */
type PushEnv = { DB: D1Database; VAPID_PRIVATE_JWK?: string; VAPID_SUBJECT?: string };

const emdashScheduled = createScheduledHandler();
let warnedMissingVapid = false;

export default {
	...handler,
	scheduled(controller, env, ctx) {
		const { DB, VAPID_PRIVATE_JWK, VAPID_SUBJECT } = env as unknown as PushEnv;
		if (VAPID_PRIVATE_JWK && VAPID_SUBJECT) {
			const send = webPushSender({ privateJWK: VAPID_PRIVATE_JWK, subject: VAPID_SUBJECT });
			ctx.waitUntil(
				runReminders(d1(DB), new Date(controller.scheduledTime), send)
					.then((r) => {
						if (r.sent || r.removed || r.failed) console.log("[reminders]", JSON.stringify(r));
					})
					.catch((error) => console.error("[reminders] run failed", error)),
			);
		} else if (!warnedMissingVapid) {
			warnedMissingVapid = true;
			console.warn("[reminders] VAPID_PRIVATE_JWK / VAPID_SUBJECT not set: match reminders are off");
		}
		return emdashScheduled(controller, env, ctx);
	},
} satisfies ExportedHandler;
