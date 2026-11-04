import type { TRPCRouterRecord } from "@trpc/server";
import { z } from "zod";
import { sessionDateSchema } from "#/lib/date";
import { roomCodeSchema } from "#/lib/room";
import { createTRPCRouter, publicProcedure } from "./init";
import { fetchAppsensiServer } from "./server-client";

/** Parses RFC3339 / ISO-8601 timestamp strings (with `Z` or timezone offsets) into `Date` instances. */
export const isoTimestampSchema = z.union([
	z.date(),
	z.iso.datetime({ offset: true }).transform((value) => new Date(value)),
]);

export const enrolledStudentSchema = z.object({
	id: z.uuid(),
	studentId: z.string(),
	username: z.string(),
	name: z.string(),
	department: z.string().nullable(),
	photoUrl: z.string().nullable(),
	isRegistered: z.boolean(),
});

export const scheduleSummarySchema = z.object({
	id: z.uuid(),
	courseCode: z.string(),
	courseName: z.string(),
	section: z.string(),
	dayOfWeek: z.string(),
	startTime: z.string(),
	endTime: z.string(),
});

export const activeScheduleDetailsSchema = scheduleSummarySchema.extend({
	credits: z.number().int(),
	instructor: z.string(),
	academicTerm: z.string(),
});

export const rosterResultSchema = z.object({
	room: z.string(),
	sessionDate: sessionDateSchema,
	dayOfWeek: z.string(),
	schedule: activeScheduleDetailsSchema.nullable(),
	availableSchedules: z.array(scheduleSummarySchema),
	total: z.number().int().nonnegative(),
	present: z.number().int().nonnegative(),
	pending: z.array(enrolledStudentSchema),
});

export const demoCatalogRoomSchema = z.object({
	code: z.string(),
	floor: z.number().int(),
	roomNumber: z.string(),
	buildingCode: z.string(),
	buildingName: z.string(),
	facultyCode: z.string().nullable(),
	facultyName: z.string().nullable(),
	schedules: z.array(scheduleSummarySchema),
});

export const demoCatalogListSchema = z.array(demoCatalogRoomSchema);

export const checkInResultSchema = z.object({
	id: z.uuid(),
	studentId: z.string(),
	name: z.string(),
	room: z.string(),
	sessionDate: sessionDateSchema,
	checkedInAt: isoTimestampSchema,
});

export const registrationStudentRowSchema = z.object({
	id: z.uuid(),
	name: z.string(),
	username: z.string(),
	department: z.string().nullable(),
	userId: z.uuid().nullable(),
	email: z.string().nullable(),
	createdAt: isoTimestampSchema.nullable(),
	isRegistered: z.boolean(),
});

export const registrationStudentListSchema = z.array(
	registrationStudentRowSchema,
);

export const linkStudentUserResultSchema = z.object({
	userId: z.uuid(),
	email: z.string(),
	createdAt: isoTimestampSchema,
});

export const cleanupIncompleteUserResultSchema = z.object({
	cleaned: z.boolean(),
});

export type EnrolledStudent = z.output<typeof enrolledStudentSchema>;
export type ScheduleSummary = z.output<typeof scheduleSummarySchema>;
export type ActiveScheduleDetails = z.output<
	typeof activeScheduleDetailsSchema
>;
export type RosterResult = z.output<typeof rosterResultSchema>;
export type DemoCatalogRoom = z.output<typeof demoCatalogRoomSchema>;
export type CheckInResult = z.output<typeof checkInResultSchema>;
export type RegistrationStudentRow = z.output<
	typeof registrationStudentRowSchema
>;
export type LinkStudentUserResult = z.output<
	typeof linkStudentUserResultSchema
>;
export type CleanupIncompleteUserResult = z.output<
	typeof cleanupIncompleteUserResultSchema
>;

const rosterInputSchema = z.object({
	room: roomCodeSchema,
	scheduleId: z.uuid().optional(),
	date: sessionDateSchema.optional(),
});

const checkInInputSchema = z.object({
	room: roomCodeSchema,
	studentId: z.string().min(1),
	scheduleId: z.uuid().optional(),
	date: sessionDateSchema.optional(),
});

const linkStudentUserInputSchema = z.object({
	studentId: z.uuid(),
	username: z.string().min(1),
});

const cleanupIncompleteUserInputSchema = z.object({
	username: z.string().min(1),
});

const attendanceRouter = {
	/** Lists all campus rooms that have scheduled courses along with their weekly class sessions. */
	demoCatalog: publicProcedure
		.output(demoCatalogListSchema)
		.query(({ signal }) =>
			fetchAppsensiServer({
				path: "/attendance/demo-catalog",
				schema: demoCatalogListSchema,
				fallbackError: "Failed to load demo catalog",
				signal,
			}),
		),

	/** Students enrolled in the room's active class schedule that still need to check in on the target date. */
	roster: publicProcedure
		.input(rosterInputSchema)
		.output(rosterResultSchema)
		.query(({ input, signal }) =>
			fetchAppsensiServer({
				path: "/attendance/roster",
				query: {
					room: input.room,
					scheduleId: input.scheduleId,
					date: input.date,
				},
				schema: rosterResultSchema,
				fallbackError: "Failed to load room roster",
				signal,
			}),
		),

	/** Record attendance for a student in a room for the active class schedule. */
	checkIn: publicProcedure
		.input(checkInInputSchema)
		.output(checkInResultSchema)
		.mutation(({ input, signal }) =>
			fetchAppsensiServer({
				method: "POST",
				path: "/attendance/check-in",
				body: {
					room: input.room,
					studentId: input.studentId,
					scheduleId: input.scheduleId,
					date: input.date,
				},
				schema: checkInResultSchema,
				fallbackError: "Failed to record attendance",
				signal,
			}),
		),
} satisfies TRPCRouterRecord;

const registrationRouter = {
	/** Lists all students paired with any matching account in the `users` table. */
	list: publicProcedure
		.output(registrationStudentListSchema)
		.query(({ signal }) =>
			fetchAppsensiServer({
				path: "/registration/list",
				schema: registrationStudentListSchema,
				fallbackError: "Failed to load registration list",
				signal,
			}),
		),

	/** Links `students.user_id` to `users.id` once WebAuthn registration finishes. */
	linkStudentUser: publicProcedure
		.input(linkStudentUserInputSchema)
		.output(linkStudentUserResultSchema)
		.mutation(({ input, signal }) =>
			fetchAppsensiServer({
				method: "POST",
				path: "/registration/link-student",
				body: {
					studentId: input.studentId,
					username: input.username,
				},
				schema: linkStudentUserResultSchema,
				fallbackError: "Failed to link student user",
				signal,
			}),
		),

	/**
	 * Removes an unverified `users` record (one with zero passkey credentials)
	 * if a WebAuthn ceremony is cancelled or fails after `/register/begin`.
	 */
	cleanupIncompleteUser: publicProcedure
		.input(cleanupIncompleteUserInputSchema)
		.output(cleanupIncompleteUserResultSchema)
		.mutation(({ input, signal }) =>
			fetchAppsensiServer({
				method: "POST",
				path: "/registration/cleanup-incomplete",
				body: {
					username: input.username,
				},
				schema: cleanupIncompleteUserResultSchema,
				fallbackError: "Failed to clean up incomplete user",
				signal,
			}),
		),
} satisfies TRPCRouterRecord;

export const trpcRouter = createTRPCRouter({
	attendance: attendanceRouter,
	registration: registrationRouter,
});
export type TRPCRouter = typeof trpcRouter;
