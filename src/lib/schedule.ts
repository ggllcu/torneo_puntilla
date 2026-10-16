// Displayed match time = time_override ?? session start + (slot - 1) × slot minutes (spec §4).
import type { MatchView, Session } from "./types";

const TIME = new Intl.DateTimeFormat("en-GB", {
	timeZone: "Atlantic/Canary",
	hour: "2-digit",
	minute: "2-digit",
	hour12: false,
});

export function matchTime(session: Session, slot: number, override: Date | null): Date {
	return override ?? new Date(session.startsAt.getTime() + (slot - 1) * session.slotMinutes * 60_000);
}

/** "09:00", in tournament local time whatever the server's time zone. */
export function formatTime(d: Date): string {
	return TIME.format(d);
}

export function sortMatches(ms: MatchView[], session: Session): MatchView[] {
	const time = (m: MatchView) => matchTime(session, m.slot, m.timeOverride).getTime();
	return [...ms].sort((a, b) => time(a) - time(b) || a.court - b.court);
}
