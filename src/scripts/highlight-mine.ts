// Calendar: highlight the matches of the player chosen in Settings (as player or referee).
type Mine = { matchId: string; role: "player" | "referee" };

let mine: Map<string, Mine["role"]> | null = null;

function chosenPlayerId(): string | null {
	try {
		return (JSON.parse(localStorage.getItem("puntilla:player") ?? "null") as { id?: string } | null)?.id ?? null;
	} catch {
		return null;
	}
}

function apply() {
	if (!mine) return;
	for (const [matchId, role] of mine) {
		const card = document.getElementById(`match-${matchId}`);
		if (!card) continue;
		card.dataset.mine = role;
		const badge = card.querySelector("[data-mine-badge]");
		if (badge) badge.textContent = role === "player" ? "You're playing" : "You're refereeing";
	}
}

async function load() {
	const id = chosenPlayerId();
	if (!id) return;
	const res = await fetch(`/api/players/${encodeURIComponent(id)}/matches?all=1`).catch(() => null);
	if (!res?.ok) return;
	const list = (await res.json()) as Mine[];
	mine = new Map(list.map((m) => [m.matchId, m.role]));
	apply();
}

document.addEventListener("live:updated", apply);
load();
