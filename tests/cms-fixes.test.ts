import { describe, expect, test } from "vitest";
import { clearEmptyDatetimes, contentCollection } from "../src/lib/cms-fixes";

describe("clearEmptyDatetimes (emdash 1.3 admin sends \"\" for a cleared date)", () => {
	test("an emptied time override becomes null", () => {
		expect(clearEmptyDatetimes("matches", { data: { time_override: "", slot: 3 }, _rev: "x" })).toEqual({
			data: { time_override: null, slot: 3 },
			_rev: "x",
		});
	});
	test("real dates and other collections are left alone", () => {
		const body = { data: { time_override: "2026-10-17T13:20:00.000Z" } };
		expect(clearEmptyDatetimes("matches", body)).toEqual(body);
		expect(clearEmptyDatetimes("teams", { data: { name: "" } })).toEqual({ data: { name: "" } });
		expect(clearEmptyDatetimes("matches", "not json")).toBe("not json");
		expect(clearEmptyDatetimes("matches", { data: null })).toEqual({ data: null });
	});
});

describe("contentCollection", () => {
	test("admin content save and create URLs", () => {
		expect(contentCollection("PUT", "/_emdash/api/content/matches/m-mens-saturday-6-1")).toBe("matches");
		expect(contentCollection("POST", "/_emdash/api/content/sessions")).toBe("sessions");
	});
	test("everything else", () => {
		expect(contentCollection("GET", "/_emdash/api/content/matches/m1")).toBeNull();
		expect(contentCollection("PUT", "/_emdash/api/content/matches/m1/publish")).toBeNull();
		expect(contentCollection("POST", "/api/matches/m1/result")).toBeNull();
	});
});

test("returns the same object when nothing needs fixing (the middleware relies on it)", () => {
	const body = { data: { time_override: "2026-10-17T13:20:00.000Z" } };
	expect(clearEmptyDatetimes("matches", body)).toBe(body);
});
