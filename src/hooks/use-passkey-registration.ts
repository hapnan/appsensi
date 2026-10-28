import {
	browserSupportsWebAuthn,
	type PublicKeyCredentialCreationOptionsJSON,
	startRegistration,
} from "@simplewebauthn/browser";
import { useMutation } from "@tanstack/react-query";
import type { inferRouterOutputs } from "@trpc/server";
import { useCallback } from "react";
import { useTRPC } from "#/integrations/trpc/react";
import type { TRPCRouter } from "#/integrations/trpc/router";
import {
	getWebAuthnServerUrl,
	readServerError,
	unwrapPublicKeyOptions,
} from "#/lib/webauthn";

export { getWebAuthnServerUrl };

type RouterOutputs = inferRouterOutputs<TRPCRouter>;
export type RegistrationStudent = RouterOutputs["registration"]["list"][number];
export type LinkStudentResult =
	RouterOutputs["registration"]["linkStudentUser"];

/**
 * Runs the WebAuthn passkey registration ceremony against `appsensi-server`:
 * 1. Sends `{ email, username }` in the POST body to `/register/begin`
 * 2. Prompts the browser/device authenticator via `startRegistration`
 * 3. Sends `{ email, username, ...credential }` in the POST body to `/register/finish`
 * 4. Synchronizes `students.user_id` with the newly created `users.id` row
 */
export function usePasskeyRegistration() {
	const trpc = useTRPC();
	const { mutateAsync: linkStudentUser } = useMutation(
		trpc.registration.linkStudentUser.mutationOptions(),
	);
	const { mutateAsync: cleanupIncompleteUser } = useMutation(
		trpc.registration.cleanupIncompleteUser.mutationOptions(),
	);

	return useCallback(
		async ({
			studentId,
			username,
			email,
			onCreatingPasskey,
		}: {
			studentId: string;
			username: string;
			email: string;
			onCreatingPasskey?: () => void;
		}): Promise<LinkStudentResult> => {
			if (!browserSupportsWebAuthn()) {
				throw new Error("This browser does not support WebAuthn passkeys.");
			}

			const serverUrl = getWebAuthnServerUrl();
			const normalizedEmail = email.trim();
			let beganOnServer = false;

			onCreatingPasskey?.();

			const beginRes = await fetch(`${serverUrl}/register/begin`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					email: normalizedEmail,
					username,
				}),
			});

			if (!beginRes.ok) {
				throw new Error(
					await readServerError(
						beginRes,
						"Failed to start passkey registration",
					),
				);
			}

			beganOnServer = true;

			try {
				const rawOptions = (await beginRes.json()) as
					| { publicKey: PublicKeyCredentialCreationOptionsJSON }
					| PublicKeyCredentialCreationOptionsJSON;

				const optionsJSON = unwrapPublicKeyOptions(rawOptions);

				const credential = await startRegistration({ optionsJSON });

				const finishRes = await fetch(`${serverUrl}/register/finish`, {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						email: normalizedEmail,
						username,
						...credential,
					}),
				});

				if (!finishRes.ok) {
					throw new Error(
						await readServerError(
							finishRes,
							"Failed to finish passkey registration",
						),
					);
				}
			} catch (error) {
				if (beganOnServer) {
					await cleanupIncompleteUser({ username }).catch(() => undefined);
				}
				throw error;
			}

			return linkStudentUser({ studentId, username });
		},
		[cleanupIncompleteUser, linkStudentUser],
	);
}

/** Formats WebAuthn / network / server errors into clear user-facing copy. */
export function describeRegistrationError(error: unknown) {
	if (error instanceof Error) {
		switch (error.name) {
			case "NotAllowedError":
				return "The passkey prompt was cancelled or timed out.";
			case "AbortError":
				return "The passkey registration request was cancelled.";
			case "InvalidStateError":
				return "A passkey is already saved on this device for this student.";
			case "SecurityError":
				return "Passkeys require HTTPS or localhost on a matching domain.";
			case "TypeError":
				return `Cannot reach WebAuthn server at ${getWebAuthnServerUrl()}. Ensure the server is running and CORS is enabled.`;
		}
		if (error.message) return error.message;
	}
	return "Registration failed. Please try again.";
}
