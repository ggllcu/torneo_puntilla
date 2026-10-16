// The every-minute reminder run: snapshot → due reminders → send → record. Never throws.
import {
	deleteSubscription,
	lastSentStart,
	loadSnapshot,
	recordSent,
	subscriptionsForPlayers,
	type SqlDb,
} from "./push-db";
import type { SendPush } from "./push-send";
import {
	dueReminders,
	matchRoles,
	matchStart,
	nextOnCourt,
	nextUpPayload,
	reminderPayload,
	resendDecision,
	type Snapshot,
} from "./reminders";

export type RunResult = { sent: number; removed: number; failed: number };

const isGone = (status: number) => status === 404 || status === 410;
const isOk = (status: number) => status >= 200 && status < 300;

export async function runReminders(db: SqlDb, now: Date, send: SendPush): Promise<RunResult> {
	const result: RunResult = { sent: 0, removed: 0, failed: 0 };
	let snapshot: Snapshot;
	try {
		snapshot = await loadSnapshot(db);
	} catch (error) {
		console.error("[reminders] could not load the tournament snapshot", error);
		return result;
	}

	const reminders = dueReminders(snapshot, now);
	if (reminders.length === 0) return result;

	const subscriptions = await subscriptionsForPlayers(db, [...new Set(reminders.map((r) => r.playerId))]).catch(
		(error) => {
			console.error("[reminders] could not load subscriptions", error);
			return [];
		},
	);
	const removed = new Set<string>();

	for (const reminder of reminders) {
		for (const sub of subscriptions) {
			if (sub.playerId !== reminder.playerId || removed.has(sub.endpoint)) continue;
			try {
				const last = await lastSentStart(db, sub.endpoint, reminder.playerId, reminder.matchId, reminder.role);
				const decision = resendDecision(last, reminder.start);
				if (decision === "skip") continue;
				const status = await send(sub, reminderPayload(snapshot, reminder, now, decision === "rescheduled"));
				if (isOk(status)) {
					await recordSent(db, sub.endpoint, reminder.playerId, reminder.matchId, reminder.role, reminder.start, now);
					result.sent++;
				} else if (isGone(status)) {
					await deleteSubscription(db, sub.endpoint);
					removed.add(sub.endpoint);
					result.removed++;
				} else {
					console.warn(`[reminders] push service answered ${status} for ${reminder.matchId}`);
					result.failed++;
				}
			} catch (error) {
				console.error(`[reminders] sending ${reminder.matchId} failed`, error);
				result.failed++;
			}
		}
	}
	return result;
}

/**
 * When a match is completed, tell the players and referees of the next match on that court that they're up.
 * Sent once per device, player and match (a later score change doesn't resend). Never throws.
 */
export async function notifyNextOnCourt(db: SqlDb, completedMatchId: string, now: Date, send: SendPush): Promise<RunResult> {
	const result: RunResult = { sent: 0, removed: 0, failed: 0 };
	try {
		const snapshot = await loadSnapshot(db);
		const next = nextOnCourt(snapshot, completedMatchId);
		if (!next) return result;
		const roles = matchRoles(snapshot, next.id);
		const subscriptions = await subscriptionsForPlayers(db, [...roles.keys()]);
		for (const sub of subscriptions) {
			const role = roles.get(sub.playerId);
			if (!role) continue;
			const kind = `next:${role}` as const;
			try {
				if (await lastSentStart(db, sub.endpoint, sub.playerId, next.id, kind)) continue;
				const status = await send(sub, nextUpPayload(snapshot, next.id, role));
				if (isOk(status)) {
					await recordSent(db, sub.endpoint, sub.playerId, next.id, kind, matchStart(next), now);
					result.sent++;
				} else if (isGone(status)) {
					await deleteSubscription(db, sub.endpoint);
					result.removed++;
				} else {
					result.failed++;
				}
			} catch (error) {
				console.error(`[next-on-court] sending ${next.id} failed`, error);
				result.failed++;
			}
		}
	} catch (error) {
		console.error("[next-on-court] failed", error);
	}
	return result;
}
