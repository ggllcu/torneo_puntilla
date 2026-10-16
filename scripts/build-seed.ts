// Builds seed/seed.json (emdash schema + all tournament content) from tournament-data.ts.
// Run with: npm run seed:build
import { writeFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import type { Category, Day, Format, Phase } from "../src/lib/types";
import {
	QUARTERFINALS,
	SATURDAY,
	SESSIONS,
	SLOT_MINUTES,
	TEAMS,
	type SaturdayRow,
} from "./tournament-data";

type Field = {
	slug: string;
	label: string;
	type: string;
	required?: boolean;
	validation?: Record<string, unknown>;
};
type Collection = {
	slug: string;
	label: string;
	labelSingular: string;
	routable: false;
	supports: [];
	titleField: "title";
	fields: Field[];
};
type Entry = { id: string; status: "published"; data: Record<string, any> };
export type Seed = {
	$schema: string;
	version: "1";
	meta: { name: string; description: string; author: string };
	settings: Record<string, string>;
	collections: Collection[];
	content: Record<"players" | "teams" | "groups" | "sessions" | "matches", Entry[]>;
};

const CATEGORIES: Category[] = ["womens", "mens", "mixed"];
const CATEGORY_LABEL: Record<Category, string> = { mens: "Men's", womens: "Women's", mixed: "Mixed" };
const DAY_SHORT: Record<Day, string> = { saturday: "Sat", sunday: "Sun" };
const ORDINAL: Record<string, string> = { "1": "1st", "2": "2nd", "3": "3rd" };

const str = (slug: string, label: string): Field => ({ slug, label, type: "string" });
const int = (slug: string, label: string): Field => ({ slug, label, type: "integer" });
const select = (slug: string, label: string, options: string[]): Field => ({
	slug,
	label,
	type: "select",
	validation: { options },
});
const ref = (slug: string, label: string, targetCollection: string, multiple = false): Field => ({
	slug,
	label,
	type: "reference",
	validation: multiple ? { targetCollection, multiple: true } : { targetCollection },
});
const collection = (slug: string, label: string, labelSingular: string, fields: Field[]): Collection => ({
	slug,
	label,
	labelSingular,
	routable: false,
	supports: [],
	titleField: "title",
	fields: [{ slug: "title", label: "Title", type: "string", required: true }, ...fields],
});

const categoryField = () => select("category", "Category", CATEGORIES);
const dayField = () => select("day", "Day", ["saturday", "sunday"]);

const COLLECTIONS: Collection[] = [
	{ ...collection("players", "Players", "Player", []), titleField: "title" },
	collection("teams", "Teams", "Team", [
		categoryField(),
		str("seed", "Seed (e.g. A1)"),
		str("name", "Display name"),
		ref("players", "Players", "players", true),
	]),
	collection("groups", "Groups", "Group", [
		categoryField(),
		str("name", "Name (A–D or Repechage)"),
		ref("teams", "Teams", "teams", true),
	]),
	collection("sessions", "Sessions", "Session", [
		categoryField(),
		dayField(),
		{ slug: "starts_at", label: "Starts at", type: "datetime" },
		int("slot_minutes", "Minutes per slot"),
	]),
	collection("matches", "Matches", "Match", [
		categoryField(),
		dayField(),
		select("phase", "Phase", [
			"group",
			"repechage",
			"playoff",
			"quarterfinal",
			"semifinal",
			"third_place",
			"final",
		]),
		str("bracket_code", "Bracket code (PO1, QF1, SF1, 3RD, FINAL)"),
		ref("group", "Group", "groups"),
		int("slot", "Slot (order in session)"),
		int("court", "Court"),
		{ slug: "time_override", label: "Time override", type: "datetime" },
		ref("team1", "Team 1", "teams"),
		ref("team2", "Team 2", "teams"),
		ref("referee", "Referee team", "teams"),
		str("team1_label", "Team 1 placeholder"),
		str("team2_label", "Team 2 placeholder"),
		str("referee_label", "Referee placeholder"),
		select("format", "Format", ["single_21", "best_of_3"]),
		{
			slug: "sets",
			label: "Sets",
			type: "repeater",
			validation: {
				subFields: [
					{ slug: "team1", label: "Team 1", type: "integer" },
					{ slug: "team2", label: "Team 2", type: "integer" },
				],
			},
		},
		select("match_state", "State", ["scheduled", "finished"]),
	]),
];
// players has a `name` field in addition to title
COLLECTIONS[0].fields.push(str("name", "Name"));

const kebab = (s: string) =>
	s
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-|-$/g, "");
const playerId = (name: string) => `p-${kebab(name)}`;
const teamId = (cat: Category, seed: string) => `t-${cat}-${seed}`;
const groupId = (cat: Category, name: string) => `g-${cat}-${name.toLowerCase()}`;
const sessionId = (cat: Category, day: Day) => `s-${cat}-${day}`;
const matchId = (cat: Category, day: Day, slot: number, court: number) => `m-${cat}-${day}-${slot}-${court}`;
const $ref = (id: string) => `$ref:${id}`;

const isSeed = (code: string) => /^[A-D][1-3]$/.test(code);

/** "A1" stays "A1"; "3A" → "3rd Group A"; anything else is literal placeholder text. */
function label(code: string): string {
	const m = /^([123])([A-D])$/.exec(code);
	return m ? `${ORDINAL[m[1]]} Group ${m[2]}` : code;
}

function localTime(start: string, slot: number): string {
	const [h, m] = start.split(":").map(Number);
	const total = h * 60 + m + (slot - 1) * SLOT_MINUTES;
	return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

const published = (id: string, data: Record<string, any>): Entry => ({ id, status: "published", data });

type MatchSpec = {
	cat: Category;
	day: Day;
	slot: number;
	court: 1 | 2;
	phase: Phase;
	format: Format;
	bracketCode?: string;
	group?: string;
	team1: string;
	team2: string;
	referee: string;
};

function matchEntry(s: MatchSpec): Entry {
	const [l1, l2, lr] = [label(s.team1), label(s.team2), label(s.referee)];
	const time = localTime(SESSIONS[s.cat][s.day].local, s.slot);
	const prefix = s.bracketCode ? `${s.bracketCode}: ` : "";
	const data: Record<string, any> = {
		title: `${CATEGORY_LABEL[s.cat]} ${DAY_SHORT[s.day]} ${time} · C${s.court} · ${prefix}${l1} v ${l2}`,
		category: s.cat,
		day: s.day,
		phase: s.phase,
		bracket_code: s.bracketCode,
		group: s.group ? $ref(s.group) : undefined,
		slot: s.slot,
		court: s.court,
		team1: isSeed(s.team1) ? $ref(teamId(s.cat, s.team1)) : undefined,
		team2: isSeed(s.team2) ? $ref(teamId(s.cat, s.team2)) : undefined,
		referee: isSeed(s.referee) ? $ref(teamId(s.cat, s.referee)) : undefined,
		team1_label: l1,
		team2_label: l2,
		referee_label: lr,
		format: s.format,
		sets: [],
		match_state: "scheduled",
	};
	for (const k of Object.keys(data)) if (data[k] === undefined) delete data[k];
	return published(matchId(s.cat, s.day, s.slot, s.court), data);
}

function saturdayMatches(cat: Category): Entry[] {
	let playoff = 0;
	return SATURDAY[cat].map(([slot, court, team1, team2, referee, phase = "group"]: SaturdayRow) => {
		const bracketCode = phase === "playoff" ? `PO${++playoff}` : undefined;
		const group =
			phase === "group"
				? groupId(cat, team1[0])
				: phase === "repechage"
					? groupId(cat, "Repechage")
					: undefined;
		return matchEntry({ cat, day: "saturday", slot, court, phase, format: "single_21", bracketCode, group, team1, team2, referee });
	});
}

function sundayMatches(cat: Category): Entry[] {
	const qf = QUARTERFINALS[cat];
	const rows: [number, 1 | 2, Phase, string, string, string][] = [
		[1, 1, "quarterfinal", "QF1", ...qf[0]],
		[1, 2, "quarterfinal", "QF2", ...qf[1]],
		[2, 1, "quarterfinal", "QF3", ...qf[2]],
		[2, 2, "quarterfinal", "QF4", ...qf[3]],
		[3, 1, "semifinal", "SF1", "Winner QF1", "Winner QF2"],
		[3, 2, "semifinal", "SF2", "Winner QF3", "Winner QF4"],
		[4, 1, "final", "FINAL", "Winner SF1", "Winner SF2"],
		[4, 2, "third_place", "3RD", "Loser SF1", "Loser SF2"],
	];
	return rows.map(([slot, court, phase, bracketCode, team1, team2]) =>
		matchEntry({
			cat,
			day: "sunday",
			slot,
			court,
			phase,
			format: phase === "final" ? "best_of_3" : "single_21",
			bracketCode,
			team1,
			team2,
			referee: "TBD",
		}),
	);
}

export function buildSeed(): Seed {
	const players = new Map<string, Entry>();
	const teams: Entry[] = [];
	const groups: Entry[] = [];
	const sessions: Entry[] = [];
	const matches: Entry[] = [];

	for (const cat of CATEGORIES) {
		for (const [letter, groupTeams] of Object.entries(TEAMS[cat])) {
			const ids = groupTeams.map(([p1, p2], i) => {
				const seed = `${letter}${i + 1}`;
				for (const name of [p1, p2])
					if (!players.has(name)) players.set(name, published(playerId(name), { title: name, name }));
				const name = `${p1}/${p2}`;
				teams.push(
					published(teamId(cat, seed), {
						title: `${CATEGORY_LABEL[cat]} ${seed} ${name}`,
						category: cat,
						seed,
						name,
						players: [$ref(playerId(p1)), $ref(playerId(p2))],
					}),
				);
				return teamId(cat, seed);
			});
			groups.push(
				published(groupId(cat, letter), {
					title: `${CATEGORY_LABEL[cat]} Group ${letter}`,
					category: cat,
					name: letter,
					teams: ids.map($ref),
				}),
			);
		}
		if (cat === "womens")
			groups.push(
				published(groupId(cat, "Repechage"), {
					title: `${CATEGORY_LABEL[cat]} Repechage`,
					category: cat,
					name: "Repechage",
				}),
			);
		for (const day of ["saturday", "sunday"] as Day[])
			sessions.push(
				published(sessionId(cat, day), {
					title: `${CATEGORY_LABEL[cat]} ${day === "saturday" ? "Saturday" : "Sunday"}`,
					category: cat,
					day,
					starts_at: SESSIONS[cat][day].utc,
					slot_minutes: SLOT_MINUTES,
				}),
			);
		matches.push(...saturdayMatches(cat), ...sundayMatches(cat));
	}

	return {
		$schema: "https://emdashcms.com/seed.schema.json",
		version: "1",
		meta: {
			name: "La Puntilla Beach Volley",
			description: "Teams, groups and schedule of the La Puntilla beach volleyball tournament",
			author: "La Puntilla",
		},
		settings: { title: "La Puntilla Beach Volley", tagline: "Tournament calendar", timezone: "Atlantic/Canary" },
		collections: COLLECTIONS,
		content: { players: [...players.values()], teams, groups, sessions, matches },
	};
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
	const out = fileURLToPath(new URL("../seed/seed.json", import.meta.url));
	writeFileSync(out, JSON.stringify(buildSeed(), null, "\t") + "\n");
	console.log(`wrote ${out}`);
}
