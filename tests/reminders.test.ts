import { describe, expect, test } from "vitest";
import {
	dueReminders,
	matchStart,
	playerMatches,
	reminderPayload,
	resendDecision,
	type Snapshot,
	type SnapshotMatch,
	type SnapshotTeam,
} from "../src/lib/reminders";

const at = (hhmmss: string) => new Date(`2026-10-17T${hhmmss}Z`);

const teams: SnapshotTeam[] = [
	{ id: "tA1", seed: "A1", name: "Dani/Mat", playerIds: ["p-dani", "p-mat"] },
	{ id: "tA2", seed: "A2", name: "Emilio/Ilde", playerIds: ["p-emilio", "p-ilde"] },
	{ id: "tB3", seed: "B3", name: "Marci/Giando", playerIds: ["p-marci", "p-giando"] },
];

const m1 = (overrides: Partial<SnapshotMatch> = {}): SnapshotMatch => ({
	id: "m1",
	category: "mens",
	day: "saturday",
	slot: 1,
	court: 1,
	timeOverride: null,
	finished: false,
	sessionStart: at("11:30:00"),
	slotMinutes: 20,
	team1Id: "tA1",
	team2Id: "tA2",
	refereeId: "tB3",
	team1Label: "A1",
	team2Label: "A2",
	...overrides,
});

const snapshot = (matches: SnapshotMatch[], extraTeams: SnapshotTeam[] = []): Snapshot => ({
	matches,
	teams: new Map([...teams, ...extraTeams].map((t) => [t.id, t])),
});

const summary = (rs: ReturnType<typeof dueReminders>) => rs.map((r) => `${r.playerId}:${r.role}`).sort();

describe("matchStart", () => {
	test("session start + slot, or the override", () => {
		expect(matchStart(m1({ slot: 3 }))).toEqual(at("12:10:00"));
		expect(matchStart(m1({ timeOverride: at("11:50:00") }))).toEqual(at("11:50:00"));
	});
});

describe("dueReminders", () => {
	test("nothing before start − 20 min", () => {
		expect(dueReminders(snapshot([m1()]), at("11:09:59"))).toEqual([]);
	});

	test("at start − 20 min: both teams as players, referee team as referees", () => {
		const rs = dueReminders(snapshot([m1()]), at("11:10:00"));
		expect(summary(rs)).toEqual([
			"p-dani:player",
			"p-emilio:player",
			"p-giando:referee",
			"p-ilde:player",
			"p-marci:referee",
			"p-mat:player",
		]);
		for (const r of rs) expect(r).toMatchObject({ matchId: "m1", start: at("11:30:00") });
	});

	test("nothing once the match started, or when it's finished", () => {
		expect(dueReminders(snapshot([m1()]), at("11:30:00"))).toEqual([]);
		expect(dueReminders(snapshot([m1({ finished: true })]), at("11:15:00"))).toEqual([]);
	});

	test("follows the time override", () => {
		const s = snapshot([m1({ timeOverride: at("11:50:00") })]);
		expect(dueReminders(s, at("11:10:00"))).toEqual([]);
		expect(dueReminders(s, at("11:30:00"))).toHaveLength(6);
	});

	test("late assignment: a team set after start − 20 min is still reminded before the start", () => {
		expect(summary(dueReminders(snapshot([m1({ team2Id: null })]), at("11:10:00")))).toEqual([
			"p-dani:player",
			"p-giando:referee",
			"p-marci:referee",
			"p-mat:player",
		]);
		expect(summary(dueReminders(snapshot([m1()]), at("11:25:00")))).toContain("p-emilio:player");
	});

	test("a player on a playing team and the referee team gets the player reminder only", () => {
		const both: SnapshotTeam = { id: "tX", seed: "B1", name: "Dani/Someone", playerIds: ["p-dani", "p-someone"] };
		const rs = dueReminders(snapshot([m1({ refereeId: "tX" })], [both]), at("11:10:00"));
		expect(rs.filter((r) => r.playerId === "p-dani")).toEqual([
			{ matchId: "m1", playerId: "p-dani", role: "player", start: at("11:30:00") },
		]);
		expect(summary(rs)).toContain("p-someone:referee");
	});

	test("unknown or empty teams are ignored", () => {
		const empty: SnapshotTeam = { id: "tE", seed: "C1", name: "Nobody", playerIds: [] };
		expect(dueReminders(snapshot([m1({ team1Id: "t-missing", team2Id: "tE", refereeId: null })], [empty]), at("11:10:00"))).toEqual([]);
	});
});

describe("resendDecision", () => {
	const start = at("11:30:00");
	const plus = (min: number) => new Date(start.getTime() + min * 60_000);
	test("first reminder is sent, same start is skipped", () => {
		expect(resendDecision(null, start)).toBe("send");
		expect(resendDecision(start, start)).toBe("skip");
	});
	test("moves of more than 5 minutes are rescheduled, either direction", () => {
		expect(resendDecision(start, plus(5))).toBe("skip");
		expect(resendDecision(start, plus(6))).toBe("rescheduled");
		expect(resendDecision(start, plus(-10))).toBe("rescheduled");
	});
});

describe("reminderPayload", () => {
	const s = snapshot([m1()]);
	const reminder = (playerId: string, role: "player" | "referee") => ({ matchId: "m1", playerId, role, start: at("11:30:00") });

	test("player reminder", () => {
		expect(reminderPayload(s, reminder("p-dani", "player"), at("11:10:00"), false)).toEqual({
			title: "Your match in 20 min",
			body: "Sat 12:30 · Court 1 · Dani/Mat v Emilio/Ilde",
			url: "/mens/qualifiers#match-m1",
			tag: "m1:player",
		});
	});

	test("referee reminder sent late, minutes rounded down, minimum 1", () => {
		expect(reminderPayload(s, reminder("p-marci", "referee"), at("11:25:30"), false)).toMatchObject({
			title: "You're refereeing in 4 min",
			url: "/referee/m1",
			tag: "m1:referee",
		});
		expect(reminderPayload(s, reminder("p-marci", "referee"), at("11:29:50"), false).title).toBe(
			"You're refereeing in 1 min",
		);
	});

	test("rescheduled wording", () => {
		expect(reminderPayload(s, reminder("p-dani", "player"), at("11:10:00"), true).title).toBe(
			"Rescheduled: your match in 20 min",
		);
		expect(reminderPayload(s, reminder("p-marci", "referee"), at("11:10:00"), true).title).toBe(
			"Rescheduled: you're refereeing in 20 min",
		);
	});

	test("a placeholder team shows its label; Sunday matches link to the finals tab", () => {
		const sunday = snapshot([m1({ day: "sunday", team2Id: null, team2Label: "Winner PO4", sessionStart: new Date("2026-10-18T15:30:00Z") })]);
		const p = reminderPayload(sunday, { matchId: "m1", playerId: "p-dani", role: "player", start: new Date("2026-10-18T15:30:00Z") }, new Date("2026-10-18T15:10:00Z"), false);
		expect(p.body).toBe("Sun 16:30 · Court 1 · Dani/Mat v Winner PO4");
		expect(p.url).toBe("/mens/finals#match-m1");
	});
});

describe("playerMatches", () => {
	test("upcoming matches with role and label", () => {
		const s = snapshot([m1(), m1({ id: "m2", slot: 3, team1Id: "tB3", team2Id: "tA2", refereeId: "tA1" }), m1({ id: "m0", finished: true })]);
		expect(playerMatches(s, "p-marci", at("11:00:00"))).toEqual([
			{ matchId: "m1", role: "referee", start: at("11:30:00"), category: "mens", court: 1, label: "Dani/Mat v Emilio/Ilde" },
			{ matchId: "m2", role: "player", start: at("12:10:00"), category: "mens", court: 1, label: "Marci/Giando v Emilio/Ilde" },
		]);
	});
	test("past matches and unknown players give nothing", () => {
		const s = snapshot([m1()]);
		expect(playerMatches(s, "p-marci", at("11:30:00"))).toEqual([]);
		expect(playerMatches(s, "p-nobody", at("11:00:00"))).toEqual([]);
	});
});

describe("playerMatches with includePast (calendar highlighting)", () => {
	test("includes finished and already-started matches", () => {
		const s = snapshot([m1({ finished: true }), m1({ id: "m2", slot: 3 })]);
		expect(playerMatches(s, "p-dani", at("12:00:00"), { includePast: true }).map((m) => [m.matchId, m.role])).toEqual([
			["m1", "player"],
			["m2", "player"],
		]);
		expect(playerMatches(s, "p-dani", at("12:00:00")).map((m) => m.matchId)).toEqual(["m2"]);
	});
});
