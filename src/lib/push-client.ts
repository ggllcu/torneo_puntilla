// Browser-side push helpers, kept pure so they can be unit-tested.

export type PushSupport = "supported" | "unsupported" | "ios-needs-install" | "denied";

export function pushSupport(env: {
	userAgent: string;
	standalone: boolean;
	hasPushManager: boolean;
	hasServiceWorker: boolean;
	permission: string;
}): PushSupport {
	const ios = /iPhone|iPad|iPod/.test(env.userAgent);
	// iOS only offers Web Push to apps added to the home screen.
	if (ios && !env.standalone) return "ios-needs-install";
	if (!env.hasServiceWorker || !env.hasPushManager) return "unsupported";
	if (env.permission === "denied") return "denied";
	return "supported";
}

/** VAPID public keys are base64url; PushManager.subscribe wants bytes. */
export function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
	const padded = (base64 + "=".repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
	return Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));
}
