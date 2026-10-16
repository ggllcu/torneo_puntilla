import { describe, expect, test } from "vitest";
import { parseEndpointBody, parseSubscribeBody } from "../src/lib/push-api";

const valid = {
	subscription: { endpoint: "https://fcm.googleapis.com/fcm/send/abc", keys: { p256dh: "BNcR", auth: "tBHI" } },
	playerId: "p-dani",
};

describe("parseSubscribeBody", () => {
	test("accepts a browser subscription and a player", () => {
		expect(parseSubscribeBody(valid)).toEqual({
			endpoint: "https://fcm.googleapis.com/fcm/send/abc",
			p256dh: "BNcR",
			auth: "tBHI",
			playerId: "p-dani",
		});
	});

	test("rejects anything malformed", () => {
		const sub = valid.subscription;
		for (const bad of [
			null,
			"text",
			{ ...valid, subscription: { endpoint: sub.endpoint } },
			{ ...valid, subscription: { ...sub, endpoint: "http://insecure.example/x" } },
			{ ...valid, subscription: { ...sub, endpoint: "not a url" } },
			{ ...valid, subscription: { ...sub, endpoint: `https://x.example/${"a".repeat(2048)}` } },
			{ ...valid, subscription: { ...sub, keys: { p256dh: "", auth: "x" } } },
			{ ...valid, subscription: { ...sub, keys: { p256dh: "x".repeat(513), auth: "x" } } },
			{ ...valid, playerId: "" },
			{ ...valid, playerId: 42 },
		])
			expect(parseSubscribeBody(bad), JSON.stringify(bad)?.slice(0, 80)).toBeNull();
	});
});

describe("parseEndpointBody", () => {
	test("returns the endpoint or null", () => {
		expect(parseEndpointBody({ endpoint: "https://x" })).toBe("https://x");
		expect(parseEndpointBody({})).toBeNull();
		expect(parseEndpointBody({ endpoint: "http://x" })).toBeNull();
		expect(parseEndpointBody(null)).toBeNull();
	});
});
