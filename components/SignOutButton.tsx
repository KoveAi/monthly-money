"use client";
import { useState } from "react";

export function SignOutButton() {
  const [error, setError] = useState(false);
  return <div>
    <button className="text-xs tracking-widest text-white" onClick={async () => {
      try {
        const response = await fetch("/api/auth/logout", { method: "POST" });
        if (!response.ok && response.status !== 401) { setError(true); return; }
        // Clear local copies of private budget selections on this browser.
        try {
          localStorage.removeItem("mm-trim-plan-v1");
          localStorage.removeItem("mm-budget-plan-v1");
        } catch { /* Storage may be unavailable in private browsing. */ }
        window.location.replace("/login");
      } catch { setError(true); }
    }}>SIGN OUT</button>
    {error && <span role="alert" className="ml-3 text-xs text-red-200">Please try again.</span>}
  </div>;
}
