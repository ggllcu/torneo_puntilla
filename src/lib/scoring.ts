// Scoring rules (spec §3.2) and the referee screen's state machine.
// Sets go to 21 (15 for the 3rd set of a best of 3), win by 2, no cap.
import type { Format, MatchView, SetScore } from "./types";

type Team = 1 | 2;
export type PlayerIndex = 0 | 1;
type ServingState = {
	startingTeam: Team;
	firstServers: [PlayerIndex, PlayerIndex];
	/** Rally winners in order, so score corrections can recalculate the rotation. */
	rallies: Team[];
};
export type ScoreState = { completed: SetScore[]; current: SetScore; serving?: ServingState };

export function currentServer(s: ScoreState): { team: Team; player: PlayerIndex } | null {
	if (!s.serving) return null;
	let team = s.serving.startingTeam;
	const players = [...s.serving.firstServers];
	const served = [team === 1, team === 2];
	for (const winner of s.serving.rallies) {
		if (winner === team) continue;
		team = winner;
		const index = team - 1;
		if (served[index]) players[index] = players[index] === 0 ? 1 : 0;
		served[index] = true;
	}
	return { team, player: players[team - 1] };
}

export const emptyState = (): ScoreState => ({ completed: [], current: { team1: 0, team2: 0 } });

const setsToWin = (format: Format) => (format === "best_of_3" ? 2 : 1);

export function setTarget(format: Format, setIndex: number): number {
	return format === "best_of_3" && setIndex === 2 ? 15 : 21;
}

export function setWinner(set: SetScore, target: number): 1 | 2 | null {
	if (set.team1 >= target && set.team1 - set.team2 >= 2) return 1;
	if (set.team2 >= target && set.team2 - set.team1 >= 2) return 2;
	return null;
}

const isBlank = (set: SetScore) => set.team1 === 0 && set.team2 === 0;

export function matchOutcome(
	s: ScoreState,
	format: Format,
): { finished: boolean; winner: 1 | 2 | null; sets: SetScore[] } {
	const sets =
		isBlank(s.current) && s.completed.length > 0 ? [...s.completed] : [...s.completed, { ...s.current }];
	const won = { 1: 0, 2: 0 };
	sets.forEach((set, i) => {
		const w = setWinner(set, setTarget(format, i));
		if (w) won[w]++;
	});
	const needed = setsToWin(format);
	const winner = won[1] >= needed ? 1 : won[2] >= needed ? 2 : null;
	return { finished: winner !== null, winner, sets };
}

/** A won set that doesn't end the match moves to `completed`, and a new set starts at 0-0. */
function advance(s: ScoreState, format: Format): ScoreState {
	const setWon = setWinner(s.current, setTarget(format, s.completed.length)) !== null;
	if (!setWon || matchOutcome(s, format).finished) return s;
	return { ...s, completed: [...s.completed, s.current], current: { team1: 0, team2: 0 } };
}

const key = (team: 1 | 2) => (team === 1 ? "team1" : "team2");

export function addPoint(s: ScoreState, team: 1 | 2, format: Format): ScoreState {
	const current = { ...s.current, [key(team)]: s.current[key(team)] + 1 };
	const next = { ...s, current };
	if (s.serving) next.serving = { ...s.serving, rallies: [...s.serving.rallies, team] };
	return advance(next, format);
}

export function removePoint(s: ScoreState, team: 1 | 2, format: Format): ScoreState {
	let { completed, current } = s;
	if (isBlank(current) && completed.length > 0) {
		current = completed[completed.length - 1];
		completed = completed.slice(0, -1);
	}
	if (current[key(team)] === 0) return s;
	current = { ...current, [key(team)]: current[key(team)] - 1 };
	const next = { ...s, completed, current };
	if (s.serving) {
		const rallies = [...s.serving.rallies];
		const index = rallies.lastIndexOf(team);
		if (index !== -1) rallies.splice(index, 1);
		next.serving = { ...s.serving, rallies };
	}
	return advance(next, format);
}

/** Exactly the sets a real match would produce: each set ends on its first winning point, none after the decider. */
export function isValidResult(format: Format, sets: SetScore[]): boolean {
	const won = { 1: 0, 2: 0 };
	const needed = setsToWin(format);
	for (const [i, set] of sets.entries()) {
		if (won[1] === needed || won[2] === needed) return false;
		const target = setTarget(format, i);
		const winner = setWinner(set, target);
		const [high, low] = [Math.max(set.team1, set.team2), Math.min(set.team1, set.team2)];
		if (!winner || high !== Math.max(target, low + 2)) return false;
		won[winner]++;
	}
	return won[1] === needed || won[2] === needed;
}

const isScore = (n: unknown) => Number.isInteger(n) && (n as number) >= 0;

export function checkSubmission(
	match: Pick<MatchView, "team1" | "team2" | "format">,
	sets: unknown,
): string | null {
	if (!match.team1 || !match.team2) return "Teams not assigned";
	const wellFormed =
		Array.isArray(sets) &&
		sets.every((s) => typeof s === "object" && s !== null && isScore(s.team1) && isScore(s.team2));
	if (!wellFormed || !isValidResult(match.format, sets as SetScore[])) return "Invalid score";
	return null;
}

const isSet = (v: unknown): v is SetScore =>
	typeof v === "object" && v !== null && isScore((v as SetScore).team1) && isScore((v as SetScore).team2);

const isTeam = (v: unknown): v is Team => v === 1 || v === 2;
const isPlayer = (v: unknown): v is PlayerIndex => v === 0 || v === 1;
const isServing = (v: unknown): v is ServingState => {
	if (typeof v !== "object" || v === null) return false;
	const serving = v as ServingState;
	return isTeam(serving.startingTeam) && Array.isArray(serving.firstServers) &&
		serving.firstServers.length === 2 && serving.firstServers.every(isPlayer) &&
		Array.isArray(serving.rallies) && serving.rallies.every(isTeam);
};

/** The referee screen's saved progress, or null when absent or unusable. */
export function parseSavedState(raw: string | null): ScoreState | null {
	if (!raw) return null;
	try {
		const v = JSON.parse(raw);
		if (!Array.isArray(v?.completed) || !v.completed.every(isSet) || !isSet(v.current)) return null;
		return {
			completed: v.completed,
			current: v.current,
			...(isServing(v.serving) ? { serving: v.serving } : {}),
		};
	} catch {
		return null;
	}
}

/** A submitted result as referee-screen state, so it can be changed: earlier sets completed, the last one current. */
export function stateFromSets(sets: SetScore[], _format: Format): ScoreState {
	if (sets.length === 0) return emptyState();
	return { completed: sets.slice(0, -1).map((s) => ({ ...s })), current: { ...sets[sets.length - 1] } };
}
