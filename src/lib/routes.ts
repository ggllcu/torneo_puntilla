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
