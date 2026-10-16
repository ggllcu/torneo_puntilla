import type { GroupView, MatchView, SetScore, TeamView } from "../src/lib/types";

export const team = (seed: string): TeamView => ({ id: `id-${seed}`, seed, name: `${seed} players` });

export const match = (overrides: Partial<MatchView> = {}): MatchView => ({
	id: "m",
	category: "mens",
	day: "saturday",
	phase: "group",
	bracketCode: null,
	groupName: "A",
	slot: 1,
	court: 1,
	timeOverride: null,
	team1: null,
	team2: null,
	referee: null,
	team1Label: "",
	team2Label: "",
	refereeLabel: "",
	format: "single_21",
	sets: [],
	state: "scheduled",
	...overrides,
});

/** A finished single-set match between two teams. */
export const played = (t1: TeamView, t2: TeamView, team1: number, team2: number, extra: Partial<MatchView> = {}) =>
	match({ id: `${t1.seed}-${t2.seed}`, team1: t1, team2: t2, sets: [{ team1, team2 }], state: "finished", ...extra });

export const group = (name: string, teams: TeamView[]): GroupView => ({ id: `g-${name}`, name, teams });

export const sets = (...pairs: [number, number][]): SetScore[] => pairs.map(([team1, team2]) => ({ team1, team2 }));
