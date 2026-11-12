import { LoginForm } from "@/components/LoginForm";
import { cookies } from "next/headers";
import { authConfig } from "@/lib/auth";
import { openPasskey, PASSKEY_COOKIE } from "@/lib/passkey";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  const configured = Boolean(authConfig());
  const faceIdReady = configured && Boolean(await openPasskey((await cookies()).get(PASSKEY_COOKIE)?.value));
  return (
    <main className="mx-auto max-w-md px-6 py-20">
      <p className="mb-3 text-xs tracking-[0.25em] text-slate-500">PRIVATE HOUSEHOLD ACCESS</p>
      <h1 className="mb-3 text-3xl font-semibold text-slate-900">Welcome to Monthly Money</h1>
      <p className="mb-8 text-sm leading-6 text-slate-600">
        {configured ? (faceIdReady ? "Sign in with Face ID to view and manage your finances." :
          "Enter your household access code to view and manage your finances.") :
          "Your financial records are locked. Private access must be configured before you can sign in."}
      </p>
      {configured && <LoginForm faceIdReady={faceIdReady} />}
    </main>
  );
}
