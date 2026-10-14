import type { TRPCRouterRecord } from "@trpc/server";
import { TRPCError } from "@trpc/server";
import { and, asc, eq, isNull, or } from "drizzle-orm";
import { z } from "zod";
import { db } from "#/db/index";
import {
	attendance,
	classSchedules,
	courses,
	rooms,
	studentSchedules,
	students,
} from "#/db/schema";
import { roomCodeSchema } from "#/lib/room";
import { createTRPCRouter, publicProcedure } from "./init";

/** Today's date (YYYY-MM-DD) in the server's timezone; one session per day. */
export function currentSessionDate() {
	return new Date().toLocaleDateString("en-CA");
}

/** Day of the week name, e.g. "Monday", "Tuesday". */
export function currentDayOfWeek() {
	const days = [
		"Sunday",
		"Monday",
		"Tuesday",
		"Wednesday",
		"Thursday",
		"Friday",
		"Saturday",
	];
	return days[new Date().getDay()] ?? "Monday";
}

export interface EnrolledStudent {
	id: string;
	studentId: string;
	name: string;
	department: string | null;
	photoUrl: string | null;
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
	schedule: ActiveScheduleDetails | null;
	availableSchedules: ScheduleSummary[];
	total: number;
	present: number;
	pending: EnrolledStudent[];
}

const attendanceRouter = {
	/** Students enrolled in the room's active class schedule that still need to check in today. */
	roster: publicProcedure
		.input(
			z.object({
				room: roomCodeSchema,
				scheduleId: z.string().uuid().optional(),
			}),
		)
		.query(async ({ input }): Promise<RosterResult> => {
			const sessionDate = currentSessionDate();
			const normalizedRoom = input.room.toLowerCase();
			const todayDay = currentDayOfWeek();

			const emptyResult: RosterResult = {
				room: input.room,
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

			// 2. Resolve schedules for this room with course details
			const schedules: ActiveScheduleDetails[] = await db
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
				.where(eq(classSchedules.roomId, room.id));

			if (schedules.length === 0) {
				return emptyResult;
			}

			// 3. Select active schedule:
			// Priority: Explicit input -> Today's schedule -> First available schedule
			const activeSchedule =
				(input.scheduleId
					? schedules.find((s) => s.id === input.scheduleId)
					: undefined) ??
				schedules.find(
					(s) => s.dayOfWeek.toLowerCase() === todayDay.toLowerCase(),
				) ??
				schedules[0];

			if (!activeSchedule) {
				return emptyResult;
			}

			// 4. Query students enrolled in this specific class schedule
			const enrolled: EnrolledStudent[] = await db
				.select({
					id: students.id,
					studentId: students.studentId,
					name: students.name,
					department: students.department,
					photoUrl: students.photoUrl,
				})
				.from(students)
				.innerJoin(
					studentSchedules,
					eq(studentSchedules.studentId, students.id),
				)
				.where(
					and(
						eq(studentSchedules.classScheduleId, activeSchedule.id),
						eq(studentSchedules.status, "enrolled"),
					),
				)
				.orderBy(asc(students.name));

			// 5. Query check-ins today for this room and active schedule
			const checkedInRows = await db
				.select({ studentId: attendance.studentId })
				.from(attendance)
				.where(
					and(
						eq(attendance.roomId, room.id),
						eq(attendance.sessionDate, sessionDate),
						or(
							eq(attendance.classScheduleId, activeSchedule.id),
							isNull(attendance.classScheduleId),
						),
					),
				);

			const checkedInSet = new Set(checkedInRows.map((r) => r.studentId));
			const pending = enrolled.filter((s) => !checkedInSet.has(s.id));
			const total = enrolled.length;
			const present = total - pending.length;

			return {
				room: input.room,
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
			}),
		)
		.mutation(async ({ input }) => {
			const normalizedRoom = input.room.toLowerCase();
			const sessionDate = currentSessionDate();
			const todayDay = currentDayOfWeek();

			const [room] = await db
				.select({ id: rooms.id })
				.from(rooms)
				.where(eq(rooms.code, normalizedRoom))
				.limit(1);

			if (!room) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: `Room ${input.room.toUpperCase()} not found`,
				});
			}

			const [student] = await db
				.select()
				.from(students)
				.where(
					or(
						eq(students.id, input.studentId),
						eq(students.studentId, input.studentId),
					),
				)
				.limit(1);

			if (!student) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Student not found",
				});
			}

			// Resolve active schedule for this room
			const schedules = await db
				.select({
					id: classSchedules.id,
					courseCode: courses.code,
					dayOfWeek: classSchedules.dayOfWeek,
				})
				.from(classSchedules)
				.innerJoin(courses, eq(courses.id, classSchedules.courseId))
				.where(eq(classSchedules.roomId, room.id));

			const activeSchedule =
				(input.scheduleId
					? schedules.find((s) => s.id === input.scheduleId)
					: undefined) ??
				schedules.find(
					(s) => s.dayOfWeek.toLowerCase() === todayDay.toLowerCase(),
				) ??
				schedules[0];

			// If room has an active class schedule, verify student enrollment
			if (activeSchedule) {
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
						message: `${student.name} is not enrolled in ${activeSchedule.courseCode} in Room ${input.room.toUpperCase()}`,
					});
				}
			}

			// Check if already checked in today for this room & schedule
			const [alreadyCheckedIn] = await db
				.select({ id: attendance.id })
				.from(attendance)
				.where(
					and(
						eq(attendance.studentId, student.id),
						eq(attendance.roomId, room.id),
						eq(attendance.sessionDate, sessionDate),
						activeSchedule
							? or(
									eq(attendance.classScheduleId, activeSchedule.id),
									isNull(attendance.classScheduleId),
								)
							: undefined,
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
					classScheduleId: activeSchedule?.id ?? null,
					sessionDate,
				})
				.onConflictDoNothing()
				.returning({ checkedInAt: attendance.checkedInAt });

			return {
				studentId: student.studentId,
				name: student.name,
				room: input.room,
				checkedInAt: row?.checkedInAt ?? new Date(),
			};
		}),
} satisfies TRPCRouterRecord;


export const trpcRouter = createTRPCRouter({
	attendance: attendanceRouter,
});
export type TRPCRouter = typeof trpcRouter;
