// Group standings: wins → point difference → head-to-head (two-way ties only) → points for → seed.
import { winnerOf } from "./display";
import type { GroupView, MatchView, TeamView } from "./types";

export type StandingRow = {
	team: TeamView;
	played: number;
	won: number;
	lost: number;
	pointsFor: number;
	pointsAgainst: number;
	diff: number;
};

export function computeStandings(group: GroupView, matches: MatchView[]): StandingRow[] {
	const inGroup = new Set(group.teams.map((t) => t.id));
	const counted = matches.filter(
		(m) =>
			m.state === "finished" &&
			m.team1 &&
			m.team2 &&
			inGroup.has(m.team1.id) &&
			inGroup.has(m.team2.id) &&
			winnerOf(m.sets) !== null,
	);

	const rows = new Map<string, StandingRow>(
		group.teams.map((team) => [
			team.id,
			{ team, played: 0, won: 0, lost: 0, pointsFor: 0, pointsAgainst: 0, diff: 0 },
		]),
	);
	for (const m of counted) {
		const winner = winnerOf(m.sets);
		const sides = [
			{ row: rows.get(m.team1!.id)!, own: "team1", other: "team2", side: 1 },
			{ row: rows.get(m.team2!.id)!, own: "team2", other: "team1", side: 2 },
		] as const;
		for (const { row, own, other, side } of sides) {
			row.played++;
			if (winner === side) row.won++;
			else row.lost++;
			for (const set of m.sets) {
				row.pointsFor += set[own];
				row.pointsAgainst += set[other];
			}
			row.diff = row.pointsFor - row.pointsAgainst;
		}
	}

	const list = [...rows.values()];
	const tieKey = (r: StandingRow) => `${r.won}/${r.diff}`;
	const tieSize = (r: StandingRow) => list.filter((x) => tieKey(x) === tieKey(r)).length;

	/** Negative when a beat b in their direct match. */
	function headToHead(a: StandingRow, b: StandingRow): number {
		const direct = counted.find(
			(m) =>
				(m.team1!.id === a.team.id && m.team2!.id === b.team.id) ||
				(m.team1!.id === b.team.id && m.team2!.id === a.team.id),
		);
		if (!direct) return 0;
		const aSide = direct.team1!.id === a.team.id ? 1 : 2;
		return winnerOf(direct.sets) === aSide ? -1 : 1;
	}

	return list.sort(
		(a, b) =>
			b.won - a.won ||
			b.diff - a.diff ||
			(tieSize(a) === 2 ? headToHead(a, b) : 0) ||
			b.pointsFor - a.pointsFor ||
			a.team.seed.localeCompare(b.team.seed),
	);
}
