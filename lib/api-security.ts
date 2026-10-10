import { NextRequest, NextResponse } from "next/server";
import { authConfig, COOKIE_NAME, hasValidSession, isTrustedMutation } from "@/lib/auth";

export function privateJson(data: unknown, status = 200): NextResponse {
  return NextResponse.json(data, { status, headers: { "Cache-Control": "private, no-store" } });
}

// This check lives in EACH handler, independent of middleware or the page UI.
export async function requireHousehold(request: NextRequest): Promise<NextResponse | null> {
  if (!authConfig()) return privateJson({ error: "Private access is not configured." }, 503);
  if (!await hasValidSession(request.cookies.get(COOKIE_NAME)?.value)) {
    return privateJson({ error: "Sign in to continue." }, 401);
  }
  if (!["GET", "HEAD", "OPTIONS"].includes(request.method) && !isTrustedMutation(request)) {
    return privateJson({ error: "Request origin is not allowed." }, 403);
  }
  return null;
}

export class InvalidInput extends Error {}

export async function readJsonObject(request: Request, maxBytes = 16384): Promise<Record<string, unknown>> {
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    throw new InvalidInput("Send JSON with Content-Type: application/json.");
  }
  if (!request.body) throw new InvalidInput("A JSON object is required.");
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) { await reader.cancel(); throw new InvalidInput("Request is too large."); }
      chunks.push(value);
    }
    const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new InvalidInput("A JSON object is required.");
    return body;
  } catch (error) {
    if (error instanceof InvalidInput) throw error;
    throw new InvalidInput("Invalid JSON object.");
  } finally { reader.releaseLock(); }
}

export function apiError(error: unknown, message: string): NextResponse {
  if (error instanceof InvalidInput) return privateJson({ error: error.message }, 400);
  // Do not put Prisma errors, SQL, or personal expense values into hosted logs.
  console.error(message);
  return privateJson({ error: message }, 500);
}
