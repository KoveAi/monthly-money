import { NextRequest, NextResponse } from "next/server";
import { COOKIE_NAME, hasValidSession } from "@/lib/auth";
import { requireHousehold } from "@/lib/api-security";

export async function middleware(request: NextRequest) {
  const path = request.nextUrl.pathname;
  let response: NextResponse;
  if (path.startsWith("/api/") && path !== "/api/auth/login") {
    response = await requireHousehold(request) ?? NextResponse.next();
  } else if (path !== "/login" && path !== "/api/auth/login" &&
             !await hasValidSession(request.cookies.get(COOKIE_NAME)?.value)) {
    // The destination is fixed; no user-controlled return URL can redirect off-site.
    response = NextResponse.redirect(new URL("/login", request.url));
  } else { response = NextResponse.next(); }
  response.headers.set("Cache-Control", "private, no-store");
  response.headers.set("X-Robots-Tag", "noindex, nofollow, noarchive");
  return response;
}

export const config = {
  runtime: "nodejs",
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
