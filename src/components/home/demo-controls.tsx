import {
	BookOpen,
	CalendarDays,
	CalendarX2,
	Check,
	ChevronDown,
	ChevronsUpDown,
	DoorOpen,
	RotateCcw,
	Search,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import { Calendar } from "#/components/ui/calendar";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "#/components/ui/popover";
import type { DemoCatalogRoom } from "#/integrations/trpc/router";
import {
	dayOfWeekFromSessionDate,
	formatDisplayDate,
	formatSessionDate,
	getWeekdayShortcuts,
	parseSessionDate,
	WEEKDAYS,
} from "#/lib/date";
import { DEFAULT_ROOM, parseRoom } from "#/lib/room";
import { cn } from "#/lib/utils";

const SHORT_DAY_LABELS: Record<string, string> = {
	monday: "Mon",
	tuesday: "Tue",
	wednesday: "Wed",
	thursday: "Thu",
	friday: "Fri",
	saturday: "Sat",
	sunday: "Sun",
};

function summarizeRoomDays(room: DemoCatalogRoom): string {
	const uniqueLower: string[] = [];
	for (const s of room.schedules) {
		const lower = s.dayOfWeek.trim().toLowerCase();
		if (lower && !uniqueLower.includes(lower)) {
			uniqueLower.push(lower);
		}
	}
	const isFullWorkweek =
		uniqueLower.length === 5 &&
		["monday", "tuesday", "wednesday", "thursday", "friday"].every((d) =>
			uniqueLower.includes(d),
		);
	if (isFullWorkweek) return "Mon–Fri";
	return uniqueLower.map((d) => SHORT_DAY_LABELS[d] ?? d).join(", ");
}

export interface DemoControlsProps {
	rooms: DemoCatalogRoom[];
	selectedRoom: string;
	selectedDate: string;
	todayDate: string;
	onSelectRoom: (roomCode: string) => void;
	onSelectDate: (sessionDate: string) => void;
	onReset: () => void;
}

export function DemoControls({
	rooms,
	selectedRoom,
	selectedDate,
	todayDate,
	onSelectRoom,
	onSelectDate,
	onReset,
}: DemoControlsProps) {
	const [roomOpen, setRoomOpen] = useState(false);
	const [dateOpen, setDateOpen] = useState(false);
	const [roomQuery, setRoomQuery] = useState("");

	const parsedSelectedDate = useMemo(
		() => parseSessionDate(selectedDate) ?? new Date(),
		[selectedDate],
	);
	const [calendarMonth, setCalendarMonth] = useState<Date>(parsedSelectedDate);

	useEffect(() => {
		setCalendarMonth(parsedSelectedDate);
	}, [parsedSelectedDate]);

	const normalizedSelectedRoom = selectedRoom.toLowerCase();
	const parsedRoom = parseRoom(normalizedSelectedRoom);
	const selectedDayName = dayOfWeekFromSessionDate(selectedDate);
	const selectedDayLower = selectedDayName.toLowerCase();
	const isToday = selectedDate === todayDate;
	const isCustomized =
		normalizedSelectedRoom !== DEFAULT_ROOM || selectedDate !== todayDate;

	const currentCatalogRoom = useMemo(
		() => rooms.find((r) => r.code === normalizedSelectedRoom) ?? null,
		[rooms, normalizedSelectedRoom],
	);

	const matchingSchedules = useMemo(() => {
		if (!currentCatalogRoom) return [];
		return currentCatalogRoom.schedules.filter(
			(s) => s.dayOfWeek.trim().toLowerCase() === selectedDayLower,
		);
	}, [currentCatalogRoom, selectedDayLower]);

	const activeScheduledDays = useMemo(() => {
		const days = new Set<string>();
		if (!currentCatalogRoom) return days;
		for (const s of currentCatalogRoom.schedules) {
			const lower = s.dayOfWeek.trim().toLowerCase();
			if (lower) days.add(lower);
		}
		return days;
	}, [currentCatalogRoom]);

	const weekdayShortcuts = useMemo(
		() => getWeekdayShortcuts(selectedDate),
		[selectedDate],
	);

	const suggestedShortcut = useMemo(() => {
		if (matchingSchedules.length > 0) return null;
		return (
			weekdayShortcuts.find((shortcut) =>
				activeScheduledDays.has(shortcut.dayName.toLowerCase()),
			) ?? null
		);
	}, [matchingSchedules.length, weekdayShortcuts, activeScheduledDays]);

	const groupedRooms = useMemo(() => {
		const query = roomQuery.trim().toLowerCase();
		const filtered = query
			? rooms.filter((r) => {
					if (r.code.toLowerCase().includes(query)) return true;
					if (r.buildingName.toLowerCase().includes(query)) return true;
					if (r.facultyCode?.toLowerCase().includes(query)) return true;
					if (r.facultyName?.toLowerCase().includes(query)) return true;
					return r.schedules.some(
						(s) =>
							s.courseCode.toLowerCase().includes(query) ||
							s.courseName.toLowerCase().includes(query),
					);
				})
			: rooms;

		const groups = new Map<
			string,
			{ key: string; title: string; items: DemoCatalogRoom[] }
		>();
		for (const room of filtered) {
			const key = `${room.buildingCode}:${room.facultyCode ?? "general"}`;
			let group = groups.get(key);
			if (!group) {
				const title = room.facultyName
					? `${room.buildingName} · ${room.facultyName}`
					: room.buildingName;
				group = { key, title, items: [] };
				groups.set(key, group);
			}
			group.items.push(room);
		}
		return Array.from(groups.values());
	}, [rooms, roomQuery]);

	const primaryMatch = matchingSchedules[0];
	const extraSessionsCount = Math.max(0, matchingSchedules.length - 1);

	const roomSubtitle = currentCatalogRoom
		? currentCatalogRoom.facultyCode
			? `${currentCatalogRoom.facultyCode} · ${currentCatalogRoom.buildingName}`
			: currentCatalogRoom.buildingName
		: `Building ${parsedRoom.building}`;

	return (
		<section
			aria-label="Demo room and date controls"
			className="mb-6 w-full max-w-lg animate-fade-up rounded-2xl border border-border/60 bg-card/75 p-3 text-left shadow-sm backdrop-blur-md [animation-delay:380ms] motion-reduce:animate-none"
		>
			<div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
				{/* Room Picker */}
				<Popover
					open={roomOpen}
					onOpenChange={(next) => {
						setRoomOpen(next);
						if (!next) setRoomQuery("");
					}}
				>
					<PopoverTrigger asChild>
						<button
							type="button"
							aria-label={`Select classroom, currently Room ${parsedRoom.label}`}
							className="group flex w-full items-center justify-between gap-2.5 rounded-xl border border-border/60 bg-background/80 px-3 py-2 text-left transition-colors hover:border-primary/40 hover:bg-background focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-hidden"
						>
							<div className="flex min-w-0 items-center gap-2.5">
								<span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary transition-colors group-hover:bg-primary/15">
									<DoorOpen className="size-4" />
								</span>
								<div className="min-w-0">
									<span className="block font-mono font-semibold text-[10px] text-muted-foreground uppercase tracking-wider">
										Classroom
									</span>
									<div className="flex items-center gap-1.5 truncate">
										<span className="font-bold font-display text-foreground text-sm">
											{parsedRoom.label}
										</span>
										<span className="truncate font-mono text-[11px] text-muted-foreground">
											· {roomSubtitle}
										</span>
									</div>
								</div>
							</div>
							<ChevronsUpDown className="size-4 shrink-0 text-muted-foreground transition-colors group-hover:text-foreground" />
						</button>
					</PopoverTrigger>
					<PopoverContent
						align="start"
						className="w-[min(23rem,calc(100vw-2rem))] overflow-hidden rounded-xl p-0 shadow-lg"
					>
						<div className="flex items-center gap-2 border-b bg-muted/30 px-3 py-2.5">
							<Search className="size-4 shrink-0 text-muted-foreground" />
							<input
								type="search"
								value={roomQuery}
								onChange={(event) => setRoomQuery(event.target.value)}
								placeholder="Filter room, faculty, or course…"
								aria-label="Filter rooms"
								className="w-full bg-transparent text-foreground text-xs placeholder:text-muted-foreground focus:outline-hidden"
							/>
						</div>
						<div className="max-h-72 overflow-y-auto p-1.5">
							{groupedRooms.length === 0 ? (
								<p className="px-3 py-6 text-center text-muted-foreground text-xs">
									No scheduled rooms match “{roomQuery.trim()}”.
								</p>
							) : (
								groupedRooms.map((group) => (
									<div key={group.key} className="mb-2 last:mb-0">
										<div className="px-2.5 py-1 font-mono font-semibold text-[10px] text-muted-foreground uppercase tracking-wider">
											{group.title}
										</div>
										<div className="space-y-0.5">
											{group.items.map((roomItem) => {
												const isSelected =
													roomItem.code === normalizedSelectedRoom;
												const dayMatches = roomItem.schedules.filter(
													(s) =>
														s.dayOfWeek.trim().toLowerCase() ===
														selectedDayLower,
												);
												const firstDayMatch = dayMatches[0];

												return (
													<button
														key={roomItem.code}
														type="button"
														aria-pressed={isSelected}
														onClick={() => {
															onSelectRoom(roomItem.code);
															setRoomOpen(false);
															setRoomQuery("");
														}}
														className={cn(
															"flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-left text-xs transition-colors",
															isSelected
																? "bg-primary/10 font-medium text-primary"
																: "text-foreground hover:bg-secondary/70",
														)}
													>
														<div className="flex min-w-0 items-center gap-2">
															<Check
																className={cn(
																	"size-3.5 shrink-0",
																	isSelected
																		? "text-primary opacity-100"
																		: "opacity-0",
																)}
															/>
															<span className="font-bold font-mono text-xs">
																{roomItem.code.toUpperCase()}
															</span>
															<span className="truncate text-[11px] text-muted-foreground">
																Fl {roomItem.floor}
															</span>
														</div>

														{firstDayMatch ? (
															<span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-success/12 px-2 py-0.5 font-mono font-medium text-[10px] text-emerald-700">
																<span className="size-1.5 rounded-full bg-success" />
																{firstDayMatch.courseCode}
																{firstDayMatch.startTime
																	? ` · ${firstDayMatch.startTime}`
																	: ""}
															</span>
														) : (
															<span className="shrink-0 font-mono text-[10px] text-muted-foreground">
																{summarizeRoomDays(roomItem)}
															</span>
														)}
													</button>
												);
											})}
										</div>
									</div>
								))
							)}
						</div>
					</PopoverContent>
				</Popover>

				{/* Date Picker */}
				<Popover open={dateOpen} onOpenChange={setDateOpen}>
					<PopoverTrigger asChild>
						<button
							type="button"
							aria-label={`Select session date, currently ${formatDisplayDate(selectedDate)}`}
							className={cn(
								"group flex w-full items-center justify-between gap-2.5 rounded-xl border px-3 py-2 text-left transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-hidden",
								isToday
									? "border-border/60 bg-background/80 hover:border-primary/40 hover:bg-background"
									: "border-primary/35 bg-primary/5 hover:border-primary/50 hover:bg-primary/8",
							)}
						>
							<div className="flex min-w-0 items-center gap-2.5">
								<span
									className={cn(
										"flex size-8 shrink-0 items-center justify-center rounded-lg transition-colors",
										isToday
											? "bg-primary/10 text-primary group-hover:bg-primary/15"
											: "bg-primary text-primary-foreground",
									)}
								>
									<CalendarDays className="size-4" />
								</span>
								<div className="min-w-0">
									<div className="flex items-center gap-1.5">
										<span className="font-mono font-semibold text-[10px] text-muted-foreground uppercase tracking-wider">
											Session Date
										</span>
										{isToday && (
											<span className="rounded bg-secondary px-1.5 py-px font-mono font-semibold text-[9px] text-primary uppercase">
												Today
											</span>
										)}
									</div>
									<span className="block truncate font-semibold text-foreground text-xs">
										{formatDisplayDate(selectedDate)}
									</span>
								</div>
							</div>
							<ChevronDown className="size-4 shrink-0 text-muted-foreground transition-colors group-hover:text-foreground" />
						</button>
					</PopoverTrigger>
					<PopoverContent
						align="end"
						className="w-auto overflow-hidden rounded-xl p-0 shadow-lg"
					>
						<div className="space-y-2 border-b bg-muted/40 p-2.5">
							<div className="flex items-center justify-between gap-2">
								<span className="font-mono font-semibold text-[10px] text-muted-foreground uppercase tracking-wider">
									Quick Weekdays ({parsedRoom.label})
								</span>
								<button
									type="button"
									onClick={() => {
										onSelectDate(todayDate);
										setDateOpen(false);
									}}
									className={cn(
										"rounded-md px-2 py-0.5 font-mono font-semibold text-[10px] transition-colors",
										isToday
											? "bg-primary text-primary-foreground"
											: "bg-secondary text-foreground hover:bg-secondary/80",
									)}
								>
									Today
								</button>
							</div>
							<div className="grid grid-cols-5 gap-1">
								{weekdayShortcuts.map((shortcut) => {
									const isShortcutSelected = shortcut.date === selectedDate;
									const hasClassOnDay = activeScheduledDays.has(
										shortcut.dayName.toLowerCase(),
									);
									return (
										<button
											key={shortcut.date}
											type="button"
											aria-pressed={isShortcutSelected}
											onClick={() => {
												onSelectDate(shortcut.date);
												setDateOpen(false);
											}}
											className={cn(
												"flex flex-col items-center rounded-lg border px-2 py-1.5 font-mono transition-colors",
												isShortcutSelected
													? "border-primary bg-primary text-primary-foreground"
													: "border-border/50 bg-background text-foreground hover:border-primary/40 hover:bg-secondary/60",
											)}
										>
											<span className="font-semibold text-[10px]">
												{shortcut.shortLabel}
											</span>
											<span
												className={cn(
													"text-[10px]",
													isShortcutSelected
														? "text-primary-foreground/85"
														: "text-muted-foreground",
												)}
											>
												{shortcut.dayNumber}
											</span>
											<span
												aria-hidden
												className={cn(
													"mt-0.5 size-1 rounded-full",
													hasClassOnDay
														? isShortcutSelected
															? "bg-primary-foreground"
															: "bg-success"
														: "bg-transparent",
												)}
											/>
										</button>
									);
								})}
							</div>
						</div>

						<Calendar
							mode="single"
							selected={parsedSelectedDate}
							month={calendarMonth}
							onMonthChange={setCalendarMonth}
							onSelect={(nextDate) => {
								if (nextDate) {
									onSelectDate(formatSessionDate(nextDate));
									setDateOpen(false);
								}
							}}
							modifiers={{
								hasSchedule: (day) =>
									activeScheduledDays.has(
										(WEEKDAYS[day.getDay()] ?? "").toLowerCase(),
									),
							}}
							modifiersClassNames={{
								hasSchedule:
									"font-semibold underline decoration-primary/50 decoration-2 underline-offset-4",
							}}
						/>
					</PopoverContent>
				</Popover>
			</div>

			{/* Live Course Preview + Reset Strip */}
			<div className="mt-2.5 flex flex-wrap items-center justify-between gap-2 border-border/50 border-t pt-2.5">
				{primaryMatch ? (
					<div className="flex min-w-0 flex-1 items-center gap-2">
						<span className="flex size-5 shrink-0 items-center justify-center rounded-md bg-success/15 text-emerald-700">
							<BookOpen className="size-3" />
						</span>
						<p className="min-w-0 truncate text-xs">
							<span className="font-mono font-semibold text-foreground">
								{primaryMatch.courseCode}
							</span>
							<span className="text-muted-foreground">
								{" "}
								· {primaryMatch.courseName}
							</span>
						</p>
						{primaryMatch.startTime && (
							<Badge
								variant="secondary"
								className="ml-auto shrink-0 font-mono text-[10px]"
							>
								{primaryMatch.startTime}
								{primaryMatch.endTime ? `–${primaryMatch.endTime}` : ""}
							</Badge>
						)}
						{extraSessionsCount > 0 && (
							<Badge
								variant="outline"
								className="shrink-0 font-mono text-[10px]"
							>
								+{extraSessionsCount}
							</Badge>
						)}
					</div>
				) : (
					<div className="flex min-w-0 flex-1 flex-wrap items-center justify-between gap-2">
						<div className="flex min-w-0 items-center gap-2">
							<span className="flex size-5 shrink-0 items-center justify-center rounded-md bg-amber-500/15 text-amber-700">
								<CalendarX2 className="size-3" />
							</span>
							<span className="truncate text-muted-foreground text-xs">
								No class in{" "}
								<strong className="font-mono text-foreground">
									{parsedRoom.label}
								</strong>{" "}
								on {selectedDayName}
							</span>
						</div>
						{suggestedShortcut && (
							<button
								type="button"
								onClick={() => onSelectDate(suggestedShortcut.date)}
								className="shrink-0 rounded-full border border-primary/30 bg-primary/10 px-2.5 py-0.5 font-mono font-semibold text-[10px] text-primary transition-colors hover:bg-primary/15"
							>
								Switch to {suggestedShortcut.shortLabel} →
							</button>
						)}
					</div>
				)}

				{isCustomized && (
					<Button
						type="button"
						variant="ghost"
						size="xs"
						onClick={onReset}
						aria-label="Reset room and date to defaults"
						className="h-6 shrink-0 gap-1 rounded-full px-2 font-mono text-[10px] text-muted-foreground hover:text-foreground"
					>
						<RotateCcw className="size-3" />
						Reset
					</Button>
				)}
			</div>
		</section>
	);
}
