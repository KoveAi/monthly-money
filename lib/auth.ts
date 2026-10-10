import { createHash, timingSafeEqual } from "node:crypto";
import { sealData, unsealData } from "iron-session";

export const SESSION_TTL = 8 * 60 * 60;
export const COOKIE_NAME = process.env.NODE_ENV === "production"
  ? "__Host-monthly-money" : "monthly-money";

export type HouseholdSession = { household: true; credentialVersion: string; expiresAt: number };

export function authConfig() {
  const secret = process.env.MONTHLY_MONEY_SESSION_SECRET;
  const codeHash = process.env.MONTHLY_MONEY_ACCESS_CODE_HASH;
  const origin = process.env.MONTHLY_MONEY_ORIGIN;
  if (!secret || !/^[a-f0-9]{64,128}$/.test(secret) ||
      !codeHash || !/^[a-f0-9]{64}$/.test(codeHash) || !origin) return null;
  try {
    const url = new URL(origin);
    if (url.origin !== origin || url.username || url.password) return null;
    if (process.env.NODE_ENV === "production" && url.protocol !== "https:") return null;
    if (!["https:", "http:"].includes(url.protocol)) return null;
    return { secret, codeHash, origin };
  } catch { return null; }
}

// Access codes are generated from 24 random bytes. They are not user-chosen
// passwords: a fast hash is appropriate for this 192-bit random credential.
export function verifyAccessCode(code: unknown): boolean {
  const config = authConfig();
  if (!config || typeof code !== "string" || !/^[A-Za-z0-9_-]{32}$/.test(code)) return false;
  const actual = createHash("sha256").update(code).digest();
  return timingSafeEqual(actual, Buffer.from(config.codeHash, "hex"));
}

export async function createSessionCookie(): Promise<string> {
  const config = authConfig();
  if (!config) throw new Error("Private access is not configured");
  const session: HouseholdSession = {
    household: true,
    credentialVersion: config.codeHash,
    expiresAt: Date.now() + SESSION_TTL * 1000,
  };
  return sealData(session, { password: config.secret, ttl: SESSION_TTL });
}

export async function hasValidSession(cookie: string | undefined): Promise<boolean> {
  const config = authConfig();
  if (!config || !cookie || cookie.length > 4096) return false;
  try {
    const session = await unsealData<HouseholdSession>(cookie, {
      password: config.secret, ttl: SESSION_TTL,
    });
    return session.household === true && session.credentialVersion === config.codeHash &&
      typeof session.expiresAt === "number" && session.expiresAt > Date.now() &&
      session.expiresAt <= Date.now() + SESSION_TTL * 1000;
  } catch { return false; }
}

export function isTrustedMutation(request: Request): boolean {
  const config = authConfig();
  if (!config) return false;
  const source = request.headers.get("origin");
  const site = request.headers.get("sec-fetch-site");
  return source === config.origin && (!site || site === "same-origin");
}

export const cookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "strict" as const,
  path: "/",
  maxAge: SESSION_TTL,
};
