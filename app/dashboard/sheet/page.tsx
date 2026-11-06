"use client";

import { useEffect, useState } from "react";
import { SHEET_KEY } from "@/lib/sheetHandoff";

// The printable pay-window sheet, shown in the same tab as the app.
//
// It used to open in a pop-up window and print itself. On a phone that failed
// twice over: iOS ignores print() unless a tap triggers it, and a pop-up has no
// way back to the app. Here the dashboard hands the sheet over through
// sessionStorage, this page swaps itself for the sheet, and a toolbar (hidden
// when printing) carries a Back button and a Print button the user taps.

const TOOLBAR = `
<style>
  .mm-bar{position:sticky;top:0;z-index:10;display:flex;gap:10px;justify-content:space-between;align-items:center;
    padding:10px 14px;padding-top:max(10px,env(safe-area-inset-top));background:#0A1D3A;
    font-family:-apple-system,"Segoe UI",Helvetica,Arial,sans-serif}
  .mm-bar a,.mm-bar button{font:600 15px/1 -apple-system,"Segoe UI",Helvetica,Arial,sans-serif;border-radius:8px;
    padding:12px 16px;min-height:44px;cursor:pointer;text-decoration:none;display:inline-flex;align-items:center}
  .mm-bar a{color:#fff;border:1px solid rgba(255,255,255,.35);background:transparent}
  .mm-bar button{color:#0A1D3A;background:#fff;border:0}
  @media print{.mm-bar{display:none !important}}
</style>
<div class="mm-bar">
  <a href="/dashboard">&larr; Back to Monthly Money</a>
  <button type="button" onclick="window.print()">Print / Save PDF</button>
</div>`;

export default function PaySheetPage() {
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    let html: string | null = null;
    try { html = sessionStorage.getItem(SHEET_KEY); } catch { html = null; }
    if (!html || !html.includes("<body>")) { setMissing(true); return; }
    const page = html.replace("<body>", "<body>" + TOOLBAR);
    document.open();
    document.write(page);
    document.close();
  }, []);

  if (!missing) return null;
  return (
    <main className="mx-auto max-w-md px-6 py-20">
      <p className="mb-6 text-sm text-slate-600">
        No sheet to show. Open it from the dashboard with the Print Sheet button.
      </p>
      <a href="/dashboard" className="inline-block rounded-lg bg-[#154367] px-4 py-3 font-medium text-white">
        &larr; Back to Monthly Money
      </a>
    </main>
  );
}
