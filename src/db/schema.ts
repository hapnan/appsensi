import {
	boolean,
	date,
	index,
	integer,
	bytea,
	pgTable,
	text,
	timestamp,
	uniqueIndex,
	uuid,
	bigint,
} from "drizzle-orm/pg-core";
import { sql } from 'drizzle-orm' 

/** Users table for WebAuthn authentication */
export const users = pgTable("users", {
	id: uuid("id").defaultRandom().primaryKey(),
	email: text("email").notNull().unique(),
	username: text("username").notNull().unique(),
	displayName: text("display_name"),
	createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true }).$onUpdate(() => new Date()),
});


export const webAuthnUser = pgTable("webauthn_users", {
	id: uuid("id").defaultRandom().primaryKey(),
	userId: uuid("user_id")
		.notNull()
		.references(() => users.id, { onDelete: "cascade" }),
	rpId: text("rp_id").notNull(),
	handler: bytea("handler").notNull(),
	createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
	},
	(t) => [uniqueIndex("webauthn_users_user_rp_idx").on(t.userId, t.rpId), uniqueIndex("webauthn_users_handler_idx").on(t.rpId, t.handler)],
);

/** WebAuthn credentials for Users */
export const credentials = pgTable(
	"credentials",
	{
		id: uuid("id", ).default(sql`uuidv7()`).primaryKey(),
		userId: uuid("user_id")
		.notNull()	
		.references(() => users.id, { onDelete: "cascade" }),
		credentialId: bytea("credential_id").notNull().unique(), // stored as base64 string or bytea in postgres
		aaguid: bytea("aaguid").notNull(),
		publicKey: bytea("public_key").notNull(),
		attestationType: text("attestation_type").notNull(),
		attestationFormat: text("attestation_format").notNull(),
		attestation: bytea("attestation"),
		transport: text("transport").notNull(),
		signCount: bigint("sign_count", { mode: "number" }).notNull().default(0),
		cloneWarning: boolean("clone_warning").notNull().default(false),
		attatchment: text("attachment").notNull(),
		flags: bytea("flags"),
		presence: boolean("presence").notNull().default(false),
		verified: boolean("verified").notNull().default(false),
		backupEligible: boolean("backup_eligible").notNull().default(false),
		backupState: boolean("backup_state").notNull().default(false),
		extensions: bytea("extensions").$default(() => sql`NULL`),
		createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
		lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
	},
	(t) => [uniqueIndex("credentials_user_credential_idx").on(t.userId, t.credentialId), index("credentials_user_idx").on(t.userId)]
);

/** Campus Buildings (A through I) */
export const buildings = pgTable("buildings", {
	id: uuid("id").defaultRandom().primaryKey(),
	code: text("code").notNull().unique(), // 'A', 'B', 'C', ..., 'I'
	name: text("name").notNull(), // e.g. "Building H"
	purpose: text("purpose").notNull(), // Purpose / Faculty / Unit description
	hasClasses: boolean("has_classes").notNull().default(true),
	totalFloors: integer("total_floors").notNull().default(3),
});

/** Specific Classrooms & Laboratories inside Buildings */
export const rooms = pgTable(
	"rooms",
	{
		id: uuid("id").defaultRandom().primaryKey(),
		code: text("code").notNull().unique(), // 'h.2.4' (normalized lowercase)
		buildingId: uuid("building_id")
			.notNull()
			.references(() => buildings.id, { onDelete: "cascade" }),
		floor: integer("floor").notNull(),
		roomNumber: text("room_number").notNull(),
		name: text("name"), // e.g. "Lecture Hall 204"
		capacity: integer("capacity"),
	},
	(t) => [index("rooms_building_idx").on(t.buildingId)],
);

/** Students that can check in. */
export const students = pgTable("students", {
	id: uuid("id").defaultRandom().primaryKey(),
	studentId: text("student_id").notNull().unique(), // e.g. "STU-882194"
	name: text("name").notNull(),
	department: text("department"),
	photoUrl: text("photo_url"),
	userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
	createdAt: timestamp("created_at", { withTimezone: true })
		.defaultNow()
		.notNull(),
}, (t) => [index("students_user_idx").on(t.userId)]);

/** Academic Faculties / Units */
export const faculties = pgTable(
	"faculties",
	{
		id: uuid("id").defaultRandom().primaryKey(),
		code: text("code").notNull().unique(), // e.g. 'FCS', 'FEB', 'FEE', 'FCS-CULT'
		name: text("name").notNull(), // e.g. "Faculty of Computer Science"
		buildingId: uuid("building_id").references(() => buildings.id, {
			onDelete: "set null",
		}),
		createdAt: timestamp("created_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
	},
	(t) => [index("faculties_building_idx").on(t.buildingId)],
);

/** Course Offerings by Faculty */
export const courses = pgTable(
	"courses",
	{
		id: uuid("id").defaultRandom().primaryKey(),
		code: text("code").notNull().unique(), // e.g. "CS201", "EC102"
		name: text("name").notNull(), // e.g. "Distributed Systems & Cloud Computing"
		credits: integer("credits").notNull().default(3), // Credit weight / SKS
		description: text("description"),
		facultyId: uuid("faculty_id")
			.references(() => faculties.id, { onDelete: "cascade" }),
		createdAt: timestamp("created_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
	},
	(t) => [index("courses_faculty_idx").on(t.facultyId)],
);

/** Scheduled Course Sections / Class Meetings in Specific Rooms */
export const classSchedules = pgTable(
	"class_schedules",
	{
		id: uuid("id").defaultRandom().primaryKey(),
		courseId: uuid("course_id")
			.references(() => courses.id, { onDelete: "cascade" }),
		roomId: uuid("room_id")
			.references(() => rooms.id, { onDelete: "cascade" }),
		section: text("section").default("A"), // e.g. "A", "B", "01"
		instructor: text("instructor"),
		dayOfWeek: text("day_of_week"), // "Monday", "Tuesday", etc.
		startTime: text("start_time"), // "09:00"
		endTime: text("end_time"), // "11:30"
		academicTerm: text("academic_term"), // e.g. "2026/2027-Odd"
		maxCapacity: integer("max_capacity"),
		createdAt: timestamp("created_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
	},
	(t) => [
		uniqueIndex("class_schedules_course_sec_term_idx").on(
			t.courseId,
			t.section,
			t.academicTerm,
		),
		index("class_schedules_course_idx").on(t.courseId),
		index("class_schedules_room_idx").on(t.roomId),
		index("class_schedules_day_room_idx").on(t.roomId, t.dayOfWeek),
	],
);


/** Student Class Schedules / Enrollments */
export const studentSchedules = pgTable(
	"student_schedules",
	{
		id: uuid("id").defaultRandom().primaryKey(),
		studentId: uuid("student_id")
			.notNull()
			.references(() => students.id, { onDelete: "cascade" }),
		classScheduleId: uuid("class_schedule_id")
			.notNull()
			.references(() => classSchedules.id, { onDelete: "cascade" }),
		status: text("status").notNull().default("enrolled"), // "enrolled" | "dropped" | "completed"
		enrolledAt: timestamp("enrolled_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
	},
	(t) => [
		uniqueIndex("student_schedule_unique_idx").on(
			t.studentId,
			t.classScheduleId,
		),
		index("student_schedules_student_idx").on(t.studentId),
		index("student_schedules_class_idx").on(t.classScheduleId),
	],
);

/** One row per student, per room, per day. */
export const attendance = pgTable(
	"attendance",
	{
		id: uuid("id").defaultRandom().primaryKey(),
		studentId: uuid("student_id")
			.notNull()
			.references(() => students.id, { onDelete: "cascade" }),
		roomId: uuid("room_id")
			.notNull()
			.references(() => rooms.id, { onDelete: "cascade" }),
		classScheduleId: uuid("class_schedule_id").references(
			() => classSchedules.id,
			{ onDelete: "set null" },
		),
		sessionDate: date("session_date", { mode: "string" }).notNull(),
		checkedInAt: timestamp("checked_in_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
	},
	(t) => [
		uniqueIndex("attendance_student_room_day_idx").on(
			t.studentId,
			t.roomId,
			t.sessionDate,
		),
		index("attendance_room_day_idx").on(t.roomId, t.sessionDate),
		index("attendance_class_schedule_idx").on(t.classScheduleId),
	],
);

export type Building = typeof buildings.$inferSelect;
export type Room = typeof rooms.$inferSelect;
export type Student = typeof students.$inferSelect;
export type Faculty = typeof faculties.$inferSelect;
export type Course = typeof courses.$inferSelect;
export type ClassSchedule = typeof classSchedules.$inferSelect;
export type StudentSchedule = typeof studentSchedules.$inferSelect;
export type Attendance = typeof attendance.$inferSelect;
export type User = typeof users.$inferSelect;
export type Credential = typeof credentials.$inferSelect;
