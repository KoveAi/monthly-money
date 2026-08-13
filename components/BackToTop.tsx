"use client";

import { useEffect, useState } from "react";

/**
 * Floating jump-to-top. Hidden until there is enough page behind you to make it
 * worth having, so it never sits over the first screen doing nothing.
 */
export function BackToTop() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    const onScroll = () => setShow(window.scrollY > 400);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  if (!show) return null;

  return (
    <button
      onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
      aria-label="Back to top"
      className="fixed z-50 px-5 py-3 text-xs transition-opacity hover:opacity-100"
      style={{
        right: 24,
        bottom: 24,
        background: "#111111",
        color: "#B8976A",
        border: "1px solid #B8976A",
        letterSpacing: "0.2em",
        fontWeight: 600,
        opacity: 0.9,
        boxShadow: "0 2px 12px rgba(0,0,0,0.25)",
      }}
    >
      ↑ TOP
    </button>
  );
}
