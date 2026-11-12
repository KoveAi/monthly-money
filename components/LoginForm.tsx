"use client";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { platformAuthenticatorIsAvailable, startAuthentication, startRegistration } from "@simplewebauthn/browser";

const HOUSEHOLD_NAME = "Stone Brook household";

async function postJson(url: string, body?: unknown) {
  const response = await fetch(url, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body ?? {}), cache: "no-store",
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error ?? "Something went wrong. Please try again.");
  return data;
}

function goToDashboard() { window.location.replace("/dashboard"); }

// A cancelled or dismissed Face ID prompt is not an error worth showing.
function isCancel(error: unknown) {
  return error instanceof Error && (error.name === "NotAllowedError" || error.name === "AbortError");
}

export function LoginForm({ faceIdReady }: { faceIdReady: boolean }) {
  const [accessCode, setAccessCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [showCode, setShowCode] = useState(!faceIdReady);
  const [offerFaceId, setOfferFaceId] = useState(false);
  const autoTried = useRef(false);

  const faceIdSignIn = useCallback(async (automatic = false) => {
    setBusy(true); setError("");
    try {
      const optionsJSON = await postJson("/api/auth/passkey/login-options");
      const assertion = await startAuthentication({ optionsJSON });
      await postJson("/api/auth/passkey/login", assertion);
      goToDashboard();
    } catch (err) {
      if (!automatic && !isCancel(err)) setError(err instanceof Error ? err.message : "Face ID sign-in failed.");
      setBusy(false);
    }
  }, []);

  // Open Face ID as soon as the page loads. If the browser requires a tap first,
  // this quietly does nothing and the Face ID button is right there.
  useEffect(() => {
    if (faceIdReady && !autoTried.current) { autoTried.current = true; void faceIdSignIn(true); }
  }, [faceIdReady, faceIdSignIn]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true); setError("");
    try {
      await postJson("/api/auth/login", { accessCode });
      if (!faceIdReady && await platformAuthenticatorIsAvailable().catch(() => false)) {
        setOfferFaceId(true); setBusy(false); return;
      }
      goToDashboard();
    } catch (err) {
      setError(err instanceof Error && err.message !== "Failed to fetch" ? err.message : "Unable to connect. Please try again.");
      setBusy(false);
    }
  }

  async function enrollFaceId() {
    setBusy(true); setError("");
    try {
      const optionsJSON = await postJson("/api/auth/passkey/register-options");
      const attestation = await startRegistration({ optionsJSON });
      await postJson("/api/auth/passkey/register", attestation);
      goToDashboard();
    } catch (err) {
      setError(isCancel(err) ? "Face ID setup was cancelled. You can turn it on next time you sign in."
        : err instanceof Error ? err.message : "Face ID could not be set up.");
      setBusy(false);
    }
  }

  const primary = "w-full rounded-lg bg-[#154367] px-4 py-3 font-medium text-white disabled:opacity-50";
  const secondary = "w-full rounded-lg border border-slate-300 px-4 py-3 font-medium text-slate-700 disabled:opacity-50";

  if (offerFaceId) {
    return (
      <div className="space-y-4">
        <h2 className="text-lg font-semibold text-slate-900">Use Face ID next time?</h2>
        <p className="text-sm leading-6 text-slate-600">
          Sign in on this device with Face ID instead of typing the access code.
        </p>
        {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
        <button type="button" disabled={busy} onClick={enrollFaceId} className={primary}>
          {busy ? "Setting up…" : "Turn on Face ID"}
        </button>
        <button type="button" disabled={busy} onClick={goToDashboard} className={secondary}>
          {error ? "Continue to dashboard" : "Not now"}
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {faceIdReady && (
        <div className="space-y-3">
          <button type="button" disabled={busy} onClick={() => faceIdSignIn(false)} className={primary}>
            {busy && !showCode ? "Waiting for Face ID…" : "Sign in with Face ID"}
          </button>
          {!showCode && (
            <button type="button" onClick={() => setShowCode(true)}
              className="w-full text-center text-sm text-slate-500 underline-offset-4 hover:underline">
              Use access code instead
            </button>
          )}
        </div>
      )}
      {error && !showCode && <p role="alert" className="text-sm text-red-700">{error}</p>}
      {showCode && (
        <form onSubmit={submit} className="space-y-4">
          {/* Lets iPhone Passwords save and fill the code against one named account. */}
          <input type="text" name="username" autoComplete="username" value={HOUSEHOLD_NAME} readOnly
            hidden aria-hidden="true" tabIndex={-1} />
          <label className="block text-sm font-medium text-slate-700" htmlFor="access-code">Household access code</label>
          <input id="access-code" name="password" type="password" autoComplete="current-password" required
            spellCheck={false} autoCapitalize="none" maxLength={32} value={accessCode}
            onChange={event => setAccessCode(event.target.value)}
            className="w-full rounded-lg border border-slate-300 px-4 py-3 focus:border-blue-800 focus:outline-none" />
          {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
          <button disabled={busy} className={faceIdReady ? secondary : primary}>
            {busy ? "Signing in…" : "Sign in"}
          </button>
          <p className="text-xs leading-5 text-slate-500">Access expires after eight hours. Keep your code in your password manager.</p>
        </form>
      )}
    </div>
  );
}
