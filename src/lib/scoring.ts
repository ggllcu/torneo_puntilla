// Scoring rules (spec §3.2) and the referee screen's state machine.
// Sets go to 21 (15 for the 3rd set of a best of 3), win by 2, no cap.
import type { Format, MatchView, SetScore } from "./types";

export type ScoreState = { completed: SetScore[]; current: SetScore };

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
	return { completed: [...s.completed, s.current], current: { team1: 0, team2: 0 } };
}

const key = (team: 1 | 2) => (team === 1 ? "team1" : "team2");

export function addPoint(s: ScoreState, team: 1 | 2, format: Format): ScoreState {
	const current = { ...s.current, [key(team)]: s.current[key(team)] + 1 };
	return advance({ completed: s.completed, current }, format);
}

export function removePoint(s: ScoreState, team: 1 | 2, format: Format): ScoreState {
	let { completed, current } = s;
	if (isBlank(current) && completed.length > 0) {
		current = completed[completed.length - 1];
		completed = completed.slice(0, -1);
	}
	current = { ...current, [key(team)]: Math.max(0, current[key(team)] - 1) };
	return advance({ completed, current }, format);
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
