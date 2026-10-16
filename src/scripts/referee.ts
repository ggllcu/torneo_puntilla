// Referee screen: keeps the score on the device (saved in localStorage) and submits it when the match is over.
import { formatScore } from "../lib/display";
import {
	addPoint,
	emptyState,
	matchOutcome,
	parseSavedState,
	removePoint,
	type ScoreState,
} from "../lib/scoring";
import type { Format } from "../lib/types";

const root = document.getElementById("referee");

if (root) {
	const { id = "", team1 = "", team2 = "", back = "/" } = root.dataset;
	const format: Format = root.dataset.format === "best_of_3" ? "best_of_3" : "single_21";
	const storageKey = `ref:${id}`;
	const el = (elementId: string) => document.getElementById(elementId)!;

	const load = (): ScoreState => {
		try {
			return parseSavedState(localStorage.getItem(storageKey)) ?? emptyState();
		} catch {
			return emptyState();
		}
	};
	const save = (s: ScoreState) => {
		try {
			localStorage.setItem(storageKey, JSON.stringify(s));
		} catch {
			// storage unavailable: the score just won't survive a reload
		}
	};

	let state = load();

	function render() {
		el("score1").textContent = String(state.current.team1);
		el("score2").textContent = String(state.current.team2);
		if (format === "best_of_3") {
			const won1 = state.completed.filter((s) => s.team1 > s.team2).length;
			const won2 = state.completed.length - won1;
			const info = el("set-info");
			info.hidden = false;
			info.textContent = `Set ${state.completed.length + 1} · Sets ${won1}–${won2}`;
		}
	}

	function openModal() {
		const outcome = matchOutcome(state, format);
		el("modal-winner").textContent = `Winner: ${outcome.winner === 1 ? team1 : team2}`;
		el("modal-score").textContent = formatScore(outcome.sets);
		el("modal-error").hidden = true;
		el("modal").hidden = false;
	}

	function update(next: ScoreState) {
		state = next;
		save(state);
		render();
		if (matchOutcome(state, format).finished) openModal();
	}

	root.addEventListener("click", (event) => {
		const button = (event.target as HTMLElement).closest("button");
		const team = button?.dataset.team === "1" ? 1 : button?.dataset.team === "2" ? 2 : null;
		if (!button || !team) return;
		update(button.classList.contains("plus") ? addPoint(state, team, format) : removePoint(state, team, format));
	});

	el("cancel").addEventListener("click", () => {
		el("modal").hidden = true;
	});

	el("submit").addEventListener("click", async () => {
		const submit = el("submit");
		const error = el("modal-error");
		submit.setAttribute("disabled", "");
		error.hidden = true;
		try {
			const res = await fetch(`/api/matches/${encodeURIComponent(id)}/result`, {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ sets: matchOutcome(state, format).sets }),
			});
			if (!res.ok) {
				const body = (await res.json().catch(() => null)) as { error?: string } | null;
				throw new Error(body?.error ?? `Error ${res.status}`);
			}
			try {
				localStorage.removeItem(storageKey);
			} catch {
				// nothing to clean up
			}
			location.href = back;
		} catch (e) {
			error.textContent = e instanceof Error ? e.message : "Could not submit, try again";
			error.hidden = false;
			submit.removeAttribute("disabled");
		}
	});

	render();
	if (matchOutcome(state, format).finished) openModal();
}
