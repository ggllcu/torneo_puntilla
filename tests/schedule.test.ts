import { describe, expect, test } from "vitest";
import { formatTime, matchTime, sortMatches } from "../src/lib/schedule";
import { match } from "./fixtures";

const mensSaturday = { startsAt: new Date("2026-10-17T11:30:00Z"), slotMinutes: 20 };

describe("schedule", () => {
	test("formatTime shows Atlantic/Canary local time", () => {
		expect(formatTime(new Date("2026-10-17T08:00:00Z"))).toBe("09:00");
		expect(formatTime(new Date("2026-10-18T15:30:00Z"))).toBe("16:30");
	});

	test("matchTime adds slotMinutes per slot", () => {
		expect(formatTime(matchTime(mensSaturday, 1, null))).toBe("12:30");
		expect(formatTime(matchTime(mensSaturday, 7, null))).toBe("14:30");
	});

	test("a time override wins over the slot", () => {
		const override = new Date("2026-10-17T13:05:00Z");
		expect(matchTime(mensSaturday, 7, override)).toEqual(override);
	});

	test("sortMatches orders by time, then court", () => {
		const late = match({ id: "late", slot: 2, court: 1, timeOverride: new Date("2026-10-17T12:45:00Z") }); // 13:45
		const ms = [
			match({ id: "s3c2", slot: 3, court: 2 }),
			late,
			match({ id: "s3c1", slot: 3, court: 1 }),
			match({ id: "s1c2", slot: 1, court: 2 }),
			match({ id: "s1c1", slot: 1, court: 1 }),
		];
		expect(sortMatches(ms, mensSaturday).map((m) => m.id)).toEqual(["s1c1", "s1c2", "s3c1", "s3c2", "late"]);
	});
});
