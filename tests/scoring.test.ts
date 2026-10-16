import { describe, expect, test } from "vitest";
import {
	addPoint,
	checkSubmission,
	emptyState,
	isValidResult,
	matchOutcome,
	parseSavedState,
	removePoint,
	setTarget,
	setWinner,
	stateFromSets,
	type ScoreState,
} from "../src/lib/scoring";
import type { Format, TeamView } from "../src/lib/types";

const play = (format: Format, points: (1 | 2)[], from: ScoreState = emptyState()) =>
	points.reduce((s, t) => addPoint(s, t, format), from);
const times = (team: 1 | 2, n: number) => Array<1 | 2>(n).fill(team);
const at = (team1: number, team2: number, completed: ScoreState["completed"] = []): ScoreState => ({
	completed,
	current: { team1, team2 },
});

describe("setTarget", () => {
	test("21 for single sets and the first two of a best of 3, 15 for the third", () => {
		expect(setTarget("single_21", 0)).toBe(21);
		expect(setTarget("best_of_3", 1)).toBe(21);
		expect(setTarget("best_of_3", 2)).toBe(15);
	});
});

describe("setWinner", () => {
	test("needs the target and a 2-point lead, with no cap", () => {
		expect(setWinner({ team1: 21, team2: 19 }, 21)).toBe(1);
		expect(setWinner({ team1: 21, team2: 20 }, 21)).toBeNull();
		expect(setWinner({ team1: 25, team2: 23 }, 21)).toBe(1);
		expect(setWinner({ team1: 17, team2: 19 }, 21)).toBeNull();
		expect(setWinner({ team1: 15, team2: 13 }, 15)).toBe(1);
		expect(setWinner({ team1: 13, team2: 21 }, 21)).toBe(2);
	});
});

describe("referee state machine", () => {
	test("deuce: from 20-20 the set ends only on a 2-point lead", () => {
		const s = play("single_21", [1, 2, 1, 1], at(20, 20));
		expect(matchOutcome(s, "single_21")).toEqual({
			finished: true,
			winner: 1,
			sets: [{ team1: 23, team2: 21 }],
		});
	});

	test("single set: reaching 21-5 finishes without advancing to a new set", () => {
		const s = play("single_21", [...times(1, 21), ...times(2, 5)]);
		expect(s.completed).toEqual([]);
		expect(matchOutcome(s, "single_21")).toMatchObject({ finished: true, winner: 1 });
	});

	test("unfinished match has no winner", () => {
		expect(matchOutcome(at(7, 5), "single_21")).toEqual({
			finished: false,
			winner: null,
			sets: [{ team1: 7, team2: 5 }],
		});
	});

	test("best of 3: a won set advances to 0-0", () => {
		const s = play("best_of_3", [...times(2, 15), ...times(1, 21)]);
		expect(s).toEqual({ completed: [{ team1: 21, team2: 15 }], current: { team1: 0, team2: 0 } });
		expect(matchOutcome(s, "best_of_3")).toEqual({
			finished: false,
			winner: null,
			sets: [{ team1: 21, team2: 15 }],
		});
	});

	test("best of 3: winning the first two sets finishes the match", () => {
		const s = play("best_of_3", times(1, 42));
		expect(matchOutcome(s, "best_of_3")).toEqual({
			finished: true,
			winner: 1,
			sets: [
				{ team1: 21, team2: 0 },
				{ team1: 21, team2: 0 },
			],
		});
	});

	test("best of 3: at 1-1 the third set ends at 15-13", () => {
		const oneAll = [
			{ team1: 21, team2: 15 },
			{ team1: 15, team2: 21 },
		];
		const s = play("best_of_3", [1, 2], at(14, 12, oneAll));
		expect(matchOutcome(s, "best_of_3")).toEqual({
			finished: true,
			winner: 1,
			sets: [...oneAll, { team1: 15, team2: 13 }],
		});
	});

	test("removePoint at 0-0 after a set advanced reopens the previous set", () => {
		const s = removePoint(at(0, 0, [{ team1: 21, team2: 15 }]), 1, "best_of_3");
		expect(s).toEqual({ completed: [], current: { team1: 20, team2: 15 } });
	});

	test("removePoint for the set loser at 0-0 corrects the previous set, which stays won", () => {
		const s = removePoint(at(0, 0, [{ team1: 21, team2: 15 }]), 2, "best_of_3");
		expect(s).toEqual({ completed: [{ team1: 21, team2: 14 }], current: { team1: 0, team2: 0 } });
	});

	test("removePoint never goes below 0", () => {
		expect(removePoint(at(0, 3), 1, "single_21")).toEqual(at(0, 3));
		expect(removePoint(emptyState(), 2, "best_of_3")).toEqual(emptyState());
	});

	test("removing a point after match point makes the match unfinished again", () => {
		const s = removePoint(at(21, 19), 1, "single_21");
		expect(matchOutcome(s, "single_21").finished).toBe(false);
	});

	test("state functions do not mutate their input", () => {
		const s = at(5, 5);
		addPoint(s, 1, "single_21");
		removePoint(s, 2, "single_21");
		expect(s).toEqual(at(5, 5));
	});
});

describe("isValidResult", () => {
	test("single set", () => {
		expect(isValidResult("single_21", [{ team1: 21, team2: 0 }])).toBe(true);
		expect(isValidResult("single_21", [{ team1: 21, team2: 20 }])).toBe(false);
		expect(isValidResult("single_21", [{ team1: 24, team2: 22 }])).toBe(true);
		expect(isValidResult("single_21", [{ team1: 25, team2: 21 }])).toBe(false); // would have ended at 23-21
		expect(isValidResult("single_21", [])).toBe(false);
		expect(
			isValidResult("single_21", [
				{ team1: 21, team2: 10 },
				{ team1: 21, team2: 10 },
			]),
		).toBe(false);
	});

	test("best of 3", () => {
		const v = (...sets: [number, number][]) =>
			isValidResult("best_of_3", sets.map(([team1, team2]) => ({ team1, team2 })));
		expect(v([21, 10], [21, 12])).toBe(true);
		expect(v([21, 10], [10, 21], [15, 13])).toBe(true);
		expect(v([21, 10], [21, 12], [15, 1])).toBe(false); // played after the match was decided
		expect(v([21, 10], [10, 21], [21, 10])).toBe(false); // third set goes to 15: would have ended 15-10
		expect(v([21, 10], [10, 21], [21, 19])).toBe(true); // reachable through deuce
		expect(v([21, 10])).toBe(false);
	});
});

describe("checkSubmission", () => {
	const t: TeamView = { id: "x", seed: "A1", name: "Dani/Mat" };
	const ready = { team1: t, team2: { ...t, id: "y" }, format: "single_21" as const };

	test("rejects matches with a placeholder team", () => {
		expect(checkSubmission({ ...ready, team1: null }, [{ team1: 21, team2: 10 }])).toBe("Teams not assigned");
	});

	test("rejects malformed or invalid scores", () => {
		expect(checkSubmission(ready, "x")).toBe("Invalid score");
		expect(checkSubmission(ready, [{ team1: "21", team2: 10 }])).toBe("Invalid score");
		expect(checkSubmission(ready, [{ team1: 21.5, team2: 10 }])).toBe("Invalid score");
		expect(checkSubmission(ready, [{ team1: 21, team2: 20 }])).toBe("Invalid score");
	});

	test("accepts a valid result", () => {
		expect(checkSubmission(ready, [{ team1: 21, team2: 10 }])).toBeNull();
	});
});

describe("parseSavedState", () => {
	test("restores a saved state", () => {
		const s = at(7, 5, [{ team1: 21, team2: 15 }]);
		expect(parseSavedState(JSON.stringify(s))).toEqual(s);
	});
	test("rejects missing, corrupt or malformed data", () => {
		expect(parseSavedState(null)).toBeNull();
		expect(parseSavedState("{oops")).toBeNull();
		expect(parseSavedState(JSON.stringify({ current: { team1: 1 } }))).toBeNull();
		expect(parseSavedState(JSON.stringify({ completed: [], current: { team1: -1, team2: 0 } }))).toBeNull();
	});
});

describe("stateFromSets (change a submitted score)", () => {
	test("single set: the saved set becomes the current one", () => {
		const s = stateFromSets([{ team1: 21, team2: 18 }], "single_21");
		expect(s).toEqual(at(21, 18));
		expect(matchOutcome(s, "single_21")).toMatchObject({ finished: true, winner: 1 });
	});
	test("best of 3: earlier sets completed, last set current", () => {
		const sets = [
			{ team1: 21, team2: 15 },
			{ team1: 15, team2: 21 },
			{ team1: 15, team2: 13 },
		];
		const s = stateFromSets(sets, "best_of_3");
		expect(s).toEqual(at(15, 13, sets.slice(0, 2)));
		expect(matchOutcome(s, "best_of_3").sets).toEqual(sets);
	});
	test("no saved sets: a fresh state", () => {
		expect(stateFromSets([], "single_21")).toEqual(emptyState());
	});
});
