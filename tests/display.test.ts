import { describe, expect, test } from "vitest";
import { CATEGORY_LABEL, formatScore, roundLabel, winnerOf } from "../src/lib/display";
import { match, sets } from "./fixtures";

describe("winnerOf", () => {
	test("single set: higher score", () => {
		expect(winnerOf(sets([15, 21]))).toBe(2);
		expect(winnerOf(sets([21, 0]))).toBe(1);
	});
	test("best of 3: more sets won", () => {
		expect(winnerOf(sets([21, 18], [19, 21], [15, 12]))).toBe(1);
	});
	test("no sets or a tie has no winner", () => {
		expect(winnerOf([])).toBeNull();
		expect(winnerOf(sets([0, 0]))).toBeNull();
		expect(winnerOf(sets([21, 15], [15, 21]))).toBeNull();
	});
});

describe("formatScore", () => {
	test("single set", () => expect(formatScore(sets([21, 18]))).toBe("21–18"));
	test("best of 3 shows sets won, then each set", () =>
		expect(formatScore(sets([21, 18], [19, 21], [15, 12]))).toBe("2–1 (21–18, 19–21, 15–12)"));
	test("no sets", () => expect(formatScore([])).toBe(""));
});

describe("roundLabel", () => {
	test("every phase", () => {
		expect(roundLabel(match({ phase: "group", groupName: "A" }))).toBe("Group A");
		expect(roundLabel(match({ phase: "repechage", groupName: "Repechage" }))).toBe("Repechage");
		expect(roundLabel(match({ phase: "playoff", bracketCode: "PO3" }))).toBe("Playoff 3");
		expect(roundLabel(match({ phase: "quarterfinal", bracketCode: "QF2" }))).toBe("Quarterfinal 2");
		expect(roundLabel(match({ phase: "semifinal", bracketCode: "SF1" }))).toBe("Semifinal 1");
		expect(roundLabel(match({ phase: "third_place", bracketCode: "3RD" }))).toBe("3rd place");
		expect(roundLabel(match({ phase: "final", bracketCode: "FINAL" }))).toBe("Final");
	});
});

test("category labels", () => {
	expect(CATEGORY_LABEL).toEqual({ mens: "Men's", womens: "Women's", mixed: "Mixed" });
});
