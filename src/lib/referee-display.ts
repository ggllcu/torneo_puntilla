/** Screen dimensions stay phone-sized in either orientation; a narrow desktop window is not enough. */
export function isPhone(device: { coarsePointer: boolean; hover: boolean; width: number; height: number }): boolean {
	return device.coarsePointer && !device.hover && Math.min(device.width, device.height) < 768;
}

/** Call directly from a user gesture: fullscreen must be requested before yielding to other work. */
export async function enterScoringDisplay(display: {
	mobile: boolean;
	requestFullscreen?: () => Promise<void>;
	lockLandscape?: () => Promise<void>;
}): Promise<boolean> {
	if (!display.mobile) return false;
	try {
		await display.requestFullscreen?.();
	} catch {
		// Installed apps may allow orientation locking without the Fullscreen API.
	}
	try {
		if (!display.lockLandscape) return false;
		await display.lockLandscape();
		return true;
	} catch {
		// Keep the scorer usable when the browser or device refuses the lock.
		return false;
	}
}
