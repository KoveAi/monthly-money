import { NextRequest } from "next/server";
import { authConfig, COOKIE_NAME, cookieOptions, createSessionCookie, isTrustedMutation, verifyAccessCode } from "@/lib/auth";
import { apiError, privateJson, readJsonObject } from "@/lib/api-security";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Burst protection is per instance, not a distributed rate limiter. The actual
// defense against guessing is the generated 192-bit code. No IP or code is logged.
let attempts = 0;
let windowStart = Date.now();
export async function POST(request: NextRequest) {
  if (!authConfig()) return privateJson({ error: "Private access is not configured." }, 503);
  if (!isTrustedMutation(request)) return privateJson({ error: "Request origin is not allowed." }, 403);
  if (Date.now() - windowStart >= 60_000) { attempts = 0; windowStart = Date.now(); }
  if (++attempts > 30) {
    const response = privateJson({ error: "Please wait a minute before trying again." }, 429);
    response.headers.set("Retry-After", "60");
    return response;
  }
  try {
    const body = await readJsonObject(request, 1024);
    if (!verifyAccessCode(body.accessCode)) return privateJson({ error: "The access code is incorrect." }, 401);
    const response = privateJson({ success: true });
    response.cookies.set(COOKIE_NAME, await createSessionCookie(), cookieOptions);
    return response;
  } catch (error) { return apiError(error, "Unable to sign in."); }
}
