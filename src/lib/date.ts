import { z } from "zod";

export const WEEKDAYS = [
	"Sunday",
	"Monday",
	"Tuesday",
	"Wednesday",
	"Thursday",
	"Friday",
	"Saturday",
] as const;

export type WeekdayName = (typeof WEEKDAYS)[number];

const WORKWEEK_DAYS = [
	{ offset: 0, shortLabel: "Mon", dayName: "Monday" },
	{ offset: 1, shortLabel: "Tue", dayName: "Tuesday" },
	{ offset: 2, shortLabel: "Wed", dayName: "Wednesday" },
	{ offset: 3, shortLabel: "Thu", dayName: "Thursday" },
	{ offset: 4, shortLabel: "Fri", dayName: "Friday" },
] as const satisfies ReadonlyArray<{
	offset: number;
	shortLabel: string;
	dayName: WeekdayName;
}>;

/**
 * Parses a `YYYY-MM-DD` string into a local-timezone `Date` at midnight,
 * returning `null` if the format or calendar day is invalid (e.g. `2026-02-31`).
 */
export function parseSessionDate(value: string): Date | null {
	const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
	if (!match) return null;

	const year = Number(match[1]);
	const month = Number(match[2]);
	const day = Number(match[3]);

	const date = new Date(year, month - 1, day);
	if (
		date.getFullYear() !== year ||
		date.getMonth() !== month - 1 ||
		date.getDate() !== day
	) {
		return null;
	}

	return date;
}

/** Formats a local `Date` instance as `YYYY-MM-DD`. */
export function formatSessionDate(date: Date): string {
	const year = date.getFullYear();
	const month = String(date.getMonth() + 1).padStart(2, "0");
	const day = String(date.getDate()).padStart(2, "0");
	return `${year}-${month}-${day}`;
}

/** Today's date (`YYYY-MM-DD`) in the local timezone. */
export function todaySessionDate(now = new Date()): string {
	return formatSessionDate(now);
}

/** Schema validating a real calendar date in `YYYY-MM-DD` format. */
export const sessionDateSchema = z
	.string()
	.trim()
	.regex(/^\d{4}-\d{2}-\d{2}$/, "Date must use YYYY-MM-DD format")
	.refine((value) => parseSessionDate(value) !== null, {
		message: "Invalid calendar date",
	});

/** Resolves the English weekday name (`"Sunday"`–`"Saturday"`) for a `YYYY-MM-DD` string. */
export function dayOfWeekFromSessionDate(value: string): WeekdayName {
	const parsed = parseSessionDate(value) ?? new Date();
	return WEEKDAYS[parsed.getDay()] ?? "Monday";
}

const fullDateFormatter = new Intl.DateTimeFormat("en-US", {
	weekday: "short",
	month: "short",
	day: "numeric",
	year: "numeric",
});

const compactDateFormatter = new Intl.DateTimeFormat("en-US", {
	weekday: "short",
	month: "short",
	day: "numeric",
});

/** Formats a `YYYY-MM-DD` string as e.g. `"Wed, Oct 28, 2026"`. */
export function formatDisplayDate(
	value: string,
	options?: { includeYear?: boolean },
): string {
	const parsed = parseSessionDate(value);
	if (!parsed) return value;
	const includeYear = options?.includeYear ?? true;
	return includeYear
		? fullDateFormatter.format(parsed)
		: compactDateFormatter.format(parsed);
}

export interface WeekdayShortcut {
	shortLabel: string;
	dayName: WeekdayName;
	date: string;
	dayNumber: number;
}

/**
 * Returns the Monday–Friday `YYYY-MM-DD` dates for the week containing `anchorSessionDate`.
 * On Sunday, returns the upcoming Monday–Friday; on Saturday, returns the Monday–Friday that just passed.
 */
export function getWeekdayShortcuts(
	anchorSessionDate: string,
): WeekdayShortcut[] {
	const anchor = parseSessionDate(anchorSessionDate) ?? new Date();
	const offsetToMonday = 1 - anchor.getDay();

	return WORKWEEK_DAYS.map(({ offset, shortLabel, dayName }) => {
		const target = new Date(
			anchor.getFullYear(),
			anchor.getMonth(),
			anchor.getDate() + offsetToMonday + offset,
		);
		return {
			shortLabel,
			dayName,
			date: formatSessionDate(target),
			dayNumber: target.getDate(),
		};
	});
}
