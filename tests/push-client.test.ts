import { describe, expect, test } from "vitest";
import { pushSupport, urlBase64ToUint8Array } from "../src/lib/push-client";

const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
const ANDROID = "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36";
const base = { standalone: false, hasPushManager: true, hasServiceWorker: true, permission: "default" };

describe("pushSupport", () => {
	test("iPhone in Safari must be installed first", () => {
		expect(pushSupport({ ...base, userAgent: IPHONE, hasPushManager: false })).toBe("ios-needs-install");
	});
	test("installed iPhone app with push is supported", () => {
		expect(pushSupport({ ...base, userAgent: IPHONE, standalone: true })).toBe("supported");
	});
	test("Android Chrome is supported", () => {
		expect(pushSupport({ ...base, userAgent: ANDROID })).toBe("supported");
	});
	test("blocked permission", () => {
		expect(pushSupport({ ...base, userAgent: ANDROID, permission: "denied" })).toBe("denied");
	});
	test("browsers without push", () => {
		expect(pushSupport({ ...base, userAgent: ANDROID, hasPushManager: false })).toBe("unsupported");
		expect(pushSupport({ ...base, userAgent: IPHONE, standalone: true, hasPushManager: false })).toBe("unsupported");
	});
});

describe("urlBase64ToUint8Array", () => {
	test("decodes base64url, padding optional", () => {
		expect(urlBase64ToUint8Array("AQID")).toEqual(new Uint8Array([1, 2, 3]));
		expect(urlBase64ToUint8Array("-_8")).toEqual(new Uint8Array([251, 255]));
	});
});
