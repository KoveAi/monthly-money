import { NextRequest } from "next/server";
import { verifyAuthenticationResponse, type AuthenticationResponseJSON } from "@simplewebauthn/server";
import { COOKIE_NAME, cookieOptions, createSessionCookie, isTrustedMutation } from "@/lib/auth";
import { apiError, privateJson, readJsonObject } from "@/lib/api-security";
import { CHALLENGE_COOKIE, challengeCookieOptions, openChallenge, openPasskey, PASSKEY_COOKIE, relyingParty } from "@/lib/passkey";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const rp = relyingParty();
  if (!rp) return privateJson({ error: "Private access is not configured." }, 503);
  if (!isTrustedMutation(request)) return privateJson({ error: "Request origin is not allowed." }, 403);
  const passkey = await openPasskey(request.cookies.get(PASSKEY_COOKIE)?.value);
  if (!passkey) return privateJson({ error: "Face ID is not set up on this device." }, 404);
  const challenge = await openChallenge(request.cookies.get(CHALLENGE_COOKIE)?.value, "login");
  if (!challenge) return privateJson({ error: "Face ID sign-in expired. Please try again." }, 400);
  try {
    const body = await readJsonObject(request, 16384);
    if (body.id !== passkey.id) return privateJson({ error: "Face ID could not verify you." }, 401);
    let verified = false;
    try {
      const result = await verifyAuthenticationResponse({
        response: body as unknown as AuthenticationResponseJSON,
        expectedChallenge: challenge,
        expectedOrigin: rp.origin,
        expectedRPID: rp.rpID,
        credential: { id: passkey.id, publicKey: passkey.publicKey, counter: 0 },
        requireUserVerification: true,
      });
      verified = result.verified;
    } catch { verified = false; }
    const response = verified
      ? privateJson({ success: true })
      : privateJson({ error: "Face ID could not verify you." }, 401);
    response.cookies.set(CHALLENGE_COOKIE, "", { ...challengeCookieOptions, maxAge: 0 });
    if (verified) response.cookies.set(COOKIE_NAME, await createSessionCookie(), cookieOptions);
    return response;
  } catch (error) { return apiError(error, "Unable to sign in with Face ID."); }
}
