import { NextRequest } from "next/server";
import { generateAuthenticationOptions } from "@simplewebauthn/server";
import { isTrustedMutation } from "@/lib/auth";
import { apiError, privateJson } from "@/lib/api-security";
import { CHALLENGE_COOKIE, challengeCookieOptions, openPasskey, PASSKEY_COOKIE, relyingParty, sealChallenge } from "@/lib/passkey";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const rp = relyingParty();
  if (!rp) return privateJson({ error: "Private access is not configured." }, 503);
  if (!isTrustedMutation(request)) return privateJson({ error: "Request origin is not allowed." }, 403);
  const passkey = await openPasskey(request.cookies.get(PASSKEY_COOKIE)?.value);
  if (!passkey) return privateJson({ error: "Face ID is not set up on this device." }, 404);
  try {
    const options = await generateAuthenticationOptions({
      rpID: rp.rpID,
      allowCredentials: [{ id: passkey.id }],
      userVerification: "required",
    });
    const response = privateJson(options);
    response.cookies.set(CHALLENGE_COOKIE, await sealChallenge(options.challenge, "login"), challengeCookieOptions);
    return response;
  } catch (error) { return apiError(error, "Unable to start Face ID sign-in."); }
}
