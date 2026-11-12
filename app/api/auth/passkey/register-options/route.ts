import { NextRequest } from "next/server";
import { generateRegistrationOptions } from "@simplewebauthn/server";
import { apiError, privateJson, requireHousehold } from "@/lib/api-security";
import { CHALLENGE_COOKIE, challengeCookieOptions, relyingParty, RP_NAME, sealChallenge, USER_NAME } from "@/lib/passkey";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Only a device that is already signed in (with the access code) can enroll Face ID.
export async function POST(request: NextRequest) {
  const denied = await requireHousehold(request);
  if (denied) return denied;
  const rp = relyingParty();
  if (!rp) return privateJson({ error: "Private access is not configured." }, 503);
  try {
    const options = await generateRegistrationOptions({
      rpName: RP_NAME,
      rpID: rp.rpID,
      userName: USER_NAME,
      userDisplayName: USER_NAME,
      attestationType: "none",
      authenticatorSelection: { residentKey: "required", userVerification: "required" },
      supportedAlgorithmIDs: [-7, -257],
    });
    const response = privateJson(options);
    response.cookies.set(CHALLENGE_COOKIE, await sealChallenge(options.challenge, "register"), challengeCookieOptions);
    return response;
  } catch (error) { return apiError(error, "Unable to start Face ID setup."); }
}
