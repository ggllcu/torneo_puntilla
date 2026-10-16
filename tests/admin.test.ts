import { describe, expect, test } from "vitest";
import { adminParam, isAdminToken } from "../src/lib/admin";

const SECRET = "k3J9x-Qm2v8Rr4tZp7Ya1Lw6Ns0Bc5Hd";

describe("isAdminToken", () => {
	test("only the exact secret is accepted", () => {
		expect(isAdminToken(SECRET, SECRET)).toBe(true);
		expect(isAdminToken(SECRET.slice(0, -1) + "x", SECRET)).toBe(false);
		expect(isAdminToken(SECRET + "x", SECRET)).toBe(false);
		expect(isAdminToken(undefined, SECRET)).toBe(false);
		expect(isAdminToken("", SECRET)).toBe(false);
	});
	test("nobody is admin when no secret is configured", () => {
		expect(isAdminToken("", "")).toBe(false);
		expect(isAdminToken("anything", undefined)).toBe(false);
	});
});

describe("adminParam", () => {
	test("reads ?admin and gives the URL without it", () => {
		expect(adminParam(new URL("https://x.dev/mens/qualifiers?admin=abc"))).toEqual({ value: "abc", cleanUrl: "/mens/qualifiers" });
		expect(adminParam(new URL("https://x.dev/?admin=off&x=1#m"))).toEqual({ value: "off", cleanUrl: "/?x=1" });
	});
	test("no parameter", () => {
		expect(adminParam(new URL("https://x.dev/mens/qualifiers"))).toBeNull();
	});
});
