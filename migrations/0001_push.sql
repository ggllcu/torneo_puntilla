-- Push notifications (spec: pwa-notifications §5.1). Our own tables; emdash's are ec_* and _emdash_*.
CREATE TABLE IF NOT EXISTS push_subscriptions (
	endpoint TEXT PRIMARY KEY,
	p256dh TEXT NOT NULL,
	auth TEXT NOT NULL,
	player_id TEXT NOT NULL,
	created_at TEXT NOT NULL,
	updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS push_subscriptions_player ON push_subscriptions (player_id);

CREATE TABLE IF NOT EXISTS push_sent (
	endpoint TEXT NOT NULL,
	player_id TEXT NOT NULL,
	match_id TEXT NOT NULL,
	role TEXT NOT NULL,
	match_start TEXT NOT NULL,
	sent_at TEXT NOT NULL,
	PRIMARY KEY (endpoint, player_id, match_id, role, match_start)
);
