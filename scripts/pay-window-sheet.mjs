#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// Pay-window sheet — the printable one-page bill list for a single pay window.
//
//   node scripts/pay-window-sheet.mjs                  the window containing today
//   node scripts/pay-window-sheet.mjs --window b       the other window this month
//   node scripts/pay-window-sheet.mjs --month 2026-10  a specific month
//   node scripts/pay-window-sheet.mjs --html-only      skip the PDF
//
// It compiles lib/finance.ts and lib/status.ts and imports them rather than
// re-implementing what a bill owes. A sheet that disagreed with the dashboard
// would be worse than no sheet, and the only way to guarantee it cannot is to
// run the same code.
// ─────────────────────────────────────────────────────────────────────────────

import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync, existsSync, rmSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import os from "node:os";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const API  = process.env.MONEY_API ?? "https://monthly-money-psi.vercel.app/api/expenses";

// ── Arguments ────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const arg  = (name, fallback) => {
  const i = argv.indexOf("--" + name);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[i + 1] : fallback;
};
const htmlOnly = argv.includes("--html-only");

const today = new Date();
// Local calendar date, not toISOString() — that reports UTC, so any evening west
// of Greenwich would date the sheet tomorrow and mark tonight's bills overdue.
const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const todayISO = arg("today", iso(today));
const [ty, tm, td] = todayISO.split("-").map(Number);

// Window A runs the 5th to the 19th; window B the 20th through the 4th of the
// next month. Default to whichever contains today, because that is the sheet
// you almost always want.
const WINDOW = (arg("window", td >= 5 && td < 20 ? "a" : "b")).toLowerCase();
const MONTH  = arg("month", `${ty}-${String(tm).padStart(2, "0")}`);

// ── Compile the app's money rules and import them ────────────────────────────
const BUILD = join(os.tmpdir(), "pay-window-sheet-build");
rmSync(BUILD, { recursive: true, force: true });
mkdirSync(BUILD, { recursive: true });

// TypeScript's own entry point, run through node. The .bin/tsc.cmd shim needs a
// shell, and a shell mangles any project path containing a space or a comma —
// which this one does.
const tscBin = join(ROOT, "node_modules", "typescript", "bin", "tsc");
if (!existsSync(tscBin)) {
  console.error("TypeScript not found — run `npm install` in the project first.");
  process.exit(1);
}
let tscOutput = "";
try {
  tscOutput = execFileSync(process.execPath, [
    tscBin,
    join(ROOT, "lib", "finance.ts"), join(ROOT, "lib", "status.ts"),
    "--outDir", BUILD, "--rootDir", join(ROOT, "lib"),
    "--module", "commonjs", "--target", "es2019",
    "--moduleResolution", "node", "--skipLibCheck", "--esModuleInterop",
  ], { encoding: "utf8" });
} catch (err) {
  // The "@/lib" alias cannot resolve outside Next. That error is expected and the
  // emitted JavaScript is still correct once the alias is rewritten below — but
  // anything else is real, so check the output landed rather than assume it did.
  tscOutput = String(err.stdout ?? "") + String(err.stderr ?? "");
}
const emitted = ["finance.js", "status.js"].map(f => join(BUILD, f));
if (!emitted.every(existsSync)) {
  console.error("Could not compile the app's money rules. tsc said:");
  console.error(tscOutput.trim());
  process.exit(1);
}
const { readFileSync } = await import("node:fs");
for (const p of emitted) writeFileSync(p, readFileSync(p, "utf8").replaceAll("@/lib/", "./"));

const finance = await import(pathToFileURL(join(BUILD, "finance.js")).href);
const { sectionOf, effectiveRemaining, isPaused, budgetAmount } = finance.default ?? finance;

// ── Window arithmetic ────────────────────────────────────────────────────────
const shiftMonth = (mk, by) => {
  const [y, m] = mk.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + by, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
};
const lastDay = mk => {
  const [y, m] = mk.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
};
const longMonth = mk => {
  const [y, m] = mk.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
};
const shortMonth = mk => {
  const [y, m] = mk.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("en-US", { month: "short", timeZone: "UTC" });
};

// A window is one or two stretches of calendar. Window B crosses a month end, so
// it gets a stretch in each month and the sheet prints a section per stretch.
const NEXT = shiftMonth(MONTH, 1);
const stretches = WINDOW === "a"
  ? [{ monthKey: MONTH, from: 1, to: 19, label: `${longMonth(MONTH)} 1\u201319`, note:
      "Bills in the current 5th\u201320th pay window that still need money, plus anything earlier in the month still outstanding." }]
  : [{ monthKey: MONTH, from: 20, to: lastDay(MONTH), label: `${longMonth(MONTH)} 20\u2013${lastDay(MONTH)}`, note:
      "Bills in the current 20th\u20135th pay window that still need money, plus anything earlier in the month still outstanding.",
      alsoEarlier: true },
     { monthKey: NEXT, from: 1, to: 4, label: `${longMonth(NEXT)} 1\u20134`, note:
      "The tail of the same pay window, falling in the following month." }];

const windowTitle = WINDOW === "a"
  ? `Bills due ${shortMonth(MONTH)} 5 \u2013 ${shortMonth(MONTH)} 20, ${MONTH.slice(0, 4)}`
  : `Bills due ${shortMonth(MONTH)} 20 \u2013 ${shortMonth(NEXT)} 4, ${NEXT.slice(0, 4)}`;

// ── Data ─────────────────────────────────────────────────────────────────────
const ledger = await (await fetch(API)).json();
if (!Array.isArray(ledger)) { console.error("Unexpected response from", API); process.exit(1); }

const VARIABLE = ["groceries", "restaurants", "incidental", "fuel"];
const isBill = e => {
  const s = sectionOf(e);
  return s !== "income" && s !== "liens" && !VARIABLE.includes(s);
};

const SOON = iso(new Date(ty, tm - 1, td + 3));
// Calendar dates throughout. The app compares a UTC due date against local time,
// which labels tomorrow's bills "Due Today" anywhere west of UTC — harmless on a
// dashboard, wrong on a sheet whose whole purpose is when to pay.
const statusOf = e => {
  if (e.status === "Paid as Agreed") return "Paid as Agreed";
  const due = e.dueDate.slice(0, 10);
  if (due <  todayISO) return "Overdue";
  if (due === todayISO) return "Due Today";
  if (due <= SOON) return "Upcoming";
  return "Scheduled";
};

const rowsFor = ({ monthKey, from, to, alsoEarlier }) => ledger
  .filter(e => e.monthKey === monthKey && isBill(e) && !isPaused(e) && effectiveRemaining(e) > 0)
  .filter(e => {
    const day = Number(e.dueDate.slice(8, 10));
    // Anything overdue earlier in the month still needs money, so it belongs on
    // the sheet even though its date sits before the window opened.
    return alsoEarlier ? day <= to : day >= 1 && day <= to;
  })
  .map(e => ({
    date: e.dueDate.slice(5, 10).replace("-", "/") + "/" + e.dueDate.slice(0, 4),
    bill: e.description.trim(), cat: e.category.trim(),
    amt: Math.round(effectiveRemaining(e) * 100) / 100, status: statusOf(e),
  }))
  .sort((a, b) => a.date.localeCompare(b.date) || b.amt - a.amt);

const sections = stretches.map(st => ({ ...st, rows: rowsFor(st) })).filter(s => s.rows.length);

const windowStart = WINDOW === "a" ? `${MONTH}-05` : `${MONTH}-20`;
const windowEnd   = WINDOW === "a" ? `${MONTH}-20` : `${NEXT}-04`;
const income = ledger
  .filter(e => e.frequency === "income" && !isPaused(e))
  .filter(e => e.dueDate.slice(0, 10) >= windowStart && e.dueDate.slice(0, 10) <= windowEnd)
  .map(e => ({
    date: e.dueDate.slice(5, 10).replace("-", "/") + "/" + e.dueDate.slice(0, 4),
    bill: e.description.trim(), cat: e.category.trim(),
    amt: Math.round(budgetAmount(e) * 100) / 100, status: statusOf(e),
  }))
  .sort((a, b) => a.date.localeCompare(b.date));

const allRows = sections.flatMap(s => s.rows);
const bucket  = name => allRows.filter(r => r.status === name);
const sum     = rs => rs.reduce((t, r) => t + r.amt, 0);
const money   = v => "$" + v.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",");

// ── Render ───────────────────────────────────────────────────────────────────
const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const CHIP = { "Overdue": "s-overdue", "Due Today": "s-today", "Upcoming": "s-upcoming",
               "Scheduled": "s-scheduled", "Paid as Agreed": "s-scheduled" };

const table = (rows, foot) => `
  <div class="scroll"><table>
    <thead><tr>
      <th class="c-tick"></th><th class="c-date">Due date</th><th>Bill</th>
      <th>Category</th><th class="c-amt">Amount due</th><th class="c-stat">Status</th><th class="c-note">Note</th>
    </tr></thead>
    <tbody>${rows.map((r, i) => `
      <tr${i && r.date !== rows[i - 1].date ? ' class="day-break"' : ""}>
        <td class="c-tick"><span class="tick"></span></td>
        <td class="c-date date">${esc(r.date)}</td>
        <td class="bill">${esc(r.bill)}</td>
        <td class="cat">${esc(r.cat)}</td>
        <td class="c-amt amt">${money(r.amt)}</td>
        <td class="c-stat"><span class="chip ${CHIP[r.status]}">${esc(r.status)}</span></td>
        <td class="c-note"><span class="writeline"></span></td>
      </tr>`).join("")}
    </tbody>
    ${foot ? `<tfoot><tr><td></td><td colspan="3">${esc(foot.label)}</td>
      <td class="amt">${money(foot.total)}</td><td colspan="2"></td></tr></tfoot>` : ""}
  </table></div>`;

const readAt = today.toLocaleString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" });

const html = `<title>Stone Brook ${WINDOW === "a" ? "Early" : "Late"} ${shortMonth(MONTH)} Window</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600&family=IBM+Plex+Sans:wght@400;500;600;700&display=swap">
<style>
  :root{--ink:#111111;--ink-soft:#4A4642;--ink-faint:#8C867F;--paper:#FFFFFF;--panel:#FAF9F6;
        --rule:#E2DDD5;--rule-firm:#C9C2B7;--overdue:#8B2020;--today:#8B5E2A;--upcoming:#5A6B7C}
  @media (prefers-color-scheme: dark){:root:not([data-theme="light"]){--panel:#F7F5F1}}
  *{box-sizing:border-box}
  body{margin:0;background:#2B2A28;color:var(--ink);line-height:1.3;font-size:11px;
       font-family:"IBM Plex Sans",-apple-system,"Segoe UI",Helvetica,Arial,sans-serif;-webkit-font-smoothing:antialiased}
  .sheet{max-width:980px;margin:20px auto;background:var(--paper);box-shadow:0 8px 40px rgba(0,0,0,.35)}
  .masthead{background:var(--ink);color:#fff;padding:8px 20px 7px}
  .masthead h1{margin:0;font-size:14px;font-weight:600;letter-spacing:.16em;text-transform:uppercase;text-wrap:balance}
  .masthead .window{display:block;margin-top:2px;font-size:10px;letter-spacing:.22em;color:#C9AE7E}
  .source{padding:5px 20px;border-bottom:1px solid var(--rule);font-size:8px;font-style:italic;color:var(--ink-faint);background:var(--panel)}
  .urgency{display:flex;flex-wrap:wrap;gap:2px 22px;align-items:baseline;padding:5px 20px;
           border-bottom:1px solid var(--rule);background:var(--panel)}
  .urgency div{display:flex;align-items:baseline;gap:5px}
  .urgency .k{font-size:7.5px;letter-spacing:.14em;text-transform:uppercase;color:var(--ink-faint)}
  .urgency .v{font-family:"IBM Plex Mono",ui-monospace,monospace;font-variant-numeric:tabular-nums;font-size:10.5px;font-weight:600}
  .urgency .n{font-size:7.5px;color:var(--ink-faint)}
  .u-overdue .v{color:var(--overdue)}.u-today .v{color:var(--today)}.u-upcoming .v{color:var(--upcoming)}
  .band{background:var(--ink);color:#fff;padding:4px 20px;font-size:8.5px;font-weight:600;letter-spacing:.18em;
        text-transform:uppercase;display:flex;align-items:baseline;gap:14px}
  .band .num{color:#C9AE7E}
  .band .count{margin-left:auto;font-weight:400;letter-spacing:.12em;color:rgba(255,255,255,.62)}
  .band-note{padding:4px 20px;font-size:8px;font-style:italic;color:var(--ink-faint);border-bottom:1px solid var(--rule)}
  .scroll{overflow-x:auto}table{width:100%;border-collapse:collapse}
  thead th{background:var(--panel);border-bottom:1px solid var(--rule-firm);padding:3px 6px;font-size:7px;font-weight:600;
           letter-spacing:.14em;text-transform:uppercase;color:var(--ink-soft);text-align:left;white-space:nowrap}
  tbody td{padding:1.3px 6px;border-bottom:1px solid var(--rule);font-size:8.4px;line-height:1.25;vertical-align:middle}
  thead th:first-child,tbody td:first-child{padding-left:20px}
  thead th:last-child,tbody td:last-child{padding-right:20px}
  .c-tick{width:22px}.c-date{width:62px;white-space:nowrap}.c-amt{width:84px;text-align:right;white-space:nowrap}
  .c-stat{width:84px;white-space:nowrap}.c-note{width:24%}
  .tick{display:block;width:8px;height:8px;border:1px solid var(--rule-firm)}
  .date,.amt{font-family:"IBM Plex Mono",ui-monospace,monospace;font-variant-numeric:tabular-nums}
  .amt{font-weight:500}.bill{font-weight:500}.cat{color:var(--ink-faint);font-size:7.4px}
  .chip{display:inline-block;padding:0 5px;font-size:7px;font-weight:600;letter-spacing:.1em;text-transform:uppercase;border:1px solid}
  .s-overdue{color:var(--overdue);border-color:#D6B6B6;background:#FBF4F4}
  .s-today{color:var(--today);border-color:#DCC9AC;background:#FCF8F2}
  .s-upcoming{color:var(--upcoming);border-color:#C4CCD4;background:#F5F7F9}
  .s-scheduled{color:var(--ink-soft);border-color:var(--rule-firm);background:var(--panel)}
  .writeline{display:block;border-bottom:1px solid var(--rule);height:7px}
  tbody tr.day-break td{border-top:1px solid var(--rule-firm)}
  tfoot td{background:var(--panel);border-top:1px solid var(--rule-firm);border-bottom:1px solid var(--rule-firm);
           padding:4px 6px;font-size:8px;font-weight:600;letter-spacing:.12em;text-transform:uppercase}
  tfoot td.amt{font-family:"IBM Plex Mono",ui-monospace,monospace;font-size:10px;letter-spacing:0}
  .empty{padding:5px 20px;font-size:8px;color:var(--ink-soft);border-bottom:1px solid var(--rule)}
  .empty strong{color:var(--ink);font-weight:600}
  .footer{padding:4px 20px 7px;font-size:7px;color:var(--ink-faint);display:flex;flex-wrap:wrap;gap:3px 18px;border-top:1px solid var(--rule)}
  @page{size:letter portrait;margin:9mm}
  @media print{body{background:#fff}.sheet{margin:0;max-width:none;box-shadow:none}
    .masthead,.band{-webkit-print-color-adjust:exact;print-color-adjust:exact}
    thead{display:table-header-group}tr{break-inside:avoid}.band{break-after:avoid}.urgency{break-inside:avoid}}
</style>

<div class="sheet">
  <div class="masthead">
    <h1>Stone Brook Estate</h1>
    <span class="window">${esc(windowTitle)}</span>
  </div>
  <p class="source">Source: Monthly Money dashboard (monthly-money-psi.vercel.app), read ${esc(readAt)}.
     Amounts shown are LEFT OVER (still owed after payments already applied).</p>

  <div class="urgency">
    <div class="u-overdue"><span class="k">Overdue</span><span class="v">${money(sum(bucket("Overdue")))}</span><span class="n">${bucket("Overdue").length} bills</span></div>
    <div class="u-today"><span class="k">Due today</span><span class="v">${money(sum(bucket("Due Today")))}</span><span class="n">${bucket("Due Today").length} bills</span></div>
    <div class="u-upcoming"><span class="k">Next 3 days</span><span class="v">${money(sum(bucket("Upcoming")))}</span><span class="n">${bucket("Upcoming").length} bills</span></div>
    <div class="u-later"><span class="k">Rest of window</span><span class="v">${money(sum(bucket("Scheduled")))}</span><span class="n">${bucket("Scheduled").length} bills</span></div>
  </div>

  ${sections.map((s, i) => `
  <div class="band"><span class="num">${i + 1} &middot;</span> ${esc(s.label)}, ${s.monthKey.slice(0, 4)} &nbsp;(unpaid)
    <span class="count">${s.rows.length} bills</span></div>
  <p class="band-note">${esc(s.note)} Ordered by due date.</p>
  ${table(s.rows, { label: `Subtotal \u2014 ${s.label}`, total: sum(s.rows) })}`).join("")}

  <div class="band"><span class="num">${sections.length + 1} &middot;</span> Income landing in the same stretch</div>
  ${income.length
    ? table(income, { label: "Total income expected", total: sum(income) })
    : `<p class="empty"><strong>No income entries exist for this window.</strong>
         Month generation copies recurring bills only &mdash; income is entered by hand.</p>`}

  <div class="footer">
    <span>Obligations (liens) excluded &mdash; balances carried until cleared, not payments due in this window.</span>
    <span>Tick the box as each is paid.</span>
    ${sections.length > 1 ? `<span>Window total: ${money(sum(allRows))}</span>` : ""}
  </div>
</div>`;

// ── Write, then print ────────────────────────────────────────────────────────
const stamp   = WINDOW === "a" ? `${MONTH}-05-to-20` : `${MONTH}-20-to-${NEXT}-04`;
const outDir  = arg("out", join(os.homedir(), "Downloads"));
const htmlOut = join(outDir, `Stone-Brook-${stamp}.html`);
const pdfOut  = join(outDir, `Stone-Brook-${stamp}.pdf`);

mkdirSync(outDir, { recursive: true });
writeFileSync(htmlOut,
  `<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n` +
  `<meta name="viewport" content="width=device-width, initial-scale=1">\n` +
  html.slice(0, html.indexOf('<div class="sheet">')) + `</head>\n<body>\n` +
  html.slice(html.indexOf('<div class="sheet">')) + `\n</body>\n</html>\n`);

// The artifact version wants the fragment, without the document wrapper.
writeFileSync(join(BUILD, "artifact.html"), html);

console.log(`\nStone Brook \u2014 ${windowTitle}`);
console.log(`  ${allRows.length} bills, ${money(sum(allRows))} still owed`);
console.log(`  overdue ${money(sum(bucket("Overdue")))} \u00b7 due today ${money(sum(bucket("Due Today")))} \u00b7 ` +
            `next 3 days ${money(sum(bucket("Upcoming")))} \u00b7 rest ${money(sum(bucket("Scheduled")))}`);
console.log(`  income landing: ${income.length ? money(sum(income)) + ` (${income.length} sources)` : "none recorded"}`);
console.log(`\n  html     ${htmlOut}`);
console.log(`  artifact ${join(BUILD, "artifact.html")}`);

if (htmlOnly) process.exit(0);

const CHROME = [
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/usr/bin/google-chrome", "/usr/bin/chromium",
].find(existsSync);

if (!CHROME) {
  console.log("\n  No Chrome or Edge found — open the HTML and print to PDF from the browser.");
  process.exit(0);
}
execFileSync(CHROME, ["--headless=new", "--disable-gpu", "--no-sandbox",
  "--virtual-time-budget=8000", "--no-pdf-header-footer",
  `--print-to-pdf=${pdfOut}`, pathToFileURL(htmlOut).href], { stdio: "pipe" });

const pages = (readFileSync(pdfOut).toString("latin1").match(/\/Type\s*\/Page[^s]/g) || []).length;
console.log(`  pdf      ${pdfOut}   (${pages} page${pages === 1 ? "" : "s"})`);
if (pages > 1) console.log("  note     more than one page — there are more bills than usual in this window.");
console.log("");
