import { describe, expect, test } from "vitest";
import { isPhone, enterScoringDisplay } from "../src/lib/referee-display";

describe("phone detection", () => {
	test("recognizes a touch phone in portrait and landscape", () => {
		expect(isPhone({ coarsePointer: true, hover: false, width: 390, height: 844 })).toBe(true);
		expect(isPhone({ coarsePointer: true, hover: false, width: 844, height: 390 })).toBe(true);
	});

	test("does not treat desktop windows, touch laptops, or tablets as phones", () => {
		expect(isPhone({ coarsePointer: false, hover: true, width: 390, height: 844 })).toBe(false);
		expect(isPhone({ coarsePointer: true, hover: true, width: 1366, height: 768 })).toBe(false);
		expect(isPhone({ coarsePointer: true, hover: false, width: 820, height: 1180 })).toBe(false);
	});
});

describe("mobile scoring display", () => {
	test("requests fullscreen immediately during the tap, then locks landscape", async () => {
		const events: string[] = [];
		const entering = enterScoringDisplay({
			mobile: true,
			requestFullscreen: async () => { events.push("fullscreen"); },
			lockLandscape: async () => { events.push("landscape"); },
		});
		expect(events).toEqual(["fullscreen"]);
		expect(await entering).toBe(true);
		expect(events).toEqual(["fullscreen", "landscape"]);
	});

	test("does not change desktop fullscreen or orientation", async () => {
		const events: string[] = [];
		expect(await enterScoringDisplay({
			mobile: false,
			requestFullscreen: async () => { events.push("fullscreen"); },
			lockLandscape: async () => { events.push("landscape"); },
		})).toBe(false);
		expect(events).toEqual([]);
	});

	test("can lock an installed app even when fullscreen is unavailable or refused", async () => {
		let locks = 0;
		const lockLandscape = async () => { locks++; };
		expect(await enterScoringDisplay({ mobile: true, lockLandscape })).toBe(true);
		expect(await enterScoringDisplay({
			mobile: true,
			requestFullscreen: async () => { throw new Error("Fullscreen unavailable"); },
			lockLandscape,
		})).toBe(true);
		expect(locks).toBe(2);
	});

	test("keeps scoring available if orientation locking is missing or rejected", async () => {
		expect(await enterScoringDisplay({ mobile: true })).toBe(false);
		expect(await enterScoringDisplay({
			mobile: true,
			lockLandscape: async () => { throw new Error("Not supported"); },
		})).toBe(false);
	});
});
