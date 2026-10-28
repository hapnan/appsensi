export const DEFAULT_WEBAUTHN_SERVER_URL = "http://localhost:8080";

/** Resolves the configured external WebAuthn server base URL without trailing slashes. */
export function getWebAuthnServerUrl() {
	const raw =
		import.meta.env.VITE_WEBAUTHN_SERVER_URL?.trim() ||
		DEFAULT_WEBAUTHN_SERVER_URL;
	return raw.replace(/\/+$/, "");
}

/** Extracts a readable error message from a JSON error response or falls back to HTTP status. */
export async function readServerError(response: Response, fallback: string) {
	try {
		const data = (await response.json()) as {
			error?: string;
			message?: string;
		};
		if (typeof data.error === "string" && data.error.trim().length > 0) {
			return data.error;
		}
		if (typeof data.message === "string" && data.message.trim().length > 0) {
			return data.message;
		}
	} catch {
		// Ignore non-JSON error bodies and return fallback below.
	}
	return `${fallback} (HTTP ${response.status})`;
}

/** Unwraps `go-webauthn` `{ publicKey: ... }` envelopes or returns flat options as-is. */
export function unwrapPublicKeyOptions<T extends object>(
	raw: { publicKey?: T } | T,
): T {
	if ("publicKey" in raw && raw.publicKey) {
		return raw.publicKey;
	}
	return raw as T;
}
