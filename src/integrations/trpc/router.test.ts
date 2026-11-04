import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import {
	createTRPCClient,
	httpBatchStreamLink,
	TRPCClientError,
} from "@trpc/client";
import { TRPCError } from "@trpc/server";
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import superjson from "superjson";
import {
	DEFAULT_WEBAUTHN_SERVER_URL,
	getWebAuthnServerUrl,
} from "#/lib/webauthn";
import { type TRPCRouter, trpcRouter } from "./router";

interface RecordedRequest {
	method: string;
	url: string;
	headers: Headers;
	bodyText: string | null;
}

const SAMPLE_SCHEDULE_ID = "01960000-0000-7000-8000-000000000001";
const SAMPLE_STUDENT_UUID = "01960000-0000-7000-8000-000000000002";
const SAMPLE_USER_UUID = "01960000-0000-7000-8000-000000000003";

describe("tRPC appsensi-server REST wrapper", () => {
	const originalFetch = globalThis.fetch;
	const originalServerUrl = process.env.VITE_WEBAUTHN_SERVER_URL;
	let recorded: RecordedRequest[] = [];
	let upstreamHandler: (req: RecordedRequest) => Response | Promise<Response>;

	beforeEach(() => {
		recorded = [];
		delete process.env.VITE_WEBAUTHN_SERVER_URL;

		upstreamHandler = () =>
			Response.json(
				{ error: "Unhandled mock route", code: "NOT_FOUND" },
				{ status: 404 },
			);

		const mockFetch = async (
			input: RequestInfo | URL,
			init?: RequestInit,
		): Promise<Response> => {
			const request = new Request(input, init);
			const bodyText =
				request.method === "GET" || request.method === "HEAD"
					? null
					: await request.text();
			const entry: RecordedRequest = {
				method: request.method,
				url: request.url,
				headers: request.headers,
				bodyText,
			};
			recorded.push(entry);
			return upstreamHandler(entry);
		};

		globalThis.fetch = Object.assign(mockFetch, {
			preconnect: originalFetch.preconnect,
		});
	});

	afterEach(() => {
		globalThis.fetch = originalFetch;
		if (originalServerUrl === undefined) {
			delete process.env.VITE_WEBAUTHN_SERVER_URL;
		} else {
			process.env.VITE_WEBAUTHN_SERVER_URL = originalServerUrl;
		}
	});

	function createEndToEndClient() {
		return createTRPCClient<TRPCRouter>({
			links: [
				httpBatchStreamLink({
					transformer: superjson,
					url: "http://appsensi.local/api/trpc",
					fetch: (input, init) =>
						fetchRequestHandler({
							req: new Request(input, init),
							router: trpcRouter,
							endpoint: "/api/trpc",
						}),
				}),
			],
		});
	}

	describe("getWebAuthnServerUrl", () => {
		it("defaults to http://localhost:8080 when VITE_WEBAUTHN_SERVER_URL is unset", () => {
			expect(getWebAuthnServerUrl()).toBe(DEFAULT_WEBAUTHN_SERVER_URL);
			expect(getWebAuthnServerUrl()).toBe("http://localhost:8080");
		});

		it("trims whitespace and trailing slashes from VITE_WEBAUTHN_SERVER_URL", () => {
			process.env.VITE_WEBAUTHN_SERVER_URL =
				"  https://passkey.hapnanarsad.id///  ";
			expect(getWebAuthnServerUrl()).toBe("https://passkey.hapnanarsad.id");
		});
	});

	describe("attendance procedures", () => {
		it("fetches GET /attendance/demo-catalog and validates DemoCatalogRoom[]", async () => {
			process.env.VITE_WEBAUTHN_SERVER_URL = "http://backend.test:8080/";
			upstreamHandler = () =>
				Response.json([
					{
						code: "h.2.4",
						floor: 2,
						roomNumber: "4",
						buildingCode: "H",
						buildingName: "Gedung H",
						facultyCode: "FCS",
						facultyName: "Fakultas Ilmu Komputer",
						schedules: [
							{
								id: SAMPLE_SCHEDULE_ID,
								courseCode: "FCS-101",
								courseName: "Distributed Systems",
								section: "A",
								dayOfWeek: "Wednesday",
								startTime: "09:00",
								endTime: "11:30",
							},
						],
					},
				]);

			const client = createEndToEndClient();
			const rooms = await client.attendance.demoCatalog.query();

			expect(recorded).toHaveLength(1);
			expect(recorded[0]?.method).toBe("GET");
			expect(recorded[0]?.url).toBe(
				"http://backend.test:8080/attendance/demo-catalog",
			);
			expect(rooms).toHaveLength(1);
			expect(rooms[0]?.code).toBe("h.2.4");
			expect(rooms[0]?.schedules[0]?.id).toBe(SAMPLE_SCHEDULE_ID);
		});

		it("fetches GET /attendance/roster normalizing room code and omitting undefined optional params", async () => {
			upstreamHandler = () =>
				Response.json({
					room: "h.2.4",
					sessionDate: "2026-11-04",
					dayOfWeek: "Wednesday",
					schedule: {
						id: SAMPLE_SCHEDULE_ID,
						courseCode: "FCS-101",
						courseName: "Distributed Systems",
						credits: 3,
						section: "A",
						instructor: "Dr. Sari",
						dayOfWeek: "Wednesday",
						startTime: "09:00",
						endTime: "11:30",
						academicTerm: "2026/2027-Odd",
					},
					availableSchedules: [
						{
							id: SAMPLE_SCHEDULE_ID,
							courseCode: "FCS-101",
							courseName: "Distributed Systems",
							section: "A",
							dayOfWeek: "Wednesday",
							startTime: "09:00",
							endTime: "11:30",
						},
					],
					total: 2,
					present: 1,
					pending: [
						{
							id: SAMPLE_STUDENT_UUID,
							studentId: "STU-FCS-001",
							username: "STU-FCS-001",
							name: "Alice Pratama",
							department: "Computer Science",
							photoUrl: "/students/student-1.png",
							isRegistered: true,
						},
					],
				});

			const client = createEndToEndClient();
			const roster = await client.attendance.roster.query({
				room: "H.2.4",
			});

			expect(recorded).toHaveLength(1);
			expect(recorded[0]?.method).toBe("GET");
			expect(recorded[0]?.url).toBe(
				"http://localhost:8080/attendance/roster?room=h.2.4",
			);
			expect(roster.total).toBe(2);
			expect(roster.present).toBe(1);
			expect(roster.pending[0]?.studentId).toBe("STU-FCS-001");

			// With explicit scheduleId and date
			await client.attendance.roster.query({
				room: "h.2.4",
				scheduleId: SAMPLE_SCHEDULE_ID,
				date: "2026-11-04",
			});
			expect(recorded[1]?.url).toBe(
				`http://localhost:8080/attendance/roster?room=h.2.4&scheduleId=${SAMPLE_SCHEDULE_ID}&date=2026-11-04`,
			);
		});

		it("posts to POST /attendance/check-in and deserializes checkedInAt with timezone offset into Date", async () => {
			upstreamHandler = () =>
				Response.json({
					id: SAMPLE_STUDENT_UUID,
					studentId: "STU-FCS-001",
					name: "Alice Pratama",
					room: "h.2.4",
					sessionDate: "2026-11-04",
					checkedInAt: "2026-11-04T16:15:30.123456+07:00",
				});

			const client = createEndToEndClient();
			const result = await client.attendance.checkIn.mutate({
				room: "H.2.4",
				studentId: SAMPLE_STUDENT_UUID,
				scheduleId: SAMPLE_SCHEDULE_ID,
				date: "2026-11-04",
			});

			expect(recorded).toHaveLength(1);
			expect(recorded[0]?.method).toBe("POST");
			expect(recorded[0]?.url).toBe(
				"http://localhost:8080/attendance/check-in",
			);
			expect(recorded[0]?.headers.get("content-type")).toBe("application/json");
			expect(JSON.parse(recorded[0]?.bodyText ?? "{}")).toEqual({
				room: "h.2.4",
				studentId: SAMPLE_STUDENT_UUID,
				scheduleId: SAMPLE_SCHEDULE_ID,
				date: "2026-11-04",
			});

			expect(result.checkedInAt).toBeInstanceOf(Date);
			expect(result.checkedInAt.toISOString()).toBe("2026-11-04T09:15:30.123Z");
		});
	});

	describe("registration procedures", () => {
		it("fetches GET /registration/list and converts nullable createdAt timestamps into Date | null", async () => {
			upstreamHandler = () =>
				Response.json([
					{
						id: SAMPLE_STUDENT_UUID,
						name: "Alice Pratama",
						username: "STU-FCS-001",
						department: "Computer Science",
						userId: SAMPLE_USER_UUID,
						email: "alice@campus.edu",
						createdAt: "2026-11-04T08:30:00Z",
						isRegistered: true,
					},
					{
						id: "01960000-0000-7000-8000-000000000009",
						name: "Budi Santoso",
						username: "STU-FCS-002",
						department: null,
						userId: null,
						email: null,
						createdAt: null,
						isRegistered: false,
					},
				]);

			const client = createEndToEndClient();
			const rows = await client.registration.list.query();

			expect(recorded[0]?.method).toBe("GET");
			expect(recorded[0]?.url).toBe("http://localhost:8080/registration/list");
			expect(rows).toHaveLength(2);
			expect(rows[0]?.createdAt).toBeInstanceOf(Date);
			expect(rows[0]?.createdAt?.toISOString()).toBe(
				"2026-11-04T08:30:00.000Z",
			);
			expect(rows[1]?.createdAt).toBeNull();
		});

		it("posts to POST /registration/link-student and returns parsed Date", async () => {
			upstreamHandler = () =>
				Response.json({
					userId: SAMPLE_USER_UUID,
					email: "alice@campus.edu",
					createdAt: "2026-11-04T09:00:00+07:00",
				});

			const client = createEndToEndClient();
			const linked = await client.registration.linkStudentUser.mutate({
				studentId: SAMPLE_STUDENT_UUID,
				username: "STU-FCS-001",
			});

			expect(recorded[0]?.method).toBe("POST");
			expect(recorded[0]?.url).toBe(
				"http://localhost:8080/registration/link-student",
			);
			expect(JSON.parse(recorded[0]?.bodyText ?? "{}")).toEqual({
				studentId: SAMPLE_STUDENT_UUID,
				username: "STU-FCS-001",
			});
			expect(linked.userId).toBe(SAMPLE_USER_UUID);
			expect(linked.createdAt).toBeInstanceOf(Date);
			expect(linked.createdAt.toISOString()).toBe("2026-11-04T02:00:00.000Z");
		});

		it("posts to POST /registration/cleanup-incomplete and returns cleaned status", async () => {
			upstreamHandler = () => Response.json({ cleaned: true });

			const client = createEndToEndClient();
			const res = await client.registration.cleanupIncompleteUser.mutate({
				username: "STU-FCS-001",
			});

			expect(recorded[0]?.method).toBe("POST");
			expect(recorded[0]?.url).toBe(
				"http://localhost:8080/registration/cleanup-incomplete",
			);
			expect(JSON.parse(recorded[0]?.bodyText ?? "{}")).toEqual({
				username: "STU-FCS-001",
			});
			expect(res).toEqual({ cleaned: true });
		});
	});

	describe("error translation & contract safety", () => {
		it.each([
			{
				status: 404,
				code: "NOT_FOUND",
				message: "Room H.9.9 not found",
			},
			{
				status: 412,
				code: "PRECONDITION_FAILED",
				message: "Alice Pratama has not registered a passkey yet",
			},
			{
				status: 400,
				code: "BAD_REQUEST",
				message: "Alice Pratama is not enrolled in FCS-101 in Room H.2.4",
			},
			{
				status: 409,
				code: "CONFLICT",
				message: "Alice Pratama is already checked in",
			},
		] as const)("maps HTTP $status ($code) from appsensi-server into TRPCClientError", async ({
			status,
			code,
			message,
		}) => {
			upstreamHandler = () =>
				Response.json({ error: message, code }, { status });

			const client = createEndToEndClient();
			let caught: unknown;
			try {
				await client.attendance.checkIn.mutate({
					room: "h.2.4",
					studentId: SAMPLE_STUDENT_UUID,
				});
			} catch (err) {
				caught = err;
			}

			expect(caught).toBeInstanceOf(TRPCClientError);
			const trpcErr = caught as TRPCClientError<TRPCRouter>;
			expect(trpcErr.message).toBe(message);
			expect(trpcErr.data?.code).toBe(code);
		});

		it("falls back to HTTP status mapping when upstream returns a non-JSON error body", async () => {
			upstreamHandler = () =>
				new Response("502 Bad Gateway", {
					status: 502,
					headers: { "Content-Type": "text/plain" },
				});

			const caller = trpcRouter.createCaller({});
			let caught: unknown;
			try {
				await caller.attendance.demoCatalog();
			} catch (err) {
				caught = err;
			}

			expect(caught).toBeInstanceOf(TRPCError);
			const trpcErr = caught as TRPCError;
			expect(trpcErr.code).toBe("BAD_GATEWAY");
			expect(trpcErr.message).toBe("Failed to load demo catalog (HTTP 502)");
		});

		it("surfaces a clear INTERNAL_SERVER_ERROR when appsensi-server is unreachable", async () => {
			process.env.VITE_WEBAUTHN_SERVER_URL = "http://127.0.0.1:8080";
			globalThis.fetch = Object.assign(
				async (): Promise<Response> => {
					throw new TypeError("fetch failed");
				},
				{ preconnect: originalFetch.preconnect },
			);

			const caller = trpcRouter.createCaller({});
			await expect(caller.registration.list()).rejects.toMatchObject({
				code: "INTERNAL_SERVER_ERROR",
				message:
					"Cannot reach appsensi-server at http://127.0.0.1:8080. Ensure the server is running.",
			});
		});

		it("rejects malformed upstream payloads that violate the Zod output schema", async () => {
			upstreamHandler = () =>
				Response.json([
					{
						code: "h.2.4",
						// missing required fields like floor, roomNumber, schedules
					},
				]);

			const caller = trpcRouter.createCaller({});
			await expect(caller.attendance.demoCatalog()).rejects.toMatchObject({
				code: "INTERNAL_SERVER_ERROR",
				message:
					"Unexpected response format from appsensi-server (/attendance/demo-catalog)",
			});
		});
	});
});
