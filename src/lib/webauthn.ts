import {
	type AuthenticationResponseJSON,
	browserSupportsWebAuthn,
	type PublicKeyCredentialCreationOptionsJSON,
	type PublicKeyCredentialRequestOptionsJSON,
	type RegistrationResponseJSON,
	startAuthentication,
	startRegistration,
} from "@simplewebauthn/browser";

export const DEFAULT_WEBAUTHN_SERVER_URL = "http://localhost:8080";

interface PublicKeyCredentialStaticWithModernAPIs {
	getClientCapabilities?: () => Promise<Record<string, boolean>>;
	parseCreationOptionsFromJSON?: (
		options: PublicKeyCredentialCreationOptionsJSON,
	) => PublicKeyCredentialCreationOptions;
	parseRequestOptionsFromJSON?: (
		options: PublicKeyCredentialRequestOptionsJSON,
	) => PublicKeyCredentialRequestOptions;
	signalUnknownCredential?: (options: {
		rpId: string;
		credentialId: string;
	}) => Promise<void>;
}

type PublicKeyCredentialWithToJSON = Omit<PublicKeyCredential, "toJSON"> & {
	toJSON?: () => RegistrationResponseJSON | AuthenticationResponseJSON;
};

function getModernPublicKeyCredential():
	| PublicKeyCredentialStaticWithModernAPIs
	| undefined {
	if (typeof globalThis.PublicKeyCredential === "undefined") {
		return undefined;
	}
	return globalThis.PublicKeyCredential as unknown as PublicKeyCredentialStaticWithModernAPIs;
}

/**
 * Verifies WebAuthn passkey support using `PublicKeyCredential.getClientCapabilities()`
 * when available, falling back to `browserSupportsWebAuthn()`.
 */
export async function ensurePasskeySupported(): Promise<void> {
	const pkc = getModernPublicKeyCredential();
	if (typeof pkc?.getClientCapabilities === "function") {
		try {
			const capabilities = await pkc.getClientCapabilities();
			if (
				capabilities.passkeyPlatformAuthenticator === false &&
				capabilities.conditionalGet === false
			) {
				throw new Error("This device does not support WebAuthn passkeys.");
			}
			return;
		} catch (error) {
			if (error instanceof Error && error.message.includes("WebAuthn")) {
				throw error;
			}
		}
	}

	if (!browserSupportsWebAuthn()) {
		throw new Error("This browser does not support WebAuthn passkeys.");
	}
}

/**
 * Invokes `PublicKeyCredential.parseCreationOptionsFromJSON()` + `navigator.credentials.create()`
 * and `.toJSON()` when supported, falling back to `@simplewebauthn/browser`'s `startRegistration`.
 */
export async function createPasskeyCredential(
	optionsJSON: PublicKeyCredentialCreationOptionsJSON,
	signal?: AbortSignal,
): Promise<RegistrationResponseJSON> {
	const pkc = getModernPublicKeyCredential();
	if (
		typeof pkc?.parseCreationOptionsFromJSON === "function" &&
		typeof navigator !== "undefined" &&
		navigator.credentials?.create
	) {
		const publicKey = pkc.parseCreationOptionsFromJSON(optionsJSON);
		const credential = (await navigator.credentials.create({
			publicKey,
			signal,
		})) as PublicKeyCredentialWithToJSON | null;
		if (!credential) {
			throw new Error("Passkey creation returned no credential.");
		}
		if (typeof credential.toJSON === "function") {
			return credential.toJSON() as RegistrationResponseJSON;
		}
	}

	return startRegistration({ optionsJSON });
}

/**
 * Invokes `PublicKeyCredential.parseRequestOptionsFromJSON()` + `navigator.credentials.get()`
 * and `.toJSON()` when supported, falling back to `@simplewebauthn/browser`'s `startAuthentication`.
 */
export async function getPasskeyAssertion(
	optionsJSON: PublicKeyCredentialRequestOptionsJSON,
	signal?: AbortSignal,
): Promise<AuthenticationResponseJSON> {
	const pkc = getModernPublicKeyCredential();
	if (
		typeof pkc?.parseRequestOptionsFromJSON === "function" &&
		typeof navigator !== "undefined" &&
		navigator.credentials?.get
	) {
		const publicKey = pkc.parseRequestOptionsFromJSON(optionsJSON);
		const credential = (await navigator.credentials.get({
			publicKey,
			signal,
		})) as PublicKeyCredentialWithToJSON | null;
		if (!credential) {
			throw new Error("Passkey verification returned no credential.");
		}
		if (typeof credential.toJSON === "function") {
			return credential.toJSON() as AuthenticationResponseJSON;
		}
	}

	return startAuthentication({ optionsJSON });
}

/**
 * Notifies the user's credential manager via the WebAuthn Signal API when a credential
 * is orphaned or unknown on the server. Always uses the server-provided `rpId`
 * (`publicKey.rp.id` or `publicKey.rpId`) and never `window.location.hostname`.
 */
export async function signalUnknownPasskey({
	rpId,
	credentialId,
}: {
	rpId: string | undefined;
	credentialId: string | undefined;
}): Promise<void> {
	const trimmedRpId = rpId?.trim();
	const trimmedCredentialId = credentialId?.trim();
	if (!trimmedRpId || !trimmedCredentialId) return;

	const pkc = getModernPublicKeyCredential();
	if (typeof pkc?.signalUnknownCredential === "function") {
		try {
			await pkc.signalUnknownCredential({
				rpId: trimmedRpId,
				credentialId: trimmedCredentialId,
			});
		} catch {
			// Signal API is best-effort and should never fail the caller's error handling.
		}
	}
}

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
