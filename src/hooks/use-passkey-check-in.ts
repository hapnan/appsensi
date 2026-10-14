import {
	browserSupportsWebAuthn,
	startAuthentication,
} from "@simplewebauthn/browser";
import { useMutation } from "@tanstack/react-query";
import type { inferRouterOutputs } from "@trpc/server";
import { useCallback } from "react";
import { useTRPC } from "#/integrations/trpc/react";
import type { TRPCRouter } from "#/integrations/trpc/router";

type RouterOutputs = inferRouterOutputs<TRPCRouter>;
export type Roster = RouterOutputs["attendance"]["roster"];
export type PendingStudent = Roster["pending"][number];
export type CheckInResult = RouterOutputs["attendance"]["checkIn"];
export type CheckInMode = "register" | "authenticate";

/**
 * Runs the passkey check-in ceremony:
 * If an external WebAuthn server URL is configured (`VITE_WEBAUTHN_SERVER_URL`),
 * it delegates option generation and verification to that separate server.
 * Otherwise, it executes the biometric ceremony verification delay and
 * records attendance in the database.
 */
export function usePasskeyCheckIn() {
	const trpc = useTRPC();
	const { mutateAsync: recordAttendance } = useMutation(
		trpc.attendance.checkIn.mutationOptions(),
	);

	return useCallback(
		async ({
			room,
			studentId,
			scheduleId,
			onMode,
		}: {
			room: string;
			studentId: string;
			scheduleId?: string;
			onMode?: (mode: CheckInMode) => void;
		}): Promise<CheckInResult> => {
			const webauthnServerUrl = import.meta.env.VITE_WEBAUTHN_SERVER_URL;

			if (webauthnServerUrl) {
				if (!browserSupportsWebAuthn()) {
					throw new Error("This browser does not support passkeys.");
				}

				onMode?.("authenticate");
				const optionsRes = await fetch(
					`${webauthnServerUrl}/login/begin`,
					{
						method: "POST",
						headers: { "Content-Type": "application/json" },
						body: JSON.stringify({  }),
					},
				);
				if (!optionsRes.ok) {
					throw new Error(
						"Failed to get authentication options from WebAuthn server.",
					);
				}
				const options = await optionsRes.json();

				const authResponse = await startAuthentication({
					optionsJSON: options,
				});

				const verifyRes = await fetch(
					`${webauthnServerUrl}/login/finish`,
					{
						method: "POST",
						headers: { "Content-Type": "application/json" },
						body: JSON.stringify({ studentId, response: authResponse }),
					},
				);
				if (!verifyRes.ok) {
					throw new Error(
						"Passkey verification failed on external WebAuthn server.",
					);
				}
			} else {
				// Standalone / development mode before external WebAuthn server is configured.
				onMode?.("authenticate");
				await new Promise((resolve) => setTimeout(resolve, 1500));
			}

			// Record attendance in the attendance database
			return recordAttendance({ room, studentId, scheduleId });
		},
		[recordAttendance],
	);
}

/** Turns WebAuthn / tRPC errors into a short, human-friendly message. */
export function describeCheckInError(error: unknown) {
	if (error instanceof Error) {
		switch (error.name) {
			case "NotAllowedError":
				return "The passkey prompt was cancelled or timed out.";
			case "AbortError":
				return "The passkey request was cancelled.";
			case "InvalidStateError":
				return "This device already has a passkey for this student.";
			case "SecurityError":
				return "Passkeys require HTTPS (or localhost) on a matching domain.";
		}
		if (error.message) return error.message;
	}
	return "Check-in failed. Please try again.";
}
