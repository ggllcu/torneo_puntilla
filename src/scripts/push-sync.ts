// On every page: if this device has notifications on, make sure the server still has its subscription
// (the browser may have rotated it, or the server dropped it after a push service error).
const PLAYER_KEY = "puntilla:player";
const PUSH_KEY = "puntilla:push";

async function syncPushSubscription() {
	let player: { id?: string } | null = null;
	try {
		if (localStorage.getItem(PUSH_KEY) !== JSON.stringify("on")) return;
		player = JSON.parse(localStorage.getItem(PLAYER_KEY) ?? "null");
	} catch {
		return;
	}
	if (!player?.id || !("serviceWorker" in navigator) || !("PushManager" in window)) return;

	const registration = await navigator.serviceWorker.ready;
	const subscription = await registration.pushManager.getSubscription();
	if (!subscription) {
		// The browser no longer has a subscription: show notifications as off.
		localStorage.removeItem(PUSH_KEY);
		return;
	}
	await fetch("/api/push/subscribe", {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify({ subscription: subscription.toJSON(), playerId: player.id }),
	});
}

syncPushSubscription().catch(() => {
	// offline or blocked: try again on the next page load
});
