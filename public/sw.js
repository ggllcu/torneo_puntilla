// La Puntilla service worker: shows match reminders and opens the right page when one is tapped.
// No fetch handler: the app is always loaded from the network.

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
	let data = {};
	try {
		data = event.data ? event.data.json() : {};
	} catch {
		data = { title: "La Puntilla", body: event.data ? event.data.text() : "" };
	}
	const title = data.title || "La Puntilla";
	event.waitUntil(
		self.registration.showNotification(title, {
			body: data.body || "",
			icon: "/icons/icon-192.png",
			badge: "/icons/icon-192.png",
			tag: data.tag,
			data: { url: data.url || "/" },
		}),
	);
});

self.addEventListener("notificationclick", (event) => {
	event.notification.close();
	const url = new URL(event.notification.data?.url || "/", self.location.origin).href;
	event.waitUntil(
		(async () => {
			const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
			const existing = windows.find((w) => new URL(w.url).origin === self.location.origin);
			if (existing) {
				await existing.focus();
				return existing.navigate(url);
			}
			return self.clients.openWindow(url);
		})(),
	);
});
