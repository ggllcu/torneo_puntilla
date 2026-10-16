import type { Category, MatchView, SetScore } from "./types";

export const CATEGORY_LABEL: Record<Category, string> = { mens: "Men's", womens: "Women's", mixed: "Mixed" };

function setsWon(sets: SetScore[]) {
	return {
		team1: sets.filter((s) => s.team1 > s.team2).length,
		team2: sets.filter((s) => s.team2 > s.team1).length,
	};
}

/** Works on any numbers the admin enters: more sets won wins; equal → no winner. */
export function winnerOf(sets: SetScore[]): 1 | 2 | null {
	const won = setsWon(sets);
	return won.team1 > won.team2 ? 1 : won.team2 > won.team1 ? 2 : null;
}

export function formatScore(sets: SetScore[]): string {
	const each = sets.map((s) => `${s.team1}–${s.team2}`);
	if (sets.length <= 1) return each.join("");
	const won = setsWon(sets);
	return `${won.team1}–${won.team2} (${each.join(", ")})`;
}

const bracketNumber = (m: MatchView) => m.bracketCode?.replace(/\D/g, "") ?? "";

export function roundLabel(m: MatchView): string {
	switch (m.phase) {
		case "group":
			return `Group ${m.groupName ?? ""}`.trim();
		case "repechage":
			return "Repechage";
		case "playoff":
			return `Playoff ${bracketNumber(m)}`.trim();
		case "quarterfinal":
			return `Quarterfinal ${bracketNumber(m)}`.trim();
		case "semifinal":
			return `Semifinal ${bracketNumber(m)}`.trim();
		case "third_place":
			return "3rd place";
		case "final":
			return "Final";
	}
}
