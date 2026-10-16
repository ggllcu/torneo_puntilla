import type { Category, Day } from "./types";

export type Tab = "qualifiers" | "finals";

const CATEGORIES: readonly string[] = ["mens", "womens", "mixed"];
const TAB_DAY: Record<Tab, Day> = { qualifiers: "saturday", finals: "sunday" };

/** `/{category}/{tab}` → what to load, or null for a 404. */
export function parseCalendarRoute(
	category: string | undefined,
	tab: string | undefined,
): { category: Category; tab: Tab; day: Day } | null {
	if (!category || !tab || !CATEGORIES.includes(category) || !Object.hasOwn(TAB_DAY, tab)) return null;
	return { category: category as Category, tab: tab as Tab, day: TAB_DAY[tab as Tab] };
}

export function calendarPath(category: Category, day: Day): string {
	return `/${category}/${day === "saturday" ? "qualifiers" : "finals"}`;
}

/** Sunday 18 Oct 2026, 00:00 in Atlantic/Canary (UTC+1). */
const FINALS_DAY_START = Date.parse("2026-10-17T23:00:00Z");

/** The tab worth opening right now: Qualifiers until Saturday ends, Finals from Sunday. */
export function defaultTab(now: Date): Tab {
	return now.getTime() >= FINALS_DAY_START ? "finals" : "qualifiers";
}

/** A same-site path to go back to after choosing a player, or null (other sites, Settings itself, junk). */
export function safeReturnPath(from: string | null): string | null {
	if (!from || !from.startsWith("/") || from.startsWith("//") || from.includes("\\")) return null;
	if (from === "/settings" || from.startsWith("/settings?") || from.startsWith("/settings#")) return null;
	return from;
}
