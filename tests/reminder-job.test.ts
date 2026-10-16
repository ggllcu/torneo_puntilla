import { beforeEach, describe, expect, test } from "vitest";
import { getSubscription, upsertSubscription, type StoredSubscription } from "../src/lib/push-db";
import type { SendPush } from "../src/lib/push-send";
import type { PushPayload } from "../src/lib/reminders";
import { runReminders } from "../src/lib/reminder-job";
import { seedEmdashFixture, sqliteDb } from "./sqlite";

const at = (hhmmss: string) => new Date(`2026-10-17T${hhmmss}Z`);

let db: ReturnType<typeof sqliteDb>;
let calls: { endpoint: string; payload: PushPayload }[];
let status: Record<string, number>;

const send: SendPush = async (sub: StoredSubscription, payload: PushPayload) => {
	calls.push({ endpoint: sub.endpoint, payload });
	return status[sub.endpoint] ?? 201;
};

beforeEach(async () => {
	db = sqliteDb();
	seedEmdashFixture(db);
	calls = [];
	status = {};
	const now = at("09:00:00");
	await upsertSubscription(db, { endpoint: "e-dani", p256dh: "k", auth: "a", playerId: "p-dani" }, now);
	await upsertSubscription(db, { endpoint: "e-marci", p256dh: "k", auth: "a", playerId: "p-marci" }, now);
});

const override = (iso: string) => db.exec(`UPDATE ec_matches SET time_override='${iso}' WHERE id='m1'`);

describe("runReminders", () => {
	test("sends each due reminder once", async () => {
		expect(await runReminders(db, at("11:09:00"), send)).toEqual({ sent: 0, removed: 0, failed: 0 });
		expect(await runReminders(db, at("11:10:00"), send)).toEqual({ sent: 2, removed: 0, failed: 0 });
		expect(calls.map((c) => [c.endpoint, c.payload.title, c.payload.url])).toEqual([
			["e-dani", "Your match in 20 min", "/mens/qualifiers#match-m1"],
			["e-marci", "You're refereeing in 20 min", "/referee/m1"],
		]);
		expect(await runReminders(db, at("11:11:00"), send)).toEqual({ sent: 0, removed: 0, failed: 0 });
	});

	test("a match moved more than 5 minutes is reminded again as rescheduled", async () => {
		await runReminders(db, at("11:10:00"), send);
		override("2026-10-17T11:50:00.000Z");
		calls = [];
		expect((await runReminders(db, at("11:30:00"), send)).sent).toBe(2);
		expect(calls.map((c) => c.payload.title)).toEqual([
			"Rescheduled: your match in 20 min",
			"Rescheduled: you're refereeing in 20 min",
		]);
	});

	test("a move of 5 minutes or less doesn't re-notify", async () => {
		await runReminders(db, at("11:10:00"), send);
		override("2026-10-17T11:33:00.000Z");
		calls = [];
		expect((await runReminders(db, at("11:13:00"), send)).sent).toBe(0);
	});

	test("a subscription the push service says is gone is removed", async () => {
		status["e-dani"] = 410;
		expect(await runReminders(db, at("11:10:00"), send)).toEqual({ sent: 1, removed: 1, failed: 0 });
		expect(await getSubscription(db, "e-dani")).toBeNull();
		calls = [];
		await runReminders(db, at("11:11:00"), send);
		expect(calls.map((c) => c.endpoint)).not.toContain("e-dani");
	});

	test("other failures are retried next minute", async () => {
		status["e-marci"] = 500;
		expect(await runReminders(db, at("11:10:00"), send)).toEqual({ sent: 1, removed: 0, failed: 1 });
		status["e-marci"] = 201;
		calls = [];
		expect(await runReminders(db, at("11:11:00"), send)).toEqual({ sent: 1, removed: 0, failed: 0 });
		expect(calls[0]).toMatchObject({ endpoint: "e-marci", payload: { title: "You're refereeing in 19 min" } });
	});

	test("a sender that throws counts as failed", async () => {
		const throwing: SendPush = async () => {
			throw new Error("network down");
		};
		expect(await runReminders(db, at("11:10:00"), throwing)).toEqual({ sent: 0, removed: 0, failed: 2 });
	});

	test("never throws when the snapshot can't be loaded", async () => {
		db.exec("DROP TABLE ec_matches");
		expect(await runReminders(db, at("11:10:00"), send)).toEqual({ sent: 0, removed: 0, failed: 0 });
	});
});
