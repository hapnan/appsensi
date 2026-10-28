import type { TRPCRouterRecord } from "@trpc/server";
import { TRPCError } from "@trpc/server";
import { and, asc, eq, or, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "#/db/index";
import {
	attendance,
	buildings,
	classSchedules,
	courses,
	credentials,
	faculties,
	rooms,
	studentSchedules,
	students,
	users,
} from "#/db/schema";
import {
	dayOfWeekFromSessionDate,
	formatDisplayDate,
	sessionDateSchema,
	todaySessionDate,
} from "#/lib/date";
import { roomCodeSchema } from "#/lib/room";
import { createTRPCRouter, publicProcedure } from "./init";

/** Today's date (YYYY-MM-DD) in the server's timezone; one session per day. */
export function currentSessionDate() {
	return todaySessionDate();
}

/** Day of the week name, e.g. "Monday", "Tuesday". */
export function currentDayOfWeek() {
	return dayOfWeekFromSessionDate(currentSessionDate());
}

/** Current local time (HH:MM, 24-hour) in the server's timezone. */
export function currentSessionTime(now = new Date()) {
	const hours = String(now.getHours()).padStart(2, "0");
	const minutes = String(now.getMinutes()).padStart(2, "0");
	return `${hours}:${minutes}`;
}

function normalizeTime(value: string) {
	const trimmed = value.trim();
	return /^\d:\d{2}$/.test(trimmed) ? `0${trimmed}` : trimmed;
}

function sortTimeKey(value: string) {
	const normalized = normalizeTime(value);
	return normalized.length > 0 ? normalized : "99:99";
}

export interface EnrolledStudent {
	id: string;
	studentId: string;
	username: string;
	name: string;
	department: string | null;
	photoUrl: string | null;
	isRegistered: boolean;
}

export interface ScheduleSummary {
	id: string;
	courseCode: string;
	courseName: string;
	section: string;
	dayOfWeek: string;
	startTime: string;
	endTime: string;
}

export interface ActiveScheduleDetails extends ScheduleSummary {
	credits: number;
	instructor: string;
	academicTerm: string;
}

export interface RosterResult {
	room: string;
	sessionDate: string;
	dayOfWeek: string;
	schedule: ActiveScheduleDetails | null;
	availableSchedules: ScheduleSummary[];
	total: number;
	present: number;
	pending: EnrolledStudent[];
}

export interface DemoCatalogRoom {
	code: string;
	floor: number;
	roomNumber: string;
	buildingCode: string;
	buildingName: string;
	facultyCode: string | null;
	facultyName: string | null;
	schedules: ScheduleSummary[];
}

const DAY_ORDER: Record<string, number> = {
	monday: 1,
	tuesday: 2,
	wednesday: 3,
	thursday: 4,
	friday: 5,
	saturday: 6,
	sunday: 7,
};

function sortDayKey(dayOfWeek: string) {
	return DAY_ORDER[dayOfWeek.trim().toLowerCase()] ?? 99;
}

/** Fetches class schedules for a room on a specific weekday, sorted chronologically by start time. */
async function fetchRoomSchedulesForDay(
	roomId: string,
	targetDay: string,
): Promise<ActiveScheduleDetails[]> {
	const rawSchedules = await db
		.select({
			id: classSchedules.id,
			section: classSchedules.section,
			instructor: classSchedules.instructor,
			dayOfWeek: classSchedules.dayOfWeek,
			startTime: classSchedules.startTime,
			endTime: classSchedules.endTime,
			academicTerm: classSchedules.academicTerm,
			courseCode: courses.code,
			courseName: courses.name,
			credits: courses.credits,
		})
		.from(classSchedules)
		.innerJoin(courses, eq(courses.id, classSchedules.courseId))
		.where(
			and(
				eq(classSchedules.roomId, roomId),
				sql`lower(trim(${classSchedules.dayOfWeek})) = lower(${targetDay})`,
			),
		);

	return rawSchedules
		.map((s) => ({
			id: s.id,
			section: s.section ?? "A",
			instructor: s.instructor ?? "TBA",
			dayOfWeek: s.dayOfWeek ?? "",
			startTime: s.startTime ?? "",
			endTime: s.endTime ?? "",
			academicTerm: s.academicTerm ?? "",
			courseCode: s.courseCode,
			courseName: s.courseName,
			credits: s.credits,
		}))
		.sort((a, b) => {
			const startCmp = sortTimeKey(a.startTime).localeCompare(
				sortTimeKey(b.startTime),
			);
			if (startCmp !== 0) return startCmp;
			const endCmp = sortTimeKey(a.endTime).localeCompare(
				sortTimeKey(b.endTime),
			);
			if (endCmp !== 0) return endCmp;
			const courseCmp = a.courseCode.localeCompare(b.courseCode);
			if (courseCmp !== 0) return courseCmp;
			return a.section.localeCompare(b.section);
		});
}

/**
 * Picks the active schedule from a day's sorted room schedules:
 * 1. Explicit `requestedScheduleId` if it matches one of the day's schedules
 * 2. When `currentTime` is provided (viewing today), ongoing or next upcoming session (`endTime >= currentTime`)
 * 3. First chronological session of that day
 */
function selectActiveScheduleForDay(
	schedules: ActiveScheduleDetails[],
	requestedScheduleId: string | undefined,
	currentTime: string | undefined,
): ActiveScheduleDetails | undefined {
	if (requestedScheduleId) {
		const explicit = schedules.find((s) => s.id === requestedScheduleId);
		if (explicit) return explicit;
	}
	if (currentTime !== undefined) {
		const normalizedNow = normalizeTime(currentTime);
		const ongoingOrUpcoming = schedules.find((s) => {
			const end = normalizeTime(s.endTime);
			return end.length > 0 && end >= normalizedNow;
		});
		if (ongoingOrUpcoming) return ongoingOrUpcoming;
	}
	return schedules[0];
}

const attendanceRouter = {
	/** Lists all campus rooms that have scheduled courses along with their weekly class sessions. */
	demoCatalog: publicProcedure.query(async (): Promise<DemoCatalogRoom[]> => {
		const rows = await db
			.select({
				scheduleId: classSchedules.id,
				section: classSchedules.section,
				dayOfWeek: classSchedules.dayOfWeek,
				startTime: classSchedules.startTime,
				endTime: classSchedules.endTime,
				roomCode: rooms.code,
				floor: rooms.floor,
				roomNumber: rooms.roomNumber,
				buildingCode: buildings.code,
				buildingName: buildings.name,
				courseCode: courses.code,
				courseName: courses.name,
				facultyCode: faculties.code,
				facultyName: faculties.name,
			})
			.from(classSchedules)
			.innerJoin(rooms, eq(rooms.id, classSchedules.roomId))
			.innerJoin(buildings, eq(buildings.id, rooms.buildingId))
			.innerJoin(courses, eq(courses.id, classSchedules.courseId))
			.leftJoin(faculties, eq(faculties.id, courses.facultyId));

		const byRoomCode = new Map<string, DemoCatalogRoom>();

		for (const row of rows) {
			const normalizedCode = row.roomCode.toLowerCase();
			let entry = byRoomCode.get(normalizedCode);
			if (!entry) {
				entry = {
					code: normalizedCode,
					floor: row.floor,
					roomNumber: row.roomNumber,
					buildingCode: row.buildingCode,
					buildingName: row.buildingName,
					facultyCode: row.facultyCode ?? null,
					facultyName: row.facultyName ?? null,
					schedules: [],
				};
				byRoomCode.set(normalizedCode, entry);
			}
			entry.schedules.push({
				id: row.scheduleId,
				courseCode: row.courseCode,
				courseName: row.courseName,
				section: row.section ?? "A",
				dayOfWeek: row.dayOfWeek ?? "",
				startTime: row.startTime ?? "",
				endTime: row.endTime ?? "",
			});
		}

		for (const room of byRoomCode.values()) {
			room.schedules.sort((a, b) => {
				const dayCmp = sortDayKey(a.dayOfWeek) - sortDayKey(b.dayOfWeek);
				if (dayCmp !== 0) return dayCmp;
				const startCmp = sortTimeKey(a.startTime).localeCompare(
					sortTimeKey(b.startTime),
				);
				if (startCmp !== 0) return startCmp;
				return a.courseCode.localeCompare(b.courseCode);
			});
		}

		return Array.from(byRoomCode.values()).sort(
			(a, b) =>
				a.buildingCode.localeCompare(b.buildingCode) ||
				a.floor - b.floor ||
				Number(a.roomNumber) - Number(b.roomNumber) ||
				a.code.localeCompare(b.code),
		);
	}),

	/** Students enrolled in the room's active class schedule that still need to check in on the target date. */
	roster: publicProcedure
		.input(
			z.object({
				room: roomCodeSchema,
				scheduleId: z.string().uuid().optional(),
				date: sessionDateSchema.optional(),
			}),
		)
		.query(async ({ input }): Promise<RosterResult> => {
			const todayDate = currentSessionDate();
			const sessionDate = input.date ?? todayDate;
			const isToday = sessionDate === todayDate;
			const normalizedRoom = input.room.toLowerCase();
			const targetDay = dayOfWeekFromSessionDate(sessionDate);

			const emptyResult: RosterResult = {
				room: input.room,
				sessionDate,
				dayOfWeek: targetDay,
				schedule: null,
				availableSchedules: [],
				total: 0,
				present: 0,
				pending: [],
			};

			// 1. Resolve room record from the rooms table
			const [room] = await db
				.select({ id: rooms.id, code: rooms.code, name: rooms.name })
				.from(rooms)
				.where(eq(rooms.code, normalizedRoom))
				.limit(1);

			if (!room) {
				return emptyResult;
			}

			// 2. Resolve target day's schedules for this room with course details
			const schedules = await fetchRoomSchedulesForDay(room.id, targetDay);

			if (schedules.length === 0) {
				return emptyResult;
			}

			// 3. Select active schedule from the day's classes
			const activeSchedule = selectActiveScheduleForDay(
				schedules,
				input.scheduleId,
				isToday ? currentSessionTime() : undefined,
			);

			if (!activeSchedule) {
				return emptyResult;
			}

			// 4. Query students enrolled in this specific class schedule paired with passkey status
			const enrolledRows = await db
				.select({
					id: students.id,
					studentId: students.studentId,
					name: students.name,
					department: students.department,
					photoUrl: students.photoUrl,
					userId: users.id,
					username: users.username,
					credentialId: credentials.id,
				})
				.from(students)
				.innerJoin(
					studentSchedules,
					eq(studentSchedules.studentId, students.id),
				)
				.leftJoin(
					users,
					or(
						eq(users.id, students.userId),
						eq(users.username, students.studentId),
					),
				)
				.leftJoin(credentials, eq(credentials.userId, users.id))
				.where(
					and(
						eq(studentSchedules.classScheduleId, activeSchedule.id),
						eq(studentSchedules.status, "enrolled"),
					),
				)
				.orderBy(asc(students.name));

			const enrolledById = new Map<string, EnrolledStudent>();
			for (const row of enrolledRows) {
				const isRegistered = Boolean(row.userId && row.credentialId);
				const existing = enrolledById.get(row.id);
				if (existing && (existing.isRegistered || !isRegistered)) {
					continue;
				}
				enrolledById.set(row.id, {
					id: row.id,
					studentId: row.studentId,
					username: row.username ?? row.studentId,
					name: row.name,
					department: row.department,
					photoUrl: row.photoUrl,
					isRegistered,
				});
			}
			const enrolled = Array.from(enrolledById.values());

			// 5. Query check-ins on sessionDate for this active class session
			const checkedInRows = await db
				.select({ studentId: attendance.studentId })
				.from(attendance)
				.where(
					and(
						eq(attendance.classScheduleId, activeSchedule.id),
						eq(attendance.sessionDate, sessionDate),
					),
				);

			const checkedInSet = new Set(checkedInRows.map((r) => r.studentId));
			const pending = enrolled.filter((s) => !checkedInSet.has(s.id));
			const total = enrolled.length;
			const present = total - pending.length;

			return {
				room: input.room,
				sessionDate,
				dayOfWeek: targetDay,
				schedule: {
					id: activeSchedule.id,
					courseCode: activeSchedule.courseCode,
					courseName: activeSchedule.courseName,
					credits: activeSchedule.credits,
					section: activeSchedule.section,
					instructor: activeSchedule.instructor,
					dayOfWeek: activeSchedule.dayOfWeek,
					startTime: activeSchedule.startTime,
					endTime: activeSchedule.endTime,
					academicTerm: activeSchedule.academicTerm,
				},
				availableSchedules: schedules.map((s) => ({
					id: s.id,
					courseCode: s.courseCode,
					courseName: s.courseName,
					section: s.section,
					dayOfWeek: s.dayOfWeek,
					startTime: s.startTime,
					endTime: s.endTime,
				})),
				total,
				present,
				pending,
			};
		}),

	/** Record attendance for a student in a room for the active class schedule. */
	checkIn: publicProcedure
		.input(
			z.object({
				room: roomCodeSchema,
				studentId: z.string().min(1),
				scheduleId: z.string().uuid().optional(),
				date: sessionDateSchema.optional(),
			}),
		)
		.mutation(async ({ input }) => {
			const normalizedRoom = input.room.toLowerCase();
			const roomUpper = input.room.toUpperCase();
			const todayDate = currentSessionDate();
			const sessionDate = input.date ?? todayDate;
			const isToday = sessionDate === todayDate;
			const targetDay = dayOfWeekFromSessionDate(sessionDate);
			const whenPhrase = isToday
				? "today"
				: `on ${formatDisplayDate(sessionDate)}`;

			const [room] = await db
				.select({ id: rooms.id })
				.from(rooms)
				.where(eq(rooms.code, normalizedRoom))
				.limit(1);

			if (!room) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: `Room ${roomUpper} not found`,
				});
			}

			const isUuid = z.uuid().safeParse(input.studentId).success;
			const [student] = await db
				.select()
				.from(students)
				.where(
					isUuid
						? or(
								eq(students.id, input.studentId),
								eq(students.studentId, input.studentId),
							)
						: eq(students.studentId, input.studentId),
				)
				.limit(1);

			if (!student) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Student not found",
				});
			}

			// Verify student has a registered WebAuthn account & passkey credential
			const [registeredAccount] = await db
				.select({
					userId: users.id,
					credentialId: credentials.id,
				})
				.from(users)
				.innerJoin(credentials, eq(credentials.userId, users.id))
				.where(
					student.userId
						? or(
								eq(users.id, student.userId),
								eq(users.username, student.studentId),
							)
						: eq(users.username, student.studentId),
				)
				.limit(1);

			if (!registeredAccount) {
				throw new TRPCError({
					code: "PRECONDITION_FAILED",
					message: `${student.name} has not registered a passkey yet`,
				});
			}

			if (!student.userId) {
				await db
					.update(students)
					.set({ userId: registeredAccount.userId })
					.where(eq(students.id, student.id));
			}

			// Resolve target day's active schedule for this room
			const daySchedules = await fetchRoomSchedulesForDay(room.id, targetDay);

			if (daySchedules.length === 0) {
				throw new TRPCError({
					code: "PRECONDITION_FAILED",
					message: `No class sessions are scheduled in Room ${roomUpper} ${whenPhrase}`,
				});
			}

			const explicitSchedule = input.scheduleId
				? daySchedules.find((s) => s.id === input.scheduleId)
				: undefined;

			if (input.scheduleId && !explicitSchedule) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: `Selected class session is not scheduled in Room ${roomUpper} ${whenPhrase}`,
				});
			}

			const activeSchedule =
				explicitSchedule ??
				selectActiveScheduleForDay(
					daySchedules,
					undefined,
					isToday ? currentSessionTime() : undefined,
				);

			if (!activeSchedule) {
				throw new TRPCError({
					code: "PRECONDITION_FAILED",
					message: `No class sessions are scheduled in Room ${roomUpper} ${whenPhrase}`,
				});
			}

			// Verify student enrollment in the active class schedule
			const [enrollment] = await db
				.select({ id: studentSchedules.id })
				.from(studentSchedules)
				.where(
					and(
						eq(studentSchedules.studentId, student.id),
						eq(studentSchedules.classScheduleId, activeSchedule.id),
						eq(studentSchedules.status, "enrolled"),
					),
				)
				.limit(1);

			if (!enrollment) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: `${student.name} is not enrolled in ${activeSchedule.courseCode} in Room ${roomUpper}`,
				});
			}

			// Check if already checked in on sessionDate for this class schedule
			const [alreadyCheckedIn] = await db
				.select({ id: attendance.id })
				.from(attendance)
				.where(
					and(
						eq(attendance.studentId, student.id),
						eq(attendance.classScheduleId, activeSchedule.id),
						eq(attendance.sessionDate, sessionDate),
					),
				)
				.limit(1);

			if (alreadyCheckedIn) {
				throw new TRPCError({
					code: "CONFLICT",
					message: `${student.name} is already checked in`,
				});
			}

			const [row] = await db
				.insert(attendance)
				.values({
					studentId: student.id,
					roomId: room.id,
					classScheduleId: activeSchedule.id,
					sessionDate,
				})
				.onConflictDoNothing()
				.returning({ checkedInAt: attendance.checkedInAt });

			if (!row) {
				throw new TRPCError({
					code: "CONFLICT",
					message: `${student.name} is already checked in`,
				});
			}

			return {
				id: student.id,
				studentId: student.studentId,
				name: student.name,
				room: input.room,
				sessionDate,
				checkedInAt: row.checkedInAt,
			};
		}),
} satisfies TRPCRouterRecord;

export interface RegistrationStudentRow {
	id: string;
	name: string;
	username: string;
	department: string | null;
	userId: string | null;
	email: string | null;
	createdAt: Date | null;
	isRegistered: boolean;
}

const registrationRouter = {
	/** Lists all students paired with any matching account in the `users` table. */
	list: publicProcedure.query(async (): Promise<RegistrationStudentRow[]> => {
		const rows = await db
			.select({
				id: students.id,
				name: students.name,
				username: students.studentId,
				department: students.department,
				userId: users.id,
				email: users.email,
				createdAt: users.createdAt,
				credentialId: credentials.id,
			})
			.from(students)
			.leftJoin(
				users,
				or(
					eq(users.id, students.userId),
					eq(users.username, students.studentId),
				),
			)
			.leftJoin(credentials, eq(credentials.userId, users.id))
			.orderBy(asc(students.studentId));

		const byId = new Map<string, RegistrationStudentRow>();
		for (const row of rows) {
			const isRegistered = Boolean(row.userId && row.credentialId);
			const existing = byId.get(row.id);
			if (existing && (existing.isRegistered || !isRegistered)) continue;
			byId.set(row.id, {
				id: row.id,
				name: row.name,
				username: row.username,
				department: row.department,
				userId: row.userId ?? null,
				email: row.email ?? null,
				createdAt: row.createdAt ?? null,
				isRegistered,
			});
		}

		return Array.from(byId.values());
	}),

	/** Links `students.user_id` to `users.id` once WebAuthn registration finishes. */
	linkStudentUser: publicProcedure
		.input(
			z.object({
				studentId: z.string().uuid(),
				username: z.string().min(1),
			}),
		)
		.mutation(async ({ input }) => {
			const [user] = await db
				.select({
					id: users.id,
					email: users.email,
					createdAt: users.createdAt,
				})
				.from(users)
				.where(eq(users.username, input.username))
				.limit(1);

			if (!user) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: `Registered user "${input.username}" was not found.`,
				});
			}

			await db
				.update(students)
				.set({ userId: user.id })
				.where(eq(students.id, input.studentId));

			return {
				userId: user.id,
				email: user.email,
				createdAt: user.createdAt,
			};
		}),

	/**
	 * Removes an unverified `users` record (one with zero passkey credentials)
	 * if a WebAuthn ceremony is cancelled or fails after `/register/begin`.
	 */
	cleanupIncompleteUser: publicProcedure
		.input(
			z.object({
				username: z.string().min(1),
			}),
		)
		.mutation(async ({ input }) => {
			const [user] = await db
				.select({ id: users.id })
				.from(users)
				.where(eq(users.username, input.username))
				.limit(1);

			if (!user) {
				return { cleaned: false };
			}

			const existingCredentials = await db
				.select({ id: credentials.id })
				.from(credentials)
				.where(eq(credentials.userId, user.id))
				.limit(1);

			if (existingCredentials.length > 0) {
				return { cleaned: false };
			}

			await db.delete(users).where(eq(users.id, user.id));
			return { cleaned: true };
		}),
} satisfies TRPCRouterRecord;

export const trpcRouter = createTRPCRouter({
	attendance: attendanceRouter,
	registration: registrationRouter,
});
export type TRPCRouter = typeof trpcRouter;
