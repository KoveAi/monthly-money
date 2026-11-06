"use client";

import { useEffect, useState } from "react";
import { SHEET_KEY } from "@/lib/sheetHandoff";

// The printable pay-window sheet, shown as an ordinary page inside the app.
//
// Phones refuse to print in two situations the old versions hit: a pop-up
// window that calls print() by itself, and a page rebuilt with document.write
// (iOS silently ignores print() there). This page renders the sheet in the
// normal React tree, prints only on a tap, hides everything but the sheet when
// printing, and keeps a Back button to the dashboard.

const PAGE_CSS = `
  .mm-bar{display:flex;gap:10px;justify-content:space-between;align-items:center;flex-wrap:wrap;
    max-width:980px;margin:12px auto 0;padding:0 12px}
  .mm-bar a,.mm-bar button{font:600 15px/1 -apple-system,"Segoe UI",Helvetica,Arial,sans-serif;border-radius:8px;
    padding:12px 16px;min-height:44px;cursor:pointer;text-decoration:none;display:inline-flex;align-items:center;
    -webkit-tap-highlight-color:transparent;touch-action:manipulation}
  .mm-bar a{color:#0A1D3A;border:1px solid #C9C2B7;background:#fff}
  .mm-bar button{color:#fff;background:#0A1D3A;border:0}
  #pay-sheet{padding:0 0 24px}
  @media print{
    body > *:not(main){display:none !important}
    body, main{margin:0 !important;padding:0 !important;background:#fff !important}
    .mm-bar{display:none !important}
    #pay-sheet{padding:0}
  }`;

function split(html: string): { head: string; body: string; title: string } | null {
  const head = html.match(/<head>([\s\S]*?)<\/head>/i)?.[1];
  const body = html.match(/<body>([\s\S]*?)<\/body>/i)?.[1];
  if (!head || !body) return null;
  const title = head.match(/<title>([\s\S]*?)<\/title>/i)?.[1] ?? "Pay sheet";
  // Keep the sheet's stylesheets and fonts; the page already has its own meta tags and title.
  const keep = head.replace(/<meta[^>]*>/gi, "").replace(/<title>[\s\S]*?<\/title>/i, "");
  return { head: keep, body, title };
}

export default function PaySheetPage() {
  const [sheet, setSheet] = useState<{ head: string; body: string; title: string } | null>(null);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    let html: string | null = null;
    try { html = sessionStorage.getItem(SHEET_KEY); } catch { html = null; }
    const parts = html ? split(html) : null;
    if (!parts) { setMissing(true); return; }
    document.title = parts.title;
    setSheet(parts);
  }, []);

  if (missing) {
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
  if (!sheet) return null;

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: PAGE_CSS }} />
      <div className="mm-bar">
        <a href="/dashboard">&larr; Back to Monthly Money</a>
        <button type="button" onClick={() => window.print()}>Print / Save PDF</button>
      </div>
      <div id="pay-sheet" dangerouslySetInnerHTML={{ __html: sheet.head + sheet.body }} />
    </>
  );
}
