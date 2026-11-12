import { sealData, unsealData } from "iron-session";
import { authConfig } from "@/lib/auth";

// Face ID / Touch ID sign-in with passkeys.
//
// There is no user table, so this is stateless. After a successful passkey
// registration the server seals the credential's PUBLIC key with the session
// secret and stores it in a long-lived HttpOnly cookie on that device. At sign-in
// the device proves possession of the matching private key (kept in the phone's
// Secure Enclave / iCloud Keychain and unlocked only by Face ID) by signing a
// fresh one-time challenge. The cookie itself grants nothing: it holds no secret,
// it cannot be forged without the session secret, and it is useless without
// the biometric-protected private key.
//
// Rotating the access code (MONTHLY_MONEY_ACCESS_CODE_HASH) or the session
// secret revokes every enrolled passkey, the same way it revokes sessions.

export const PASSKEY_COOKIE = process.env.NODE_ENV === "production"
  ? "__Host-monthly-money-passkey" : "monthly-money-passkey";
export const CHALLENGE_COOKIE = process.env.NODE_ENV === "production"
  ? "__Host-monthly-money-webauthn" : "monthly-money-webauthn";

const CHALLENGE_TTL = 5 * 60;
const PASSKEY_TTL = 400 * 24 * 60 * 60; // browsers cap cookie lifetime at 400 days

export const RP_NAME = "Monthly Money";
export const USER_NAME = "Stone Brook household";

export type Purpose = "register" | "login";
type ChallengeState = { challenge: string; purpose: Purpose; credentialVersion: string };
type StoredPasskey = { v: 1; id: string; publicKey: string; credentialVersion: string };

export function relyingParty() {
  const config = authConfig();
  if (!config) return null;
  return { rpID: new URL(config.origin).hostname, origin: config.origin, config };
}

export const challengeCookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "strict" as const,
  path: "/",
  maxAge: CHALLENGE_TTL,
};

export const passkeyCookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "strict" as const,
  path: "/",
  maxAge: PASSKEY_TTL,
};

export async function sealChallenge(challenge: string, purpose: Purpose): Promise<string> {
  const config = authConfig();
  if (!config) throw new Error("Private access is not configured");
  const state: ChallengeState = { challenge, purpose, credentialVersion: config.codeHash };
  return sealData(state, { password: config.secret, ttl: CHALLENGE_TTL });
}

export async function openChallenge(cookie: string | undefined, purpose: Purpose): Promise<string | null> {
  const config = authConfig();
  if (!config || !cookie || cookie.length > 4096) return null;
  try {
    const state = await unsealData<ChallengeState>(cookie, { password: config.secret, ttl: CHALLENGE_TTL });
    if (state.purpose !== purpose || state.credentialVersion !== config.codeHash ||
        typeof state.challenge !== "string" || !state.challenge) return null;
    return state.challenge;
  } catch { return null; }
}

export async function sealPasskey(id: string, publicKey: Uint8Array): Promise<string> {
  const config = authConfig();
  if (!config) throw new Error("Private access is not configured");
  const stored: StoredPasskey = {
    v: 1, id, publicKey: Buffer.from(publicKey).toString("base64url"), credentialVersion: config.codeHash,
  };
  return sealData(stored, { password: config.secret, ttl: PASSKEY_TTL });
}

export async function openPasskey(cookie: string | undefined): Promise<{ id: string; publicKey: Uint8Array<ArrayBuffer> } | null> {
  const config = authConfig();
  if (!config || !cookie || cookie.length > 4096) return null;
  try {
    const stored = await unsealData<StoredPasskey>(cookie, { password: config.secret, ttl: PASSKEY_TTL });
    if (stored.v !== 1 || stored.credentialVersion !== config.codeHash ||
        typeof stored.id !== "string" || typeof stored.publicKey !== "string") return null;
    return { id: stored.id, publicKey: Uint8Array.from(Buffer.from(stored.publicKey, "base64url")) };
  } catch { return null; }
}
