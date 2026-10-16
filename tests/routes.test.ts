import { describe, expect, test } from "vitest";
import { calendarPath, defaultTab, parseCalendarRoute, safeReturnPath } from "../src/lib/routes";

describe("calendar routes", () => {
	test("valid category and tab map to a day", () => {
		expect(parseCalendarRoute("mens", "qualifiers")).toEqual({ category: "mens", tab: "qualifiers", day: "saturday" });
		expect(parseCalendarRoute("mixed", "finals")).toEqual({ category: "mixed", tab: "finals", day: "sunday" });
	});
	test("anything else is not a calendar page", () => {
		expect(parseCalendarRoute("foo", "bar")).toBeNull();
		expect(parseCalendarRoute("mens", undefined)).toBeNull();
		expect(parseCalendarRoute("constructor", "finals")).toBeNull();
	});
	test("calendarPath builds the URL for a category and day", () => {
		expect(calendarPath("womens", "saturday")).toBe("/womens/qualifiers");
		expect(calendarPath("mens", "sunday")).toBe("/mens/finals");
	});
});

describe("defaultTab", () => {
	test("qualifiers up to Saturday, finals from Sunday 18 Oct (Canary time)", () => {
		expect(defaultTab(new Date("2026-10-16T12:00:00Z"))).toBe("qualifiers");
		expect(defaultTab(new Date("2026-10-17T22:59:00Z"))).toBe("qualifiers"); // Sat 23:59 local
		expect(defaultTab(new Date("2026-10-17T23:00:00Z"))).toBe("finals"); // Sun 00:00 local
		expect(defaultTab(new Date("2026-10-19T10:00:00Z"))).toBe("finals");
	});
});

describe("safeReturnPath (Settings → Continue)", () => {
	test("keeps paths on this site", () => {
		expect(safeReturnPath("/mens/qualifiers")).toBe("/mens/qualifiers");
		expect(safeReturnPath("/mixed/finals?x=1#match-m-mixed-sunday-1-1")).toBe("/mixed/finals?x=1#match-m-mixed-sunday-1-1");
	});
	test("rejects other sites, settings itself and junk", () => {
		expect(safeReturnPath("//evil.example/x")).toBeNull();
		expect(safeReturnPath("https://evil.example/")).toBeNull();
		expect(safeReturnPath("/\\evil.example")).toBeNull();
		expect(safeReturnPath("/settings?from=/")).toBeNull();
		expect(safeReturnPath("")).toBeNull();
		expect(safeReturnPath(null)).toBeNull();
	});
});
