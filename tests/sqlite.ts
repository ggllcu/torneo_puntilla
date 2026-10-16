// Test-only: an in-memory SQLite SqlDb plus a minimal copy of the emdash tables the snapshot loader reads.
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import type { SqlDb } from "../src/lib/push-db";

export function sqliteDb(): SqlDb & { exec(sql: string): void } {
	const db = new DatabaseSync(":memory:");
	return {
		async all<T>(sql: string, ...params: unknown[]) {
			return db.prepare(sql).all(...(params as never[])) as T[];
		},
		async run(sql: string, ...params: unknown[]) {
			db.prepare(sql).run(...(params as never[]));
		},
		exec: (sql: string) => db.exec(sql),
	};
}

const REL = { team1: "r-t1", team2: "r-t2", referee: "r-ref", players: "r-tp" };

/** Men's Saturday session 11:30Z; m1 = A1 Dani/Mat v A2 Emilio/Ilde, ref B3 Marci/Giando; plus rows the loader must skip. */
export function seedEmdashFixture(db: ReturnType<typeof sqliteDb>) {
	db.exec(`
		CREATE TABLE ec_matches (id TEXT PRIMARY KEY, status TEXT, deleted_at TEXT, category TEXT, day TEXT, slot INTEGER,
			court INTEGER, time_override TEXT, match_state TEXT, team1_label TEXT, team2_label TEXT);
		CREATE TABLE ec_sessions (id TEXT PRIMARY KEY, status TEXT, deleted_at TEXT, category TEXT, day TEXT, starts_at TEXT, slot_minutes INTEGER);
		CREATE TABLE ec_teams (id TEXT PRIMARY KEY, status TEXT, deleted_at TEXT, seed TEXT, name TEXT);
		CREATE TABLE ec_players (id TEXT PRIMARY KEY, status TEXT, deleted_at TEXT, name TEXT);
		CREATE TABLE _emdash_relations (id TEXT PRIMARY KEY, slug TEXT);
		CREATE TABLE _emdash_content_references (id TEXT PRIMARY KEY, relation_id TEXT, parent_group TEXT, child_group TEXT, sort_order INTEGER);

		INSERT INTO _emdash_relations VALUES ('${REL.team1}','matches_team1'), ('${REL.team2}','matches_team2'),
			('${REL.referee}','matches_referee'), ('${REL.players}','teams_players'), ('r-other','matches_group');

		INSERT INTO ec_sessions VALUES ('s-mens-saturday','published',NULL,'mens','saturday','2026-10-17T11:30:00.000Z',20);
		INSERT INTO ec_sessions VALUES ('s-old','published','2026-10-01T00:00:00Z','mens','saturday','2026-10-17T05:00:00.000Z',20);

		INSERT INTO ec_players VALUES ('p-dani','published',NULL,'Dani'), ('p-mat','published',NULL,'Mat'),
			('p-emilio','published',NULL,'Emilio'), ('p-ilde','published',NULL,'Ilde'),
			('p-marci','published',NULL,'Marci'), ('p-giando','published',NULL,'Giando'),
			('p-gone','published','2026-10-01T00:00:00Z','Gone'), ('p-draft','draft',NULL,'Draft');

		INSERT INTO ec_teams VALUES ('tA1','published',NULL,'A1','Dani/Mat'), ('tA2','published',NULL,'A2','Emilio/Ilde'),
			('tB3','published',NULL,'B3','Marci/Giando'), ('t-empty','published',NULL,'C1','Nobody');

		INSERT INTO ec_matches VALUES ('m1','published',NULL,'mens','saturday',1,1,NULL,'scheduled','A1','A2');
		INSERT INTO ec_matches VALUES ('m-del','published','2026-10-01T00:00:00Z','mens','saturday',2,1,NULL,'scheduled','A1','A2');
		INSERT INTO ec_matches VALUES ('m-draft','draft',NULL,'mens','saturday',3,1,NULL,'scheduled','A1','A2');
		INSERT INTO ec_matches VALUES ('m-nosession','published',NULL,'mixed','saturday',1,1,NULL,'scheduled','A1','A2');

		INSERT INTO _emdash_content_references VALUES
			('x1','${REL.team1}','m1','tA1',0), ('x2','${REL.team2}','m1','tA2',0), ('x3','${REL.referee}','m1','tB3',0),
			('x4','${REL.players}','tA1','p-mat',1), ('x5','${REL.players}','tA1','p-dani',0),
			('x6','${REL.players}','tA2','p-emilio',0), ('x7','${REL.players}','tA2','p-ilde',1),
			('x8','${REL.players}','tB3','p-marci',0), ('x9','${REL.players}','tB3','p-giando',1),
			('x10','${REL.team1}','m-del','tA1',0), ('x11','r-other','m1','g-mens-a',0);
	`);
	db.exec(readFileSync("migrations/0001_push.sql", "utf8"));
}
