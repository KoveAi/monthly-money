import { NextRequest } from "next/server";
import { verifyRegistrationResponse, type RegistrationResponseJSON } from "@simplewebauthn/server";
import { apiError, privateJson, readJsonObject, requireHousehold } from "@/lib/api-security";
import { CHALLENGE_COOKIE, challengeCookieOptions, openChallenge, PASSKEY_COOKIE, passkeyCookieOptions, relyingParty, sealPasskey } from "@/lib/passkey";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const denied = await requireHousehold(request);
  if (denied) return denied;
  const rp = relyingParty();
  if (!rp) return privateJson({ error: "Private access is not configured." }, 503);
  const challenge = await openChallenge(request.cookies.get(CHALLENGE_COOKIE)?.value, "register");
  if (!challenge) return privateJson({ error: "Face ID setup expired. Please try again." }, 400);
  try {
    const body = await readJsonObject(request, 16384);
    let verified = false;
    let credential: { id: string; publicKey: Uint8Array } | undefined;
    try {
      const result = await verifyRegistrationResponse({
        response: body as unknown as RegistrationResponseJSON,
        expectedChallenge: challenge,
        expectedOrigin: rp.origin,
        expectedRPID: rp.rpID,
        requireUserVerification: true,
      });
      verified = result.verified;
      credential = result.registrationInfo?.credential;
    } catch { verified = false; }
    if (!verified || !credential) return privateJson({ error: "Face ID could not be set up." }, 400);
    const response = privateJson({ success: true });
    response.cookies.set(PASSKEY_COOKIE, await sealPasskey(credential.id, credential.publicKey), passkeyCookieOptions);
    response.cookies.set(CHALLENGE_COOKIE, "", { ...challengeCookieOptions, maxAge: 0 });
    return response;
  } catch (error) { return apiError(error, "Unable to finish Face ID setup."); }
}
