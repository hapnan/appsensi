import { useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
	ArrowLeft,
	BookOpen,
	CalendarX2,
	CircleCheckBig,
	DoorClosed,
	Search,
	Users,
	UserX,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
	CheckInDialog,
	type CheckInPhase,
} from "#/components/attendance/check-in-dialog";
import { StudentCard } from "#/components/attendance/student-card";
import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import { Input } from "#/components/ui/input";
import {
	type CheckInMode,
	type CheckInResult,
	describeCheckInError,
	type PendingStudent,
	type Roster,
	usePasskeyCheckIn,
} from "#/hooks/use-passkey-check-in";
import { useTRPC } from "#/integrations/trpc/react";
import { parseRoom, roomCodeSchema } from "#/lib/room";
import { cn } from "#/lib/utils";

export const Route = createFileRoute("/attendance/$roomId")({
	params: {
		parse: ({ roomId }) => ({ roomId: roomCodeSchema.parse(roomId) }),
		stringify: ({ roomId }) => ({ roomId }),
	},
	loader: async ({ context, params }) => {
		await context.queryClient.query(
			context.trpc.attendance.roster.queryOptions({ room: params.roomId }),
		);
	},
	head: ({ params }) => ({
		meta: [{ title: `Attendance · Room ${parseRoom(params.roomId).label}` }],
	}),
	errorComponent: InvalidRoom,
	component: AttendancePage,
});

/** How long the card exit animation runs before it is removed from the list. */
const EXIT_ANIMATION_MS = 300;

type DialogState = {
	open: boolean;
	phase: CheckInPhase;
	mode: CheckInMode | null;
	student: PendingStudent | null;
};

function AttendancePage() {
	const { roomId: room } = Route.useParams();
	const { label } = parseRoom(room);
	const trpc = useTRPC();
	const queryClient = useQueryClient();

	const [selectedScheduleId, setSelectedScheduleId] = useState<
		string | undefined
	>(undefined);

	const rosterOptions = trpc.attendance.roster.queryOptions({
		room,
		scheduleId: selectedScheduleId,
	});

	const { data: roster } = useSuspenseQuery({
		...rosterOptions,
		// Keep the list live when students check in from other devices.
		refetchInterval: 15_000,
	});

	const checkIn = usePasskeyCheckIn();

	const [search, setSearch] = useState("");
	const [leaving, setLeaving] = useState<ReadonlySet<string>>(new Set());
	const [dialog, setDialog] = useState<DialogState>({
		open: false,
		phase: "confirm",
		mode: null,
		student: null,
	});
	const searchRef = useRef<HTMLInputElement>(null);

	// ⌘K / Ctrl+K focuses the search box.
	useEffect(() => {
		const onKeyDown = (event: KeyboardEvent) => {
			if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
				event.preventDefault();
				searchRef.current?.focus();
			}
		};
		window.addEventListener("keydown", onKeyDown);
		return () => window.removeEventListener("keydown", onKeyDown);
	}, []);

	const visible = useMemo(() => {
		const query = search.trim().toLowerCase();
		if (!query) return roster.pending;
		return roster.pending.filter(
			(student) =>
				student.name.toLowerCase().includes(query) ||
				student.studentId.toLowerCase().includes(query),
		);
	}, [roster.pending, search]);

	const closeDialog = useCallback(
		() => setDialog((current) => ({ ...current, open: false })),
		[],
	);

	const removeFromRoster = useCallback(
		(result: CheckInResult) => {
			setLeaving((current) => new Set(current).add(result.studentId));
			window.setTimeout(() => {
				queryClient.setQueryData<Roster>(rosterOptions.queryKey, (current) =>
					current
						? {
								...current,
								present: current.present + 1,
								pending: current.pending.filter(
									(student) => student.id !== result.studentId,
								),
							}
						: current,
				);
				setLeaving((current) => {
					const next = new Set(current);
					next.delete(result.studentId);
					return next;
				});
				void queryClient.invalidateQueries({
					queryKey: rosterOptions.queryKey,
				});
			}, EXIT_ANIMATION_MS);
		},
		[queryClient, rosterOptions.queryKey],
	);

	const confirmCheckIn = async () => {
		const student = dialog.student;
		if (!student) return;

		setDialog((current) => ({ ...current, phase: "verifying", mode: null }));
		try {
			const result = await checkIn({
				room,
				studentId: student.id,
				scheduleId: roster.schedule?.id,
				onMode: (mode) => setDialog((current) => ({ ...current, mode })),
			});
			closeDialog();
			toast.success(`${result.name} checked in`, {
				description: `Room ${label} · ${new Date(result.checkedInAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`,
			});
			removeFromRoster(result);
		} catch (error) {
			closeDialog();
			toast.error("Check-in failed", {
				description: describeCheckInError(error),
			});
			void queryClient.invalidateQueries({ queryKey: rosterOptions.queryKey });
		}
	};

	return (
		<div className="flex min-h-dvh flex-col">
			<header className="sticky top-0 z-20 border-b bg-background/80 backdrop-blur-md">
				<div className="mx-auto flex w-full max-w-360 flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
					<div className="flex w-full max-w-3xl items-center gap-2">
						<Button
							asChild
							variant="ghost"
							size="icon"
							className="shrink-0 rounded-full"
						>
							<Link to="/" aria-label="Back to room">
								<ArrowLeft />
							</Link>
						</Button>
						<div className="relative flex-1">
							<Search className="-translate-y-1/2 pointer-events-none absolute top-1/2 left-4 size-4 text-outline" />
							<Input
								ref={searchRef}
								type="search"
								value={search}
								onChange={(event) => setSearch(event.target.value)}
								placeholder="Search by name or student ID…"
								aria-label="Search students"
								className="h-10 rounded-full bg-card pr-16 pl-11 shadow-sm"
							/>
							<kbd className="-translate-y-1/2 pointer-events-none absolute top-1/2 right-3 hidden rounded border bg-secondary px-2 py-0.5 font-mono text-[10px] text-outline sm:inline-flex">
								⌘K
							</kbd>
						</div>
					</div>

					<div className="flex shrink-0 items-center gap-2 self-end sm:self-center">
						<div className="flex items-center gap-2 rounded-full border bg-card px-3 py-1.5 shadow-sm">
							<span className="size-2 animate-pulse rounded-full bg-success" />
							<span className="font-medium font-mono text-[11px]">
								Live Session:{" "}
								<strong className="text-primary">Room {label}</strong>
							</span>
						</div>
						<div className="rounded-full border bg-secondary px-3 py-1.5 font-medium font-mono text-[11px] text-muted-foreground">
							{roster.present} / {roster.total} Present
						</div>
					</div>
				</div>
			</header>

			<main className="mx-auto w-full max-w-360 flex-1 space-y-6 px-4 py-6 sm:px-6">
				{/* Course Session Context Banner */}
				{roster.schedule && (
					<div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card/60 p-3.5 backdrop-blur-xs">
						<div className="flex items-center gap-3">
							<div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
								<BookOpen className="size-5" />
							</div>
							<div className="min-w-0">
								<div className="flex flex-wrap items-center gap-2">
									<h2 className="font-semibold text-sm text-foreground">
										{roster.schedule.courseCode} · {roster.schedule.courseName}
									</h2>
									<Badge variant="secondary" className="font-mono text-[10px]">
										Sec {roster.schedule.section}
									</Badge>
								</div>
								<p className="font-mono text-muted-foreground text-xs">
									{roster.schedule.instructor} · {roster.schedule.dayOfWeek}{" "}
									{roster.schedule.startTime}–{roster.schedule.endTime} (
									{roster.schedule.academicTerm})
								</p>
							</div>
						</div>

						{/* Section / Schedule Switcher if multiple courses exist for this room */}
						{roster.availableSchedules.length > 1 && (
							<div className="flex flex-wrap items-center gap-1.5">
								<span className="mr-1 font-mono text-[11px] text-muted-foreground">
									Sessions:
								</span>
								{roster.availableSchedules.map((s) => (
									<button
										key={s.id}
										type="button"
										onClick={() => setSelectedScheduleId(s.id)}
										className={cn(
											"rounded-md px-2.5 py-1 font-mono text-xs transition-colors",
											s.id === roster.schedule?.id
												? "bg-primary font-semibold text-primary-foreground"
												: "bg-secondary text-muted-foreground hover:bg-secondary/80",
										)}
									>
										{s.courseCode}-{s.section} ({s.dayOfWeek.slice(0, 3)})
									</button>
								))}
							</div>
						)}
					</div>
				)}

				{!roster.schedule ? (
					<EmptyState
						icon={<CalendarX2 className="size-8" />}
						title="No Scheduled Course"
						body={`There are currently no courses or class sessions scheduled in Room ${label}.`}
						action={<BackHomeButton />}
					/>
				) : roster.total === 0 ? (
					<EmptyState
						icon={<Users className="size-8" />}
						title="No Enrolled Students"
						body={`No students are currently enrolled in ${roster.schedule.courseCode} (Section ${roster.schedule.section}).`}
						action={<BackHomeButton />}
					/>
				) : roster.pending.length === 0 ? (
					<AllCheckedIn
						label={label}
						courseCode={roster.schedule.courseCode}
						total={roster.total}
					/>
				) : visible.length === 0 ? (
					<EmptyState
						icon={<UserX className="size-8" />}
						title="No matching students"
						body={`Nobody awaiting check-in matches “${search.trim()}”.`}
					/>
				) : (
					<div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
						{visible.map((student) => (
							<StudentCard
								key={student.id}
								student={student}
								leaving={leaving.has(student.id)}
								onCheckIn={(target) =>
									setDialog({
										open: true,
										phase: "confirm",
										mode: null,
										student: target,
									})
								}
							/>
						))}
					</div>
				)}
			</main>

			<CheckInDialog
				open={dialog.open}
				phase={dialog.phase}
				mode={dialog.mode}
				student={dialog.student}
				roomLabel={label}
				onCancel={closeDialog}
				onConfirm={confirmCheckIn}
			/>
		</div>
	);
}

function AllCheckedIn({
	label,
	courseCode,
	total,
}: {
	label: string;
	courseCode?: string;
	total: number;
}) {
	return (
		<EmptyState
			icon={<CircleCheckBig className="size-8" />}
			tone="success"
			title="Everyone's checked in"
			body={
				total === 0
					? "No students are registered yet."
					: `All ${total} enrolled students in ${courseCode ? `${courseCode} (` : ""}Room ${label}${courseCode ? ")" : ""} have checked in today.`
			}
			action={<BackHomeButton />}
		/>
	);
}

/** Shown when the `$roomId` segment isn't a valid `building.floor.room` code. */
function InvalidRoom() {
	return (
		<main className="flex min-h-dvh items-center justify-center px-4">
			<EmptyState
				icon={<DoorClosed className="size-8" />}
				title="Room not found"
				body="Room codes use the building.floor.room format, e.g. h.2.4."
				action={<BackHomeButton />}
			/>
		</main>
	);
}

function BackHomeButton() {
	return (
		<Button asChild variant="outline">
			<Link to="/">
				<ArrowLeft />
				Back to room
			</Link>
		</Button>
	);
}

function EmptyState({
	icon,
	title,
	body,
	action,
	tone = "muted",
}: {
	icon: React.ReactNode;
	title: string;
	body: string;
	action?: React.ReactNode;
	tone?: "muted" | "success";
}) {
	return (
		<div className="fade-in-0 zoom-in-95 flex animate-in flex-col items-center justify-center gap-4 py-24 text-center duration-300">
			<div
				className={
					tone === "success"
						? "flex size-16 items-center justify-center rounded-full bg-success/10 text-success"
						: "flex size-16 items-center justify-center rounded-full bg-secondary text-muted-foreground"
				}
			>
				{icon}
			</div>
			<div className="space-y-1">
				<h2 className="font-display font-semibold text-xl">{title}</h2>
				<p className="max-w-sm text-muted-foreground text-sm">{body}</p>
			</div>
			{action}
		</div>
	);
}
