import type { PublicKeyCredentialCreationOptionsJSON } from "@simplewebauthn/browser";
import { useMutation } from "@tanstack/react-query";
import type { inferRouterOutputs } from "@trpc/server";
import { useCallback, useRef } from "react";
import { useTRPC } from "#/integrations/trpc/react";
import type { TRPCRouter } from "#/integrations/trpc/router";
import {
	createPasskeyCredential,
	ensurePasskeySupported,
	getWebAuthnServerUrl,
	readServerError,
	signalUnknownPasskey,
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
 * 2. Prompts the browser/device authenticator via `PublicKeyCredential.parseCreationOptionsFromJSON`
 *    and `navigator.credentials.create` (falling back to `@simplewebauthn/browser`)
 * 3. Sends `{ email, username, ...credential }` in the POST body to `/register/finish`
 *    and invokes `PublicKeyCredential.signalUnknownCredential` with `optionsJSON.rp.id` if verification fails
 * 4. Synchronizes `students.user_id` with the newly created `users.id` row
 */
export function usePasskeyRegistration() {
	const trpc = useTRPC();
	const abortRef = useRef<AbortController | null>(null);
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
			await ensurePasskeySupported();

			abortRef.current?.abort();
			const abortController = new AbortController();
			abortRef.current = abortController;

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

				// Segregate client WebAuthn ceremony from server verification for Signal API handling
				const credential = await createPasskeyCredential(
					optionsJSON,
					abortController.signal,
				);

				let finishRes: Response;
				try {
					finishRes = await fetch(`${serverUrl}/register/finish`, {
						method: "POST",
						headers: { "Content-Type": "application/json" },
						body: JSON.stringify({
							email: normalizedEmail,
							username,
							...credential,
						}),
					});
				} catch (networkError) {
					await signalUnknownPasskey({
						rpId: optionsJSON.rp?.id,
						credentialId: credential.id,
					});
					throw networkError;
				}

				if (!finishRes.ok) {
					await signalUnknownPasskey({
						rpId: optionsJSON.rp?.id,
						credentialId: credential.id,
					});
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
