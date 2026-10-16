// Referee screen: keeps the score on the device (saved in localStorage) and submits it when the match is over.
import { formatScore } from "../lib/display";
import { enterScoringDisplay, isPhone } from "../lib/referee-display";
import {
	addPoint,
	currentServer,
	emptyState,
	matchOutcome,
	parseSavedState,
	removePoint,
	stateFromSets,
	type PlayerIndex,
	type ScoreState,
} from "../lib/scoring";
import type { Format, SetScore } from "../lib/types";

const root = document.getElementById("referee");

if (root) {
	const { id = "", team1 = "", team2 = "", back = "/" } = root.dataset;
	const format: Format = root.dataset.format === "best_of_3" ? "best_of_3" : "single_21";
	const storageKey = `ref:${id}`;
	const el = (elementId: string) => document.getElementById(elementId)!;

	const save = (s: ScoreState) => {
		try {
			localStorage.setItem(storageKey, JSON.stringify(s));
		} catch {
			// storage unavailable: the score just won't survive a reload
		}
	};

	// Changing a finished match starts from its submitted score, unless a change is already in progress here.
	const savedSets = root.dataset.savedSets ? (JSON.parse(root.dataset.savedSets) as SetScore[]) : null;
	const restored = (() => {
		try {
			return parseSavedState(localStorage.getItem(storageKey));
		} catch {
			return null;
		}
	})();
	let state = restored ?? (savedSets ? stateFromSets(savedSets, format) : emptyState());

	// Admin-only controls: not rendered for everyone else.
	const send = document.getElementById("send");
	const submit = document.getElementById("submit");
	const setup = el("serving-setup") as HTMLDialogElement;
	const players = [team1, team2].map((name) => name.split("/").map((player) => player.trim()));
	const mobile = isPhone({
		coarsePointer: matchMedia("(pointer: coarse)").matches,
		hover: matchMedia("(hover: hover)").matches,
		width: screen.width,
		height: screen.height,
	});
	const displayButton = el("scoring-display") as HTMLButtonElement;
	const orientation = screen.orientation as ScreenOrientation & { lock?: (orientation: "landscape") => Promise<void> };
	let leaving = false;

	function renderDisplay() {
		displayButton.hidden = !mobile || !state.serving;
		displayButton.textContent = document.fullscreenElement ? "Exit fullscreen" : "Fullscreen";
		el("rotate-hint").hidden = !mobile || !state.serving || matchMedia("(orientation: landscape)").matches;
	}

	function unlockOrientation() {
		if (!mobile) return;
		try { orientation?.unlock?.(); } catch { /* Some browsers expose the method but reject it. */ }
	}

	async function enterDisplay() {
		displayButton.disabled = true;
		await enterScoringDisplay({
			mobile,
			requestFullscreen: !document.fullscreenElement && document.documentElement.requestFullscreen
				? () => document.documentElement.requestFullscreen()
				: undefined,
			lockLandscape: orientation?.lock ? () => orientation.lock!("landscape") : undefined,
		});
		// A pending request must not re-lock the device after the referee leaves.
		if (leaving) unlockOrientation();
		displayButton.disabled = false;
		renderDisplay();
	}

	displayButton.addEventListener("click", async () => {
		if (document.fullscreenElement) {
			unlockOrientation();
			await document.exitFullscreen().catch(() => {});
		} else {
			await enterDisplay();
		}
		renderDisplay();
	});
	document.addEventListener("fullscreenchange", () => {
		if (!document.fullscreenElement) unlockOrientation();
		renderDisplay();
	});
	window.addEventListener("resize", renderDisplay);
	window.addEventListener("pagehide", () => { leaving = true; unlockOrientation(); });
	window.addEventListener("pageshow", () => { leaving = false; renderDisplay(); });

	function render() {
		renderDisplay();
		const finished = matchOutcome(state, format).finished;
		if (finished) send?.removeAttribute("disabled");
		else send?.setAttribute("disabled", "");
		el("score1").textContent = String(state.current.team1);
		el("score2").textContent = String(state.current.team2);
		const serving = finished ? null : currentServer(state);
		for (const team of [1, 2] as const) {
			const indicator = el(`serve${team}`);
			indicator.hidden = serving?.team !== team;
			indicator.textContent = serving?.team === team ? `Serve: ${players[team - 1][serving.player]}` : "";
		}
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
		if (!state.serving) {
			setup.showModal();
			return;
		}
		update(button.classList.contains("plus") ? addPoint(state, team, format) : removePoint(state, team, format));
	});

	send?.addEventListener("click", () => {
		if (matchOutcome(state, format).finished) openModal();
	});

	el("cancel").addEventListener("click", () => {
		el("modal").hidden = true;
	});

	// Native modal focus handling keeps the scoring buttons unavailable until all choices are made.
	setup.addEventListener("cancel", (event) => event.preventDefault());
	el("serving-form").addEventListener("submit", (event) => {
		event.preventDefault();
		const value = (id: string) => (el(id) as unknown as { value: string }).value;
		const startingTeam = value("starting-team");
		const first1 = value("first-server1");
		const first2 = value("first-server2");
		if ((startingTeam !== "1" && startingTeam !== "2") ||
			(first1 !== "0" && first1 !== "1") || (first2 !== "0" && first2 !== "1")) return;
		state = {
			...state,
			serving: {
				startingTeam: Number(startingTeam) as 1 | 2,
				firstServers: [Number(first1) as PlayerIndex, Number(first2) as PlayerIndex],
				rallies: [],
			},
		};
		save(state);
		setup.close();
		render();
		(root!.querySelector(`.plus[data-team="${startingTeam}"]`) as HTMLButtonElement).focus({ preventScroll: true });
		void enterDisplay();
	});

	submit?.addEventListener("click", async () => {
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
	// Reopen the pop-up for an in-progress match restored on this device, not for a submitted score being changed.
	if (restored && matchOutcome(state, format).finished) openModal();
	else if (!state.serving) {
		el("serving-resume").hidden = state.completed.length === 0 && state.current.team1 === 0 && state.current.team2 === 0;
		setup.showModal();
	}
}
