import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { COOKIE_NAME, hasValidSession } from "@/lib/auth";

export async function requirePrivatePage() {
  if (!await hasValidSession((await cookies()).get(COOKIE_NAME)?.value)) redirect("/login");
}
