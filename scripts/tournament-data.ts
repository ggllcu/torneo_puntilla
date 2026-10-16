// The tournament as published by the organizers (spec §5). Source of truth: the schedule screenshots.
import type { Category, Day } from "../src/lib/types";

/** Teams per group, in seed order (A1, A2, A3…). Each team is [player1, player2]. */
export const TEAMS: Record<Category, Record<string, [string, string][]>> = {
	womens: {
		A: [["Ilaria", "Carlotta"], ["Laura M.", "Mona"], ["Martina", "Lucia"]],
		B: [["Eugenie", "Patricia C."], ["Patricia S.", "Agustina"], ["Cristina", "Marina"]],
		C: [["Emilija", "Sandra"], ["Janny", "Paula L."], ["Emi", "Megi"]],
	},
	mens: {
		A: [["Dani", "Mat"], ["Emilio", "Ilde"], ["Dubovs", "Saul"]],
		B: [["Moodou", "Adam"], ["Cesar", "Albi"], ["Marci", "Giando"]],
		C: [["Giulio", "Marco"], ["Sebas", "Kevin"], ["Gonzo", "Matteo"]],
		D: [["Luca", "Roberto"], ["Joaquin", "Jorge"], ["Javi", "Hector"]],
	},
	mixed: {
		A: [["Cesar", "Patricia C."], ["Viktor", "Silvia"], ["Saul", "Sara"]],
		B: [["Marci", "Ilaria"], ["Giando", "Mona"], ["Dani", "Laura P."]],
		C: [["Luca", "Daria"], ["Moodou", "Megi"], ["Adam", "Emi"]],
		D: [["Javi", "Laura M."], ["Albi", "Emilija"], ["Dubovs", "Paula G."]],
	},
};

/** Session start: UTC ISO (Atlantic/Canary is UTC+1 on 17–18 Oct 2026) and local "HH:MM" for titles. */
export const SESSIONS: Record<Category, Record<Day, { utc: string; local: string }>> = {
	womens: {
		saturday: { utc: "2026-10-17T08:00:00.000Z", local: "09:00" },
		sunday: { utc: "2026-10-18T12:30:00.000Z", local: "13:30" },
	},
	mens: {
		saturday: { utc: "2026-10-17T11:30:00.000Z", local: "12:30" },
		sunday: { utc: "2026-10-18T15:30:00.000Z", local: "16:30" },
	},
	mixed: {
		saturday: { utc: "2026-10-17T15:00:00.000Z", local: "16:00" },
		sunday: { utc: "2026-10-18T08:30:00.000Z", local: "09:30" },
	},
};

export const SLOT_MINUTES = 20;

/**
 * Saturday row: [slot, court, team1, team2, referee, phase?].
 * Codes: "A1" = team by seed; "3A" = placeholder "3rd Group A". Phase defaults to "group".
 */
export type SaturdayRow = [number, 1 | 2, string, string, string, ("repechage" | "playoff")?];

const MENS_MIXED_SATURDAY: SaturdayRow[] = [
	[1, 1, "A1", "A2", "B3"], [1, 2, "B1", "B2", "A3"],
	[2, 1, "C1", "C2", "D3"], [2, 2, "D1", "D2", "C3"],
	[3, 1, "A2", "A3", "B1"], [3, 2, "B2", "B3", "A1"],
	[4, 1, "C2", "C3", "D1"], [4, 2, "D2", "D3", "C1"],
	[5, 1, "A1", "A3", "B2"], [5, 2, "B1", "B3", "A2"],
	[6, 1, "C1", "C3", "D2"], [6, 2, "D1", "D3", "C2"],
	[7, 1, "2A", "3B", "1C", "playoff"], [7, 2, "2B", "3A", "1D", "playoff"],
	[8, 1, "2C", "3D", "1A", "playoff"], [8, 2, "3C", "2D", "1B", "playoff"],
];

export const SATURDAY: Record<Category, SaturdayRow[]> = {
	womens: [
		[1, 1, "A1", "A2", "B3"], [1, 2, "B1", "B2", "C3"],
		[2, 1, "C1", "C2", "A1"], [2, 2, "A2", "A3", "B1"],
		[3, 1, "B2", "B3", "C1"], [3, 2, "C2", "C3", "A2"],
		[4, 1, "A1", "A3", "B2"], [4, 2, "B1", "B3", "C2"],
		[5, 1, "C1", "C3", "A3"], [5, 2, "3A", "3B", "2A", "repechage"],
		[6, 1, "3C", "3A", "2B", "repechage"],
		[7, 1, "3B", "3C", "2C", "repechage"],
	],
	mens: MENS_MIXED_SATURDAY,
	mixed: MENS_MIXED_SATURDAY,
};

/** Quarterfinal pairings (spec §5.3), QF1..QF4. Labels are literal placeholder text or "1A"-style codes. */
export const QUARTERFINALS: Record<Category, [string, string][]> = {
	womens: [["1A", "2nd Repechage"], ["1B", "2C"], ["1C", "2A"], ["2B", "1st Repechage"]],
	mens: [["1A", "Winner PO4"], ["1B", "Winner PO3"], ["1C", "Winner PO2"], ["1D", "Winner PO1"]],
	mixed: [["1A", "Winner PO4"], ["1B", "Winner PO3"], ["1C", "Winner PO2"], ["1D", "Winner PO1"]],
};
