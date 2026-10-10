import { NextRequest } from "next/server";
import { COOKIE_NAME, cookieOptions } from "@/lib/auth";
import { privateJson, requireHousehold } from "@/lib/api-security";

export async function POST(request: NextRequest) {
  const denied = await requireHousehold(request);
  if (denied) return denied;
  const response = privateJson({ success: true });
  response.cookies.set(COOKIE_NAME, "", { ...cookieOptions, maxAge: 0 });
  return response;
}
