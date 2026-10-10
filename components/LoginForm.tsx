"use client";
import { useState, type FormEvent } from "react";

export function LoginForm() {
  const [accessCode, setAccessCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accessCode }), cache: "no-store",
      });
      if (!response.ok) { setError((await response.json()).error ?? "Unable to sign in."); return; }
      window.location.replace("/dashboard");
    } catch { setError("Unable to connect. Please try again."); }
    finally { setBusy(false); }
  }
  return (
    <form onSubmit={submit} className="space-y-4">
      <label className="block text-sm font-medium text-slate-700" htmlFor="access-code">Household access code</label>
      <input id="access-code" name="password" type="password" autoComplete="current-password" required
        spellCheck={false} autoCapitalize="none" maxLength={32} value={accessCode}
        onChange={event => setAccessCode(event.target.value)}
        className="w-full rounded-lg border border-slate-300 px-4 py-3 focus:border-blue-800 focus:outline-none" />
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      <button disabled={busy} className="w-full rounded-lg bg-[#154367] px-4 py-3 font-medium text-white disabled:opacity-50">
        {busy ? "Signing in…" : "Sign in"}
      </button>
      <p className="text-xs leading-5 text-slate-500">Access expires after eight hours. Keep your code in your password manager.</p>
    </form>
  );
}
