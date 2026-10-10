import { LoginForm } from "@/components/LoginForm";
import { authConfig } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default function LoginPage() {
  const configured = Boolean(authConfig());
  return (
    <main className="mx-auto max-w-md px-6 py-20">
      <p className="mb-3 text-xs tracking-[0.25em] text-slate-500">PRIVATE HOUSEHOLD ACCESS</p>
      <h1 className="mb-3 text-3xl font-semibold text-slate-900">Welcome to Monthly Money</h1>
      <p className="mb-8 text-sm leading-6 text-slate-600">
        {configured ? "Enter your household access code to view and manage your finances." :
          "Your financial records are locked. Private access must be configured before you can sign in."}
      </p>
      {configured && <LoginForm />}
    </main>
  );
}
