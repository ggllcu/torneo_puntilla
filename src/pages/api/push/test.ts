// Sends a test notification to one device, for players checking their setup (and production testing).
import type { APIRoute } from "astro";
import { json, parseEndpointBody, readJson } from "../../../lib/push-api";
import { deleteSubscription, getSubscription } from "../../../lib/push-db";
import { db, pushSender } from "../../../lib/push-env";

export const prerender = false;

const TEST_PAYLOAD = {
	title: "Test notification",
	body: "La Puntilla notifications are working.",
	url: "/settings",
	tag: "test",
};

export const POST: APIRoute = async ({ request }) => {
	const endpoint = parseEndpointBody(await readJson(request));
	if (!endpoint) return json({ error: "Invalid endpoint" }, 400);
	const sql = db();
	const subscription = await getSubscription(sql, endpoint);
	if (!subscription) return json({ error: "Not subscribed" }, 404);
	const send = pushSender();
	if (!send) return json({ error: "Notifications are not configured" }, 503);

	const status = await send(subscription, TEST_PAYLOAD).catch(() => 0);
	if (status >= 200 && status < 300) return json({ ok: true });
	if (status === 404 || status === 410) await deleteSubscription(sql, endpoint);
	return json({ error: `Push service answered ${status || "with an error"}` }, 502);
};
