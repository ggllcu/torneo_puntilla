// D1 access for push notifications: our push_* tables, plus a read-only snapshot of the tournament from emdash's
// tables (the emdash query API needs a request context, which the scheduled handler doesn't have).
import type { Role, Snapshot, SnapshotMatch, SnapshotTeam } from "./reminders";

export interface SqlDb {
	all<T>(sql: string, ...params: unknown[]): Promise<T[]>;
	run(sql: string, ...params: unknown[]): Promise<void>;
}

export function d1(db: D1Database): SqlDb {
	return {
		async all<T>(sql: string, ...params: unknown[]) {
			return (await db.prepare(sql).bind(...params).all<T>()).results;
		},
		async run(sql: string, ...params: unknown[]) {
			await db.prepare(sql).bind(...params).run();
		},
	};
}

export type StoredSubscription = { endpoint: string; p256dh: string; auth: string; playerId: string };

const LIVE = "status = 'published' AND deleted_at IS NULL";

export async function loadSnapshot(db: SqlDb): Promise<Snapshot> {
	const [matchRows, teamRows, links] = await Promise.all([
		db.all<{
			id: string;
			category: SnapshotMatch["category"];
			day: SnapshotMatch["day"];
			slot: number;
			court: number;
			time_override: string | null;
			match_state: string | null;
			team1_label: string | null;
			team2_label: string | null;
			starts_at: string;
			slot_minutes: number | null;
		}>(
			`SELECT m.id, m.category, m.day, m.slot, m.court, m.time_override, m.match_state, m.team1_label, m.team2_label,
				s.starts_at, s.slot_minutes
			FROM ec_matches m
			JOIN ec_sessions s ON s.category = m.category AND s.day = m.day
				AND s.status = 'published' AND s.deleted_at IS NULL
			WHERE m.status = 'published' AND m.deleted_at IS NULL
			ORDER BY m.id`,
		),
		db.all<{ id: string; seed: string | null; name: string | null }>(
			`SELECT id, seed, name FROM ec_teams WHERE ${LIVE}`,
		),
		db.all<{ slug: string; parent: string; child: string }>(
			`SELECT r.slug, c.parent_group AS parent, c.child_group AS child
			FROM _emdash_content_references c
			JOIN _emdash_relations r ON r.id = c.relation_id
			WHERE r.slug IN ('matches_team1', 'matches_team2', 'matches_referee', 'teams_players')
				AND (r.slug <> 'teams_players' OR c.child_group IN (SELECT id FROM ec_players WHERE ${LIVE}))
			ORDER BY c.sort_order, c.id`,
		),
	]);

	const linked = (slug: string, parent: string) => links.find((l) => l.slug === slug && l.parent === parent)?.child ?? null;

	const teams = new Map<string, SnapshotTeam>(
		teamRows.map((t) => [
			t.id,
			{
				id: t.id,
				seed: t.seed ?? "",
				name: t.name ?? "",
				playerIds: links.filter((l) => l.slug === "teams_players" && l.parent === t.id).map((l) => l.child),
			},
		]),
	);

	const seen = new Set<string>();
	const matches: SnapshotMatch[] = [];
	for (const m of matchRows) {
		if (seen.has(m.id)) continue; // more than one session for a category/day: keep the first
		seen.add(m.id);
		matches.push({
			id: m.id,
			category: m.category,
			day: m.day,
			slot: Number(m.slot) || 1,
			court: Number(m.court) === 2 ? 2 : 1,
			timeOverride: m.time_override ? new Date(m.time_override) : null,
			finished: m.match_state === "finished",
			sessionStart: new Date(m.starts_at),
			slotMinutes: Number(m.slot_minutes) || 20,
			team1Id: linked("matches_team1", m.id),
			team2Id: linked("matches_team2", m.id),
			refereeId: linked("matches_referee", m.id),
			team1Label: m.team1_label ?? "",
			team2Label: m.team2_label ?? "",
		});
	}
	return { matches, teams };
}

export async function loadPlayers(db: SqlDb): Promise<{ id: string; name: string }[]> {
	return db.all(`SELECT id, name FROM ec_players WHERE ${LIVE} ORDER BY name COLLATE NOCASE, id`);
}

export async function playerExists(db: SqlDb, id: string): Promise<boolean> {
	return (await db.all(`SELECT 1 FROM ec_players WHERE id = ? AND ${LIVE}`, id)).length > 0;
}

type SubscriptionRow = { endpoint: string; p256dh: string; auth: string; player_id: string };
const toSubscription = (r: SubscriptionRow): StoredSubscription => ({
	endpoint: r.endpoint,
	p256dh: r.p256dh,
	auth: r.auth,
	playerId: r.player_id,
});

export async function upsertSubscription(db: SqlDb, s: StoredSubscription, now: Date): Promise<void> {
	await db.run(
		`INSERT INTO push_subscriptions (endpoint, p256dh, auth, player_id, created_at, updated_at)
		VALUES (?, ?, ?, ?, ?, ?)
		ON CONFLICT (endpoint) DO UPDATE SET p256dh = excluded.p256dh, auth = excluded.auth,
			player_id = excluded.player_id, updated_at = excluded.updated_at`,
		s.endpoint,
		s.p256dh,
		s.auth,
		s.playerId,
		now.toISOString(),
		now.toISOString(),
	);
}

export async function deleteSubscription(db: SqlDb, endpoint: string): Promise<void> {
	await db.run(`DELETE FROM push_sent WHERE endpoint = ?`, endpoint);
	await db.run(`DELETE FROM push_subscriptions WHERE endpoint = ?`, endpoint);
}

export async function getSubscription(db: SqlDb, endpoint: string): Promise<StoredSubscription | null> {
	const [row] = await db.all<SubscriptionRow>(
		`SELECT endpoint, p256dh, auth, player_id FROM push_subscriptions WHERE endpoint = ?`,
		endpoint,
	);
	return row ? toSubscription(row) : null;
}

export async function subscriptionsForPlayers(db: SqlDb, playerIds: string[]): Promise<StoredSubscription[]> {
	if (playerIds.length === 0) return [];
	const rows = await db.all<SubscriptionRow>(
		`SELECT endpoint, p256dh, auth, player_id FROM push_subscriptions
		WHERE player_id IN (${playerIds.map(() => "?").join(", ")}) ORDER BY endpoint`,
		...playerIds,
	);
	return rows.map(toSubscription);
}

export async function lastSentStart(
	db: SqlDb,
	endpoint: string,
	playerId: string,
	matchId: string,
	role: Role,
): Promise<Date | null> {
	const [row] = await db.all<{ match_start: string }>(
		`SELECT match_start FROM push_sent WHERE endpoint = ? AND player_id = ? AND match_id = ? AND role = ?
		ORDER BY sent_at DESC LIMIT 1`,
		endpoint,
		playerId,
		matchId,
		role,
	);
	return row ? new Date(row.match_start) : null;
}

export async function recordSent(
	db: SqlDb,
	endpoint: string,
	playerId: string,
	matchId: string,
	role: Role,
	matchStart: Date,
	now: Date,
): Promise<void> {
	await db.run(
		`INSERT OR REPLACE INTO push_sent (endpoint, player_id, match_id, role, match_start, sent_at) VALUES (?, ?, ?, ?, ?, ?)`,
		endpoint,
		playerId,
		matchId,
		role,
		matchStart.toISOString(),
		now.toISOString(),
	);
}
