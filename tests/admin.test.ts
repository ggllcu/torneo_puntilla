import { describe, expect, test } from "vitest";
import { isAdminToken, parsePasswordBody } from "../src/lib/admin";

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

describe("parsePasswordBody", () => {
	test("reads a non-empty password", () => {
		expect(parsePasswordBody({ password: "secret" })).toBe("secret");
	});
	test("anything else", () => {
		expect(parsePasswordBody({ password: "" })).toBeNull();
		expect(parsePasswordBody({ password: 42 })).toBeNull();
		expect(parsePasswordBody({ password: "x".repeat(201) })).toBeNull();
		expect(parsePasswordBody(null)).toBeNull();
	});
});
