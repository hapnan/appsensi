import { TRPCError } from "@trpc/server";
import type { z } from "zod";
import { getWebAuthnServerUrl } from "#/lib/webauthn";

type TRPCErrorCode = TRPCError["code"];

const VALID_TRPC_ERROR_CODES: ReadonlySet<string> = new Set<TRPCErrorCode>([
	"PARSE_ERROR",
	"BAD_REQUEST",
	"INTERNAL_SERVER_ERROR",
	"NOT_IMPLEMENTED",
	"BAD_GATEWAY",
	"SERVICE_UNAVAILABLE",
	"GATEWAY_TIMEOUT",
	"UNAUTHORIZED",
	"PAYMENT_REQUIRED",
	"FORBIDDEN",
	"NOT_FOUND",
	"METHOD_NOT_SUPPORTED",
	"TIMEOUT",
	"CONFLICT",
	"PRECONDITION_FAILED",
	"PAYLOAD_TOO_LARGE",
	"UNSUPPORTED_MEDIA_TYPE",
	"UNPROCESSABLE_CONTENT",
	"TOO_MANY_REQUESTS",
	"CLIENT_CLOSED_REQUEST",
]);

function isTRPCErrorCode(value: unknown): value is TRPCErrorCode {
	return typeof value === "string" && VALID_TRPC_ERROR_CODES.has(value);
}

function httpStatusToTRPCCode(status: number): TRPCErrorCode {
	switch (status) {
		case 400:
			return "BAD_REQUEST";
		case 401:
			return "UNAUTHORIZED";
		case 402:
			return "PAYMENT_REQUIRED";
		case 403:
			return "FORBIDDEN";
		case 404:
			return "NOT_FOUND";
		case 405:
			return "METHOD_NOT_SUPPORTED";
		case 408:
			return "TIMEOUT";
		case 409:
			return "CONFLICT";
		case 412:
			return "PRECONDITION_FAILED";
		case 413:
			return "PAYLOAD_TOO_LARGE";
		case 415:
			return "UNSUPPORTED_MEDIA_TYPE";
		case 422:
			return "UNPROCESSABLE_CONTENT";
		case 429:
			return "TOO_MANY_REQUESTS";
		case 499:
			return "CLIENT_CLOSED_REQUEST";
		case 501:
			return "NOT_IMPLEMENTED";
		case 502:
			return "BAD_GATEWAY";
		case 503:
			return "SERVICE_UNAVAILABLE";
		case 504:
			return "GATEWAY_TIMEOUT";
		default:
			return "INTERNAL_SERVER_ERROR";
	}
}

export interface FetchAppsensiServerOptions<TSchema extends z.ZodType> {
	method?: "GET" | "POST";
	path: `/${string}`;
	query?: Record<string, string | undefined>;
	body?: Record<string, unknown>;
	schema: TSchema;
	fallbackError: string;
}

/**
 * Calls a JSON REST endpoint on `appsensi-server` (`VITE_WEBAUTHN_SERVER_URL`),
 * translating HTTP/network failures into `TRPCError` and validating the JSON
 * response with the provided Zod schema.
 */
export async function fetchAppsensiServer<TSchema extends z.ZodType>({
	method = "GET",
	path,
	query,
	body,
	schema,
	fallbackError,
}: FetchAppsensiServerOptions<TSchema>): Promise<z.output<TSchema>> {
	const baseUrl = getWebAuthnServerUrl();
	const url = new URL(`${baseUrl}${path}`);

	if (query) {
		for (const [key, value] of Object.entries(query)) {
			if (value !== undefined) {
				url.searchParams.set(key, value);
			}
		}
	}

	const headers: Record<string, string> = {
		Accept: "application/json",
	};

	let serializedBody: string | undefined;
	if (body !== undefined) {
		headers["Content-Type"] = "application/json";
		serializedBody = JSON.stringify(body);
	}

	let response: Response;
	try {
		response = await fetch(url, {
			method,
			headers,
			body: serializedBody,
		});
	} catch (error) {
		throw new TRPCError({
			code: "INTERNAL_SERVER_ERROR",
			message: `Cannot reach appsensi-server at ${baseUrl}. Ensure the server is running.`,
			cause: error,
		});
	}

	if (!response.ok) {
		let errorMessage = `${fallbackError} (HTTP ${response.status})`;
		let errorCode = httpStatusToTRPCCode(response.status);

		try {
			const payload = (await response.json()) as {
				error?: unknown;
				message?: unknown;
				code?: unknown;
			};
			if (
				typeof payload.error === "string" &&
				payload.error.trim().length > 0
			) {
				errorMessage = payload.error;
			} else if (
				typeof payload.message === "string" &&
				payload.message.trim().length > 0
			) {
				errorMessage = payload.message;
			}
			if (isTRPCErrorCode(payload.code)) {
				errorCode = payload.code;
			}
		} catch {
			// Ignore non-JSON error bodies and fall back to HTTP status mapping.
		}

		throw new TRPCError({
			code: errorCode,
			message: errorMessage,
		});
	}

	let rawData: unknown;
	try {
		rawData = await response.json();
	} catch (error) {
		throw new TRPCError({
			code: "INTERNAL_SERVER_ERROR",
			message: `Invalid JSON response from appsensi-server (${path})`,
			cause: error,
		});
	}

	const parsed = schema.safeParse(rawData);
	if (!parsed.success) {
		throw new TRPCError({
			code: "INTERNAL_SERVER_ERROR",
			message: `Unexpected response format from appsensi-server (${path})`,
			cause: parsed.error,
		});
	}

	return parsed.data;
}
