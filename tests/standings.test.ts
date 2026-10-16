import { describe, expect, test } from "vitest";
import { computeStandings, orderGroups } from "../src/lib/standings";
import { group, match, played, team } from "./fixtures";

const [A1, A2, A3] = [team("A1"), team("A2"), team("A3")];

describe("computeStandings", () => {
	test("counts finished matches and sorts by wins", () => {
		const rows = computeStandings(group("A", [A3, A2, A1]), [
			played(A1, A2, 21, 15),
			played(A2, A3, 21, 19),
			played(A3, A1, 10, 21),
		]);
		expect(rows.map((r) => r.team.seed)).toEqual(["A1", "A2", "A3"]);
		expect(rows[0]).toEqual({ team: A1, played: 2, won: 2, lost: 0, pointsFor: 42, pointsAgainst: 25, diff: 17 });
		expect(rows[2]).toMatchObject({ played: 2, won: 0, lost: 2, pointsFor: 29, pointsAgainst: 42, diff: -13 });
	});

	test("ignores scheduled matches, 0-0 results and matches outside the group", () => {
		const other = team("B1");
		const rows = computeStandings(group("A", [A1, A2, A3]), [
			match({ team1: A1, team2: A2, state: "scheduled" }),
			played(A1, A3, 0, 0),
			played(A2, other, 21, 5),
		]);
		for (const r of rows) expect(r.played).toBe(0);
		expect(rows.map((r) => r.team.seed)).toEqual(["A1", "A2", "A3"]); // seed order when nothing is played
	});

	test("two teams tied on wins and point difference: head-to-head decides", () => {
		const [X, Y, Z] = [team("B2"), team("B1"), team("B3")];
		// X beats Y by 4, Y beats Z by 2, Z beats X by 6 → Z +4; X and Y both 1 win, -2.
		// Y has more points for (38 vs 36) and the lower seed, but X won the head-to-head.
		const rows = computeStandings(group("B", [X, Y, Z]), [
			played(X, Y, 21, 17),
			played(Y, Z, 21, 19),
			played(Z, X, 21, 15),
		]);
		expect(rows.map((r) => r.team.seed)).toEqual(["B3", "B2", "B1"]);
	});

	test("best-of-3 sets are summed into points", () => {
		const rows = computeStandings(group("A", [A1, A2]), [
			match({ team1: A1, team2: A2, state: "finished", sets: [{ team1: 21, team2: 18 }, { team1: 19, team2: 21 }, { team1: 15, team2: 12 }] }),
		]);
		expect(rows[0]).toMatchObject({ team: A1, won: 1, pointsFor: 55, pointsAgainst: 51 });
	});
});

describe("orderGroups", () => {
	test("by name, Repechage last", () => {
		const names = orderGroups([group("Repechage", []), group("B", []), group("A", []), group("C", [])]).map(
			(g) => g.name,
		);
		expect(names).toEqual(["A", "B", "C", "Repechage"]);
	});
});
