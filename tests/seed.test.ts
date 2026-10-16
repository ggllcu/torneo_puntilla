import { describe, expect, test } from "vitest";
import { buildSeed } from "../scripts/build-seed";

const seed = buildSeed();
const c = seed.content;
const match = (id: string) => c.matches.find((x) => x.id === id)!.data;
const team = (id: string) => c.teams.find((x) => x.id === id)!.data;

describe("seed", () => {
	test("counts", () => {
		expect(c.players).toHaveLength(48);
		expect(c.teams).toHaveLength(33);
		expect(c.groups).toHaveLength(3 + 1 + 4 + 4); // womens A-C + Repechage, mens A-D, mixed A-D
		expect(c.sessions).toHaveLength(6);
		expect(c.matches).toHaveLength(68); // 33 group + 3 repechage + 8 playoff + 24 sunday
	});

	test("shared players are one record", () => {
		expect(team("t-mens-A1").players).toContain("$ref:p-dani");
		expect(team("t-mixed-B3").players).toContain("$ref:p-dani");
		expect(team("t-mixed-B3").name).toBe("Dani/Laura P.");
		expect(c.players.map((p) => p.data.name)).toEqual(
			expect.arrayContaining(["Laura M.", "Laura P.", "Paula L.", "Paula G.", "Emilija"]),
		);
	});

	test("women's slot 5 court 2 is repechage 3rd A v 3rd B, ref 2nd A", () => {
		const m = match("m-womens-saturday-5-2");
		expect(m).toMatchObject({
			phase: "repechage",
			team1_label: "3rd Group A",
			team2_label: "3rd Group B",
			referee_label: "2nd Group A",
			group: "$ref:g-womens-repechage",
		});
		expect(m.team1).toBeUndefined();
	});

	test("men's slot 1 court 1 is A1 v A2 ref B3", () => {
		expect(match("m-mens-saturday-1-1")).toMatchObject({
			phase: "group",
			team1: "$ref:t-mens-A1",
			team2: "$ref:t-mens-A2",
			referee: "$ref:t-mens-B3",
			team1_label: "A1",
			group: "$ref:g-mens-a",
			format: "single_21",
			match_state: "scheduled",
			sets: [],
		});
	});

	test("men's playoff PO4 is slot 8 court 2, 3rd C v 2nd D ref 1st B", () => {
		expect(match("m-mens-saturday-8-2")).toMatchObject({
			phase: "playoff",
			bracket_code: "PO4",
			team1_label: "3rd Group C",
			team2_label: "2nd Group D",
			referee_label: "1st Group B",
		});
	});

	test("sunday bracket", () => {
		expect(match("m-mixed-sunday-1-1")).toMatchObject({
			phase: "quarterfinal",
			bracket_code: "QF1",
			team1_label: "1st Group A",
			team2_label: "Winner PO4",
			referee_label: "TBD",
		});
		expect(match("m-womens-sunday-1-1")).toMatchObject({ team2_label: "2nd Repechage" });
		expect(match("m-womens-sunday-2-2")).toMatchObject({
			bracket_code: "QF4",
			team1_label: "2nd Group B",
			team2_label: "1st Repechage",
		});
		expect(match("m-mens-sunday-4-1")).toMatchObject({
			phase: "final",
			format: "best_of_3",
			team1_label: "Winner SF1",
		});
		expect(match("m-mens-sunday-4-2")).toMatchObject({
			phase: "third_place",
			bracket_code: "3RD",
			team1_label: "Loser SF1",
		});
	});

	test("sessions start at Canary local times", () => {
		const s = (id: string) => c.sessions.find((x) => x.id === id)!.data;
		expect(s("s-womens-saturday")).toMatchObject({ starts_at: "2026-10-17T08:00:00.000Z", slot_minutes: 20 });
		expect(s("s-mixed-sunday").starts_at).toBe("2026-10-18T08:30:00.000Z");
		expect(s("s-mens-sunday").starts_at).toBe("2026-10-18T15:30:00.000Z");
	});

	test("refs point only to earlier content", () => {
		const seen = new Set<string>();
		for (const coll of ["players", "teams", "groups", "sessions", "matches"] as const) {
			expect(Object.keys(c)).toContain(coll);
			for (const entry of c[coll]) {
				const refs = JSON.stringify(entry.data).match(/\$ref:[^"]+/g) ?? [];
				for (const r of refs) expect(seen, r).toContain(r.slice(5));
				seen.add(entry.id);
			}
		}
		expect(Object.keys(c)).toEqual(["players", "teams", "groups", "sessions", "matches"]);
	});

	test("every entry is published and match status uses match_state", () => {
		for (const list of Object.values(c)) for (const e of list) expect(e.status).toBe("published");
		const fields = seed.collections.find((x) => x.slug === "matches")!.fields.map((f) => f.slug);
		expect(fields).toContain("match_state");
		expect(fields).not.toContain("status");
	});
});
