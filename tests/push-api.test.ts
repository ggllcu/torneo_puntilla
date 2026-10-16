import { describe, expect, test } from "vitest";
import { parseEndpointBody, parseSubscribeBody } from "../src/lib/push-api";

const valid = {
	subscription: { endpoint: "https://fcm.googleapis.com/fcm/send/abc", keys: { p256dh: "B" + "A".repeat(86), auth: "A".repeat(22) } },
	playerId: "p-dani",
};

describe("parseSubscribeBody", () => {
	test("accepts a browser subscription and a player", () => {
		expect(parseSubscribeBody(valid)).toEqual({
			endpoint: "https://fcm.googleapis.com/fcm/send/abc",
			p256dh: "B" + "A".repeat(86),
			auth: "A".repeat(22),
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

describe("subscribe hardening (review finding 4)", () => {
	const p256dh = "B" + "A".repeat(86); // 65 bytes base64url
	const auth = "A".repeat(22); // 16 bytes base64url
	const body = (endpoint: string, keys = { p256dh, auth }) => ({ subscription: { endpoint, keys }, playerId: "p-dani" });

	test("accepts the real push services", () => {
		for (const endpoint of [
			"https://fcm.googleapis.com/fcm/send/abc",
			"https://web.push.apple.com/QGx1",
			"https://updates.push.services.mozilla.com/wpush/v2/x",
			"https://wns2-db5p.notify.windows.com/w/?token=x",
		])
			expect(parseSubscribeBody(body(endpoint)), endpoint).not.toBeNull();
	});

	test("rejects other hosts and keys of the wrong size", () => {
		expect(parseSubscribeBody(body("https://evil.example/push"))).toBeNull();
		expect(parseSubscribeBody(body("https://fcm.googleapis.com.evil.example/x"))).toBeNull();
		expect(parseSubscribeBody(body("https://fcm.googleapis.com/x", { p256dh: "BNcR", auth }))).toBeNull();
		expect(parseSubscribeBody(body("https://fcm.googleapis.com/x", { p256dh, auth: "short" }))).toBeNull();
	});
});
