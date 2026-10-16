// Match reminders: who is due a push notification, when, and what it says (spec: pwa-notifications §2, §5.3).
// Pure: the scheduled job loads a Snapshot from D1 and passes it in.
import { calendarPath } from "./routes";
import { formatTime, matchTime } from "./schedule";
import type { Category, Day } from "./types";

export type SnapshotTeam = { id: string; seed: string; name: string; playerIds: string[] };
export type SnapshotMatch = {
	id: string;
	category: Category;
	day: Day;
	slot: number;
	court: 1 | 2;
	timeOverride: Date | null;
	finished: boolean;
	sessionStart: Date;
	slotMinutes: number;
	team1Id: string | null;
	team2Id: string | null;
	refereeId: string | null;
	team1Label: string;
	team2Label: string;
};
export type Snapshot = { matches: SnapshotMatch[]; teams: Map<string, SnapshotTeam> };
export type Role = "player" | "referee";
export type Reminder = { matchId: string; playerId: string; role: Role; start: Date };
export type PushPayload = { title: string; body: string; url: string; tag: string };
export type PlayerMatch = {
	matchId: string;
	role: Role;
	start: Date;
	category: Category;
	court: 1 | 2;
	label: string;
};

export const REMINDER_LEAD_MINUTES = 20;
export const RESCHEDULE_THRESHOLD_MINUTES = 5;

const MINUTE = 60_000;

export function matchStart(m: SnapshotMatch): Date {
	return matchTime({ startsAt: m.sessionStart, slotMinutes: m.slotMinutes }, m.slot, m.timeOverride);
}

const playersOf = (s: Snapshot, teamId: string | null) => (teamId ? (s.teams.get(teamId)?.playerIds ?? []) : []);

/** Each player in a match once, with their role; the player role wins over referee. */
function rolesIn(s: Snapshot, m: SnapshotMatch): Map<string, Role> {
	const roles = new Map<string, Role>();
	for (const id of playersOf(s, m.refereeId)) roles.set(id, "referee");
	for (const id of [...playersOf(s, m.team1Id), ...playersOf(s, m.team2Id)]) roles.set(id, "player");
	return roles;
}

export function dueReminders(s: Snapshot, now: Date): Reminder[] {
	const reminders: Reminder[] = [];
	for (const m of s.matches) {
		if (m.finished) continue;
		const start = matchStart(m);
		const due = now.getTime() >= start.getTime() - REMINDER_LEAD_MINUTES * MINUTE && now < start;
		if (!due) continue;
		for (const [playerId, role] of rolesIn(s, m)) reminders.push({ matchId: m.id, playerId, role, start });
	}
	return reminders;
}

export function resendDecision(lastMatchStart: Date | null, start: Date): "send" | "rescheduled" | "skip" {
	if (!lastMatchStart) return "send";
	const moved = Math.abs(start.getTime() - lastMatchStart.getTime());
	return moved > RESCHEDULE_THRESHOLD_MINUTES * MINUTE ? "rescheduled" : "skip";
}

const teamName = (s: Snapshot, teamId: string | null, label: string) =>
	(teamId ? s.teams.get(teamId)?.name : undefined) ?? label;

const matchLabel = (s: Snapshot, m: SnapshotMatch) =>
	`${teamName(s, m.team1Id, m.team1Label)} v ${teamName(s, m.team2Id, m.team2Label)}`;

export function reminderPayload(s: Snapshot, r: Reminder, now: Date, rescheduled: boolean): PushPayload {
	const m = s.matches.find((x) => x.id === r.matchId);
	if (!m) throw new Error(`Unknown match ${r.matchId}`);
	const minutes = Math.max(1, Math.floor((r.start.getTime() - now.getTime()) / MINUTE));
	const what = r.role === "player" ? `your match in ${minutes} min` : `you're refereeing in ${minutes} min`;
	const title = rescheduled ? `Rescheduled: ${what}` : what.charAt(0).toUpperCase() + what.slice(1);
	const day = m.day === "saturday" ? "Sat" : "Sun";
	return {
		title,
		body: `${day} ${formatTime(r.start)} · Court ${m.court} · ${matchLabel(s, m)}`,
		url: r.role === "player" ? `${calendarPath(m.category, m.day)}#match-${m.id}` : `/referee/${m.id}`,
		tag: `${m.id}:${r.role}`,
	};
}

export function playerMatches(s: Snapshot, playerId: string, now: Date): PlayerMatch[] {
	return s.matches
		.filter((m) => !m.finished)
		.flatMap((m) => {
			const role = rolesIn(s, m).get(playerId);
			const start = matchStart(m);
			if (!role || start <= now) return [];
			return [{ matchId: m.id, role, start, category: m.category, court: m.court, label: matchLabel(s, m) }];
		})
		.sort((a, b) => a.start.getTime() - b.start.getTime());
}
