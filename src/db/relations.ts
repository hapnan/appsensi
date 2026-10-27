import { defineRelations } from "drizzle-orm";
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
	webAuthnUser,
} from "./schema.ts";

export const relations = defineRelations(
	{
		users,
		webAuthnUser,
		credentials,
		buildings,
		rooms,
		students,
		faculties,
		courses,
		classSchedules,
		studentSchedules,
		attendance,
	},
	(r) => ({
		users: {
			webAuthnUsers: r.many.webAuthnUser(),
			credentials: r.many.credentials(),
			students: r.many.students(),
		},
		webAuthnUser: {
			users: r.one.users({
				from: r.webAuthnUser.userId,
				to: r.users.id,
			}),
		},
		credentials: {
			users: r.one.users({
				from: r.credentials.userId,
				to: r.users.id,
			}),
		},
		buildings: {
			rooms: r.many.rooms(),
			faculties: r.many.faculties(),
		},
		rooms: {
			buildings: r.one.buildings({
				from: r.rooms.buildingId,
				to: r.buildings.id,
			}),
			classSchedules: r.many.classSchedules(),
			attendance: r.many.attendance(),
			studentSchedules: r.many.studentSchedules({
				from: r.rooms.id.through(r.classSchedules.roomId),
				to: r.studentSchedules.classScheduleId.through(r.classSchedules.id),
			}),
		},
		students: {
			users: r.one.users({
				from: r.students.userId,
				to: r.users.id,
			}),
			studentSchedules: r.many.studentSchedules(),
			attendance: r.many.attendance(),
		},
		faculties: {
			buildings: r.one.buildings({
				from: r.faculties.buildingId,
				to: r.buildings.id,
			}),
			courses: r.many.courses(),
		},
		courses: {
			faculties: r.one.faculties({
				from: r.courses.facultyId,
				to: r.faculties.id,
			}),
			classSchedules: r.many.classSchedules(),
			studentSchedules: r.many.studentSchedules({
				from: r.courses.id.through(r.classSchedules.courseId),
				to: r.studentSchedules.classScheduleId.through(r.classSchedules.id),
			}),
		},
		classSchedules: {
			courses: r.one.courses({
				from: r.classSchedules.courseId,
				to: r.courses.id,
			}),
			rooms: r.one.rooms({
				from: r.classSchedules.roomId,
				to: r.rooms.id,
			}),
			studentSchedules: r.many.studentSchedules(),
			attendance: r.many.attendance(),
		},
		studentSchedules: {
			students: r.one.students({
				from: r.studentSchedules.studentId,
				to: r.students.id,
			}),
			classSchedules: r.one.classSchedules({
				from: r.studentSchedules.classScheduleId,
				to: r.classSchedules.id,
			}),
		},
		attendance: {
			students: r.one.students({
				from: r.attendance.studentId,
				to: r.students.id,
			}),
			rooms: r.one.rooms({
				from: r.attendance.roomId,
				to: r.rooms.id,
			}),
			classSchedules: r.one.classSchedules({
				from: r.attendance.classScheduleId,
				to: r.classSchedules.id,
			}),
		},
	}),
);
