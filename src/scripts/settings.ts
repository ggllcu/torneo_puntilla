// Settings page: who am I (stored on the device) and match reminder notifications.
import { CATEGORY_LABEL } from "../lib/display";
import { isPastMatch, pushSupport, urlBase64ToUint8Array } from "../lib/push-client";
import { formatTime } from "../lib/schedule";
import type { Category } from "../lib/types";

type Player = { id: string; name: string };
type PlayerMatch = {
	matchId: string;
	role: "player" | "referee";
	start: string;
	category: Category;
	court: number;
	label: string;
	finished: boolean;
};

const PLAYER_KEY = "puntilla:player";
const PUSH_KEY = "puntilla:push";

const root = document.getElementById("settings");

const store = {
	get<T>(key: string): T | null {
		try {
			return JSON.parse(localStorage.getItem(key) ?? "null") as T | null;
		} catch {
			return null;
		}
	},
	set(key: string, value: unknown) {
		try {
			if (value === null) localStorage.removeItem(key);
			else localStorage.setItem(key, JSON.stringify(value));
		} catch {
			// storage unavailable: choices last until the page closes
		}
	},
};

const escape = (text: string) => text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const WEEKDAY = new Intl.DateTimeFormat("en-GB", { timeZone: "Atlantic/Canary", weekday: "short" });

if (root) {
	const el = (id: string) => document.getElementById(id)!;
	const vapid = root.dataset.vapid ?? "";
	let players: Player[] = [];
	let player = store.get<Player>(PLAYER_KEY);
	let pushOn = store.get<string>(PUSH_KEY) === "on";

	const support = pushSupport({
		userAgent: navigator.userAgent,
		standalone:
			matchMedia("(display-mode: standalone)").matches ||
			(navigator as unknown as { standalone?: boolean }).standalone === true,
		hasPushManager: "PushManager" in window,
		hasServiceWorker: "serviceWorker" in navigator,
		permission: "Notification" in window ? Notification.permission : "default",
	});

	const post = (url: string, body: unknown) =>
		fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

	async function currentSubscription() {
		const registration = await navigator.serviceWorker.ready;
		return registration.pushManager.getSubscription();
	}

	function renderPlayers(filter = "") {
		const q = filter.trim().toLowerCase();
		el("players").innerHTML = players
			.filter((p) => p.name.toLowerCase().includes(q))
			.map(
				(p) =>
					`<button type="button" role="option" data-id="${escape(p.id)}" aria-selected="${p.id === player?.id}">${escape(p.name)}</button>`,
			)
			.join("");
	}

	function renderChosen() {
		el("chosen").hidden = !player;
		el("chosen-name").textContent = player ? `You: ${player.name}` : "";
		for (const hint of document.querySelectorAll("[data-you]")) {
			hint.textContent = player ? `You: ${player.name}` : "";
			(hint as unknown as { hidden: boolean }).hidden = !player;
		}
	}

	function renderPush(status = "") {
		const note = el("push-note");
		const controls = el("push-controls");
		const notes: Record<string, string> = {
			"ios-needs-install":
				"To get notifications on iPhone, tap Share → Add to Home Screen, then open La Puntilla from your home screen.",
			unsupported: "This browser can't receive notifications.",
			denied: "Notifications are blocked for this site in your browser settings.",
		};
		let message = notes[support] ?? "";
		if (support === "supported" && !vapid) message = "Notifications aren't set up yet.";
		if (support === "supported" && vapid && !player) message = "Choose your name first.";
		note.textContent = message;
		note.hidden = !message;
		controls.hidden = !(support === "supported" && vapid && player);
		el("toggle").setAttribute("aria-pressed", String(pushOn));
		el("toggle").textContent = pushOn ? "Notifications on" : "Notifications off";
		el("push-status").textContent = status;
	}

	async function renderMatches() {
		const list = el("matches");
		if (!player) {
			list.innerHTML = `<li class="muted">Choose your name to see your matches.</li>`;
			return;
		}
		const res = await fetch(`/api/players/${encodeURIComponent(player.id)}/matches?all=1`).catch(() => null);
		const matches: PlayerMatch[] = res?.ok ? await res.json() : [];
		const now = new Date();
		const isPast = (m: PlayerMatch) => isPastMatch(m, now);
		const item = (m: PlayerMatch) => {
			const start = new Date(m.start);
			const when = `${WEEKDAY.format(start)} ${formatTime(start)} · Court ${m.court} · ${CATEGORY_LABEL[m.category]}`;
			const role = m.role === "player" ? "Playing" : "Refereeing";
			return `<li class="${isPast(m) ? "past" : ""}"><span class="role">${role}</span><br>${escape(when)}<br>${escape(m.label)}</li>`;
		};
		const past = matches.filter(isPast);
		const next = matches.filter((m) => !isPast(m));
		if (matches.length === 0) {
			list.innerHTML = `<li class="muted">No matches.</li>`;
			return;
		}
		list.innerHTML = [
			...past.map(item),
			past.length ? `<li class="divider" role="separator"><span>Next games</span></li>` : "",
			...(next.length ? next.map(item) : [`<li class="muted">No upcoming matches.</li>`]),
		].join("");
	}

	async function subscribe() {
		const permission = await Notification.requestPermission();
		if (permission !== "granted") {
			renderPush("Permission not granted.");
			return;
		}
		const registration = await navigator.serviceWorker.ready;
		const subscription =
			(await registration.pushManager.getSubscription()) ??
			(await registration.pushManager.subscribe({
				userVisibleOnly: true,
				applicationServerKey: urlBase64ToUint8Array(vapid),
			}));
		const res = await post("/api/push/subscribe", { subscription: subscription.toJSON(), playerId: player?.id });
		if (!res.ok) throw new Error("Could not register this device");
		pushOn = true;
		store.set(PUSH_KEY, "on");
	}

	async function unsubscribe() {
		const subscription = await currentSubscription();
		if (subscription) {
			await post("/api/push/unsubscribe", { endpoint: subscription.endpoint }).catch(() => null);
			await subscription.unsubscribe().catch(() => false);
		}
		pushOn = false;
		store.set(PUSH_KEY, null);
	}

	async function choose(next: Player | null) {
		if (!next && pushOn) await unsubscribe();
		player = next;
		store.set(PLAYER_KEY, next);
		let status = "";
		if (next && pushOn) {
			try {
				await subscribe();
			} catch {
				// The server still has this device under the previous player: turn notifications off
				// rather than keep sending someone else's reminders.
				await unsubscribe().catch(() => null);
				status = `Could not switch notifications to ${next.name}. Turn them on again to retry.`;
			}
		}
		renderPlayers((el("search") as unknown as { value: string }).value);
		renderChosen();
		renderPush(status);
		await renderMatches();
	}

	el("players").addEventListener("click", (event) => {
		const button = (event.target as HTMLElement).closest("button");
		const chosen = players.find((p) => p.id === button?.dataset.id);
		if (chosen) choose(chosen);
	});
	el("search").addEventListener("input", (event) => renderPlayers((event.target as unknown as { value: string }).value));
	el("clear").addEventListener("click", () => choose(null));

	el("toggle").addEventListener("click", async () => {
		el("toggle").setAttribute("disabled", "");
		try {
			if (pushOn) await unsubscribe();
			else await subscribe();
			renderPush(pushOn ? "You'll get a reminder 20 minutes before each of your matches." : "");
		} catch (e) {
			renderPush(e instanceof Error ? e.message : "Something went wrong, try again.");
		} finally {
			el("toggle").removeAttribute("disabled");
		}
	});

	(async () => {
		const res = await fetch("/api/players").catch(() => null);
		players = res?.ok ? await res.json() : [];
		renderPlayers();
		renderChosen();
		renderPush();
		await renderMatches();
	})();
}
