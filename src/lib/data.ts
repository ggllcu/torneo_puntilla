// The only module that talks to emdash. Maps CMS entries to the domain types in ./types.
// Reference fields can't be bulk-loaded or filtered, so each match's teams are fetched per entry, in parallel.
import { ContentRepository, getEmDashCollection, getEmDashEntry } from "emdash";
import { getDb } from "emdash/runtime";
import { orderGroups } from "./standings";
import type { Category, Day, GroupView, MatchView, Session, SetScore, TeamView } from "./types";

type Ref = { entries: { id: string; data: Record<string, any> }[] } | undefined;

const toTeam = (ref: Ref): TeamView | null => {
	const e = ref?.entries[0];
	return e ? { id: e.data.id ?? e.id, seed: e.data.seed ?? "", name: e.data.name ?? e.data.title ?? "" } : null;
};

const toDate = (v: unknown): Date | null => (v ? new Date(v as string) : null);

const toSets = (v: unknown): SetScore[] =>
	Array.isArray(v) ? v.map((s) => ({ team1: Number(s?.team1 ?? 0), team2: Number(s?.team2 ?? 0) })) : [];

async function loadMatchEntry(id: string): Promise<MatchView | null> {
	const { entry, error } = await getEmDashEntry("matches", id, {
		references: { team1: true, team2: true, referee: true, group: true },
	});
	if (error) throw error;
	if (!entry) return null;
	const d = entry.data as Record<string, any>;
	const refs = (entry.references ?? {}) as Record<string, Ref>;
	return {
		id: d.id ?? entry.id,
		category: d.category,
		day: d.day,
		phase: d.phase,
		bracketCode: d.bracket_code || null,
		groupName: refs.group?.entries[0]?.data.name ?? null,
		slot: Number(d.slot ?? 1),
		court: Number(d.court) === 2 ? 2 : 1,
		timeOverride: toDate(d.time_override),
		team1: toTeam(refs.team1),
		team2: toTeam(refs.team2),
		referee: toTeam(refs.referee),
		team1Label: d.team1_label ?? "",
		team2Label: d.team2_label ?? "",
		refereeLabel: d.referee_label ?? "",
		format: d.format === "best_of_3" ? "best_of_3" : "single_21",
		sets: toSets(d.sets),
		state: d.match_state === "finished" ? "finished" : "scheduled",
	};
}

export async function loadSession(category: Category, day: Day): Promise<Session> {
	const { entries, error } = await getEmDashCollection("sessions", { where: { category, day } });
	if (error) throw error;
	const d = entries[0]?.data as Record<string, any> | undefined;
	if (!d) throw new Error(`No session for ${category} ${day}`);
	return { startsAt: new Date(d.starts_at), slotMinutes: Number(d.slot_minutes) || 20 };
}

export async function loadMatches(category: Category, day: Day): Promise<MatchView[]> {
	const { entries, error } = await getEmDashCollection("matches", { where: { category, day } });
	if (error) throw error;
	const matches = await Promise.all(entries.map((e) => loadMatchEntry((e.data as any).id ?? e.id)));
	return matches.filter((m): m is MatchView => m !== null);
}

export function loadMatch(id: string): Promise<MatchView | null> {
	return loadMatchEntry(id);
}

export async function loadGroups(category: Category): Promise<GroupView[]> {
	const { entries, error } = await getEmDashCollection("groups", { where: { category } });
	if (error) throw error;
	const groups = await Promise.all(
		entries.map(async (e) => {
			const id = (e.data as any).id ?? e.id;
			const { entry } = await getEmDashEntry("groups", id, { references: { teams: { limit: 10 } } });
			const teams = ((entry?.references as any)?.teams?.entries ?? []).map((t: any) =>
				toTeam({ entries: [t] }),
			) as TeamView[];
			return { id, name: String((e.data as any).name ?? ""), teams };
		}),
	);
	return orderGroups(groups);
}

export async function saveResult(id: string, sets: SetScore[]): Promise<void> {
	const repo = new ContentRepository(await getDb());
	await repo.update("matches", id, { data: { sets, match_state: "finished" } });
}
