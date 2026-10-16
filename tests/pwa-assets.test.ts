import { readFileSync, statSync } from "node:fs";
import { expect, test } from "vitest";

const size = (f: string) => {
	const b = readFileSync(`public/icons/${f}`);
	return [b.readUInt32BE(16), b.readUInt32BE(20)];
};

test("icons have the standard sizes and are optimized", () => {
	expect(size("icon-192.png")).toEqual([192, 192]);
	expect(size("icon-512.png")).toEqual([512, 512]);
	expect(size("apple-touch-icon.png")).toEqual([180, 180]);
	expect(size("favicon-32.png")).toEqual([32, 32]);
	for (const f of ["icon-192.png", "icon-512.png", "apple-touch-icon.png"])
		expect(statSync(`public/icons/${f}`).size).toBeLessThan(60_000);
});

test("manifest", () => {
	const m = JSON.parse(readFileSync("public/manifest.webmanifest", "utf8"));
	expect(m).toMatchObject({
		name: "La Puntilla Beach Volley",
		short_name: "La Puntilla",
		start_url: "/",
		display: "standalone",
		background_color: "#f7f3ec",
	});
	expect(m.icons.map((i: { src: string; sizes: string; purpose: string }) => [i.src, i.sizes, i.purpose])).toEqual([
		["/icons/icon-192.png", "192x192", "any maskable"],
		["/icons/icon-512.png", "512x512", "any maskable"],
	]);
});

test("service worker handles push and notificationclick", () => {
	const sw = readFileSync("public/sw.js", "utf8");
	expect(sw).toContain('addEventListener("push"');
	expect(sw).toContain('addEventListener("notificationclick"');
});

test("a notification replacing one with the same tag still alerts (review finding 1)", () => {
	const sw = readFileSync("public/sw.js", "utf8");
	expect(sw).toMatch(/renotify:\s*Boolean\(data\.tag\)/);
});
