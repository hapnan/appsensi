export const DEFAULT_WEBAUTHN_SERVER_URL = "http://localhost:8080";

function normalizeServerUrl(url: string) {
	const trimmed = url.trim().replace(/\/+$/, "");
	if (!trimmed) return "";
	if (/^https?:\/\//i.test(trimmed)) {
		return trimmed;
	}
	return `http://${trimmed}`;
}

/** Resolves the configured external WebAuthn server base URL without trailing slashes. */
export function getWebAuthnServerUrl() {
	const processUrl =
		typeof process !== "undefined"
			? process.env?.VITE_WEBAUTHN_SERVER_URL
			: undefined;
	const raw =
		processUrl?.trim() ||
		import.meta.env?.VITE_WEBAUTHN_SERVER_URL?.trim() ||
		DEFAULT_WEBAUTHN_SERVER_URL;
	return normalizeServerUrl(raw);
}

/**
 * Resolves the backend `appsensi-server` base URL for server-side requests.
 * Prioritizes `WEBAUTHN_SERVER_URL` (e.g. Render private network `host:port`)
 * over `VITE_WEBAUTHN_SERVER_URL` so server-to-server calls can bypass public
 * CDN/WAF proxies while browser WebAuthn ceremonies continue using the public URL.
 */
export function getAppsensiServerUrl() {
	const internalUrl =
		typeof process !== "undefined"
			? process.env?.WEBAUTHN_SERVER_URL?.trim()
			: undefined;
	if (internalUrl) {
		return normalizeServerUrl(internalUrl);
	}
	return getWebAuthnServerUrl();
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
