import type { PublicKeyCredentialRequestOptionsJSON } from "@simplewebauthn/browser";
import { useMutation } from "@tanstack/react-query";
import type { inferRouterOutputs } from "@trpc/server";
import { useCallback, useRef } from "react";
import { useTRPC } from "#/integrations/trpc/react";
import type { TRPCRouter } from "#/integrations/trpc/router";
import {
	ensurePasskeySupported,
	getPasskeyAssertion,
	getWebAuthnServerUrl,
	readServerError,
	signalUnknownPasskey,
	unwrapPublicKeyOptions,
} from "#/lib/webauthn";

type RouterOutputs = inferRouterOutputs<TRPCRouter>;
export type Roster = RouterOutputs["attendance"]["roster"];
export type PendingStudent = Roster["pending"][number];
export type CheckInResult = RouterOutputs["attendance"]["checkIn"];

/**
 * Runs the WebAuthn passkey login ceremony against `appsensi-server` and records attendance:
 * 1. Sends `{ username }` in the POST body to `/login/begin`
 * 2. Prompts the browser/device authenticator via `PublicKeyCredential.parseRequestOptionsFromJSON`
 *    and `navigator.credentials.get` (falling back to `@simplewebauthn/browser`)
 * 3. Sends `{ username, ...assertion }` in the POST body to `/login/finish`, invoking
 *    `PublicKeyCredential.signalUnknownCredential` with `optionsJSON.rpId` on HTTP 404
 * 4. Records attendance in PostgreSQL via `trpc.attendance.checkIn`
 */
export function usePasskeyCheckIn() {
	const trpc = useTRPC();
	const abortRef = useRef<AbortController | null>(null);
	const { mutateAsync: recordAttendance } = useMutation(
		trpc.attendance.checkIn.mutationOptions(),
	);

	return useCallback(
		async ({
			room,
			studentId,
			username,
			scheduleId,
			date,
		}: {
			room: string;
			studentId: string;
			username: string;
			scheduleId?: string;
			date?: string;
		}): Promise<CheckInResult> => {
			await ensurePasskeySupported();

			abortRef.current?.abort();
			const abortController = new AbortController();
			abortRef.current = abortController;

			const serverUrl = getWebAuthnServerUrl();

			const beginRes = await fetch(`${serverUrl}/login/begin`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ username }),
			});

			if (!beginRes.ok) {
				throw new Error(
					await readServerError(
						beginRes,
						"Failed to start passkey verification",
					),
				);
			}

			const rawOptions = (await beginRes.json()) as
				| { publicKey: PublicKeyCredentialRequestOptionsJSON }
				| PublicKeyCredentialRequestOptionsJSON;

			const optionsJSON = unwrapPublicKeyOptions(rawOptions);
			const assertion = await getPasskeyAssertion(
				optionsJSON,
				abortController.signal,
			);

			const finishRes = await fetch(`${serverUrl}/login/finish`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					username,
					...assertion,
				}),
			});

			if (!finishRes.ok) {
				if (finishRes.status === 404) {
					await signalUnknownPasskey({
						rpId: optionsJSON.rpId,
						credentialId: assertion.id,
					});
				}
				throw new Error(
					await readServerError(finishRes, "Passkey verification failed"),
				);
			}

			return recordAttendance({ room, studentId, scheduleId, date });
		},
		[recordAttendance],
	);
}

/** Turns WebAuthn / network / tRPC errors into a short, human-friendly message. */
export function describeCheckInError(error: unknown) {
	if (error instanceof Error) {
		switch (error.name) {
			case "NotAllowedError":
				return "The passkey prompt was cancelled or timed out.";
			case "AbortError":
				return "The passkey request was cancelled.";
			case "SecurityError":
				return "Passkeys require HTTPS (or localhost) on a matching domain.";
			case "TypeError":
				return `Cannot reach WebAuthn server at ${getWebAuthnServerUrl()}. Ensure the server is running and CORS is enabled.`;
		}
		if (error.message) return error.message;
	}
	return "Check-in failed. Please try again.";
}
