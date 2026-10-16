import { describe, expect, test } from "vitest";
import { calendarPath, parseCalendarRoute } from "../src/lib/routes";

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
