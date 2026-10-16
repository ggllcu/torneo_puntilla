import { beforeEach, describe, expect, test } from "vitest";
import {
	deleteSubscription,
	getSubscription,
	lastSentStart,
	loadPlayers,
	loadSnapshot,
	playerExists,
	recordSent,
	subscriptionsForPlayers,
	upsertSubscription,
} from "../src/lib/push-db";
import { seedEmdashFixture, sqliteDb } from "./sqlite";

let db: ReturnType<typeof sqliteDb>;
beforeEach(() => {
	db = sqliteDb();
	seedEmdashFixture(db);
});

const now = new Date("2026-10-17T10:00:00Z");
const sub = (endpoint: string, playerId: string) => ({ endpoint, p256dh: "key", auth: "auth", playerId });

describe("loadSnapshot", () => {
	test("reads published, non-deleted matches that have a session, with team links and players", async () => {
		const s = await loadSnapshot(db);
		expect(s.matches.map((m) => m.id)).toEqual(["m1"]);
		expect(s.matches[0]).toEqual({
			id: "m1",
			category: "mens",
			day: "saturday",
			slot: 1,
			court: 1,
			timeOverride: null,
			finished: false,
			sessionStart: new Date("2026-10-17T11:30:00.000Z"),
			slotMinutes: 20,
			team1Id: "tA1",
			team2Id: "tA2",
			refereeId: "tB3",
			team1Label: "A1",
			team2Label: "A2",
		});
		expect(s.teams.get("tA1")).toEqual({ id: "tA1", seed: "A1", name: "Dani/Mat", playerIds: ["p-dani", "p-mat"] });
		expect(s.teams.get("t-empty")?.playerIds).toEqual([]);
	});

	test("maps overrides and finished state", async () => {
		db.exec(`UPDATE ec_matches SET time_override='2026-10-17T11:50:00.000Z', match_state='finished' WHERE id='m1'`);
		const [m] = (await loadSnapshot(db)).matches;
		expect(m.timeOverride).toEqual(new Date("2026-10-17T11:50:00.000Z"));
		expect(m.finished).toBe(true);
	});
});

describe("players", () => {
	test("loadPlayers lists published players sorted by name", async () => {
		expect((await loadPlayers(db)).map((p) => p.name)).toEqual(["Dani", "Emilio", "Giando", "Ilde", "Marci", "Mat"]);
	});
	test("playerExists", async () => {
		expect(await playerExists(db, "p-dani")).toBe(true);
		expect(await playerExists(db, "p-gone")).toBe(false);
		expect(await playerExists(db, "p-nope")).toBe(false);
	});
});

describe("subscriptions", () => {
	test("upsert by endpoint replaces the player", async () => {
		await upsertSubscription(db, sub("https://push/1", "p-dani"), now);
		await upsertSubscription(db, sub("https://push/1", "p-marci"), now);
		expect(await subscriptionsForPlayers(db, ["p-dani"])).toEqual([]);
		expect(await subscriptionsForPlayers(db, ["p-marci", "p-mat"])).toEqual([sub("https://push/1", "p-marci")]);
		expect(await getSubscription(db, "https://push/1")).toEqual(sub("https://push/1", "p-marci"));
	});

	test("sent log: latest start wins; delete removes the subscription and its log", async () => {
		await upsertSubscription(db, sub("https://push/1", "p-dani"), now);
		expect(await lastSentStart(db, "https://push/1", "p-dani", "m1", "player")).toBeNull();
		const first = new Date("2026-10-17T11:30:00Z");
		const later = new Date("2026-10-17T11:50:00Z");
		await recordSent(db, "https://push/1", "p-dani", "m1", "player", first, new Date("2026-10-17T11:10:00Z"));
		expect(await lastSentStart(db, "https://push/1", "p-dani", "m1", "player")).toEqual(first);
		await recordSent(db, "https://push/1", "p-dani", "m1", "player", later, new Date("2026-10-17T11:30:00Z"));
		expect(await lastSentStart(db, "https://push/1", "p-dani", "m1", "player")).toEqual(later);
		expect(await lastSentStart(db, "https://push/1", "p-marci", "m1", "player")).toBeNull();

		await deleteSubscription(db, "https://push/1");
		expect(await getSubscription(db, "https://push/1")).toBeNull();
		expect(await db.all("SELECT * FROM push_sent")).toEqual([]);
	});

	test("subscriptionsForPlayers with no players", async () => {
		expect(await subscriptionsForPlayers(db, [])).toEqual([]);
	});
});
