export type Category = "mens" | "womens" | "mixed";
export type Day = "saturday" | "sunday";
export type Phase =
	| "group"
	| "repechage"
	| "playoff"
	| "quarterfinal"
	| "semifinal"
	| "third_place"
	| "final";
export type Format = "single_21" | "best_of_3";
export type MatchState = "scheduled" | "finished";
export type SetScore = { team1: number; team2: number };
/** name e.g. "Laura M./Mona" */
export type TeamView = { id: string; seed: string; name: string };
export type Session = { startsAt: Date; slotMinutes: number };
export type MatchView = {
	id: string;
	category: Category;
	day: Day;
	phase: Phase;
	bracketCode: string | null;
	groupName: string | null;
	slot: number;
	court: 1 | 2;
	timeOverride: Date | null;
	team1: TeamView | null;
	team2: TeamView | null;
	referee: TeamView | null;
	team1Label: string;
	team2Label: string;
	refereeLabel: string;
	format: Format;
	sets: SetScore[];
	state: MatchState;
};
export type GroupView = { id: string; name: string; teams: TeamView[] };
