#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// Pay-window sheet — the printable one-page bill list for a single pay window.
//
//   node scripts/pay-window-sheet.mjs                  the window containing today
//   node scripts/pay-window-sheet.mjs --window b       the other window this month
//   node scripts/pay-window-sheet.mjs --month 2026-10  a specific month
//   node scripts/pay-window-sheet.mjs --html-only      skip the PDF
//
// The sheet itself is built by lib/paySheet.ts, which the dashboard's PRINT SHEET
// button also calls. This script compiles that module and imports it rather than
// keeping a second copy of the template: two copies of a document drift, and a
// sheet that disagreed with the screen it came from would be worse than no sheet.
// ─────────────────────────────────────────────────────────────────────────────

import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from "node:fs";
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

// Local calendar date, not toISOString() — that reports UTC, so any evening west
// of Greenwich would date the sheet tomorrow and mark tonight's bills overdue.
const pad = n => String(n).padStart(2, "0");
const now = new Date();
const todayISO = arg("today", `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`);
const [ty, tm, td] = todayISO.split("-").map(Number);

const WINDOW = arg("window", td >= 5 && td < 20 ? "a" : "b").toLowerCase();
const MONTH  = arg("month", `${ty}-${pad(tm)}`);

// ── Compile the app's own modules and import them ────────────────────────────
const BUILD = join(os.tmpdir(), "pay-window-sheet-build");
rmSync(BUILD, { recursive: true, force: true });
mkdirSync(BUILD, { recursive: true });

// TypeScript's own entry point, run through node. The .bin/tsc.cmd shim needs a
// shell, and a shell mangles any project path containing a space or a comma.
const tscBin = join(ROOT, "node_modules", "typescript", "bin", "tsc");
if (!existsSync(tscBin)) {
  console.error("TypeScript not found — run `npm install` in the project first.");
  process.exit(1);
}
let tscOutput = "";
try {
  tscOutput = execFileSync(process.execPath, [
    tscBin,
    join(ROOT, "lib", "paySheet.ts"), join(ROOT, "lib", "finance.ts"), join(ROOT, "lib", "status.ts"),
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
const emitted = ["paySheet.js", "finance.js", "status.js"].map(f => join(BUILD, f));
if (!emitted.every(existsSync)) {
  console.error("Could not compile the sheet builder. tsc said:");
  console.error(tscOutput.trim());
  process.exit(1);
}
for (const p of emitted) writeFileSync(p, readFileSync(p, "utf8").replaceAll("@/lib/", "./"));

const mod = await import(pathToFileURL(join(BUILD, "paySheet.js")).href);
const { buildPaySheet } = mod.default ?? mod;

// ── Build ────────────────────────────────────────────────────────────────────
const entries = await (await fetch(API)).json();
if (!Array.isArray(entries)) {
  console.error("Unexpected response from", API);
  process.exit(1);
}

const sheet = buildPaySheet({ entries, monthKey: MONTH, window: WINDOW, today: todayISO });
const s = sheet.summary;
const money = v => "$" + v.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",");

const outDir  = arg("out", join(os.homedir(), "Downloads"));
const htmlOut = join(outDir, s.slug + ".html");
const pdfOut  = join(outDir, s.slug + ".pdf");
mkdirSync(outDir, { recursive: true });
writeFileSync(htmlOut, sheet.document);
// The Artifact tool takes the fragment, without the document wrapper.
writeFileSync(join(BUILD, "artifact.html"), sheet.fragment);

console.log(`\nStone Brook — ${s.title}`);
console.log(`  ${s.bills} bills, ${money(s.owed)} still owed`);
console.log(`  overdue ${money(s.overdue)} · due today ${money(s.dueToday)} · ` +
            `next 3 days ${money(s.upcoming)} · rest ${money(s.scheduled)}`);
console.log(`  income landing: ${s.incomeSources ? `${money(s.income)} (${s.incomeSources} sources)` : "none recorded"}`);
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
  console.log("\n  No Chrome or Edge found — open the HTML and print to PDF from the browser.\n");
  process.exit(0);
}
execFileSync(CHROME, ["--headless=new", "--disable-gpu", "--no-sandbox",
  "--virtual-time-budget=8000", "--no-pdf-header-footer",
  `--print-to-pdf=${pdfOut}`, pathToFileURL(htmlOut).href], { stdio: "pipe" });

const pages = (readFileSync(pdfOut).toString("latin1").match(/\/Type\s*\/Page[^s]/g) || []).length;
console.log(`  pdf      ${pdfOut}   (${pages} page${pages === 1 ? "" : "s"})`);
if (pages > 1) console.log("  note     more than one page — there are more bills than usual in this window.");
console.log("");
