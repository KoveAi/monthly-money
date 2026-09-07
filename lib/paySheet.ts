import { sectionOf, effectiveRemaining, budgetAmount, isPaused, type Classifiable, type Settleable } from "@/lib/finance";

// ─────────────────────────────────────────────────────────────────────────────
// The printable pay-window sheet. One page listing every bill still owed in a
// window, ordered by due date, with a tick box and a ruled note column — written
// to be printed and worked in pen.
//
// This is the single source of the sheet. The button in the dashboard and the
// command-line script both call it, so the printed sheet cannot drift from the
// screen it came from, or from itself between the two ways of asking for it.
// ─────────────────────────────────────────────────────────────────────────────

export type PayWindow = "a" | "b";

export type SheetEntry = Classifiable & Settleable & { monthKey: string };

export interface PaySheetInput {
  /** The whole ledger — the sheet picks what it needs. */
  entries: SheetEntry[];
  monthKey: string;
  window: PayWindow;
  /** Today as a local calendar date, YYYY-MM-DD. */
  today: string;
}

export interface PaySheetSummary {
  title: string;
  bills: number;
  owed: number;
  overdue: number;
  dueToday: number;
  upcoming: number;
  scheduled: number;
  income: number;
  incomeSources: number;
  /** Suggested file name, without an extension. */
  slug: string;
}

export interface PaySheet {
  /** Head and body markup without a document wrapper — what the Artifact tool takes. */
  fragment: string;
  /** A complete standalone document, for a print window or a saved file. */
  document: string;
  summary: PaySheetSummary;
}

const VARIABLE = ["groceries", "restaurants", "incidental", "fuel"];
const money = (v: number) => "$" + v.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
const esc = (s: string) => String(s).replace(/[&<>"]/g, c =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] as string));

const shiftMonth = (mk: string, by: number) => {
  const [y, m] = mk.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + by, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
};
const lastDay = (mk: string) => {
  const [y, m] = mk.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
};
const monthName = (mk: string, style: "long" | "short") => {
  const [y, m] = mk.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1))
    .toLocaleDateString("en-US", { month: style, timeZone: "UTC" });
};

/** Which window a date falls in: the 5th–19th, or the 20th through the 4th. */
export const windowOfDay = (day: number): PayWindow => (day >= 5 && day < 20 ? "a" : "b");

interface Row { date: string; bill: string; cat: string; amt: number; status: string }

export function buildPaySheet({ entries, monthKey, window: win, today }: PaySheetInput): PaySheet {
  const [ty, tm, td] = today.split("-").map(Number);
  const pad = (n: number) => String(n).padStart(2, "0");
  const soonDate = new Date(ty, tm - 1, td + 3);
  const soon = `${soonDate.getFullYear()}-${pad(soonDate.getMonth() + 1)}-${pad(soonDate.getDate())}`;

  // Calendar dates throughout. computeStatus compares a UTC due date against local
  // time, which labels tomorrow's bills "Due Today" anywhere west of UTC — harmless
  // on a dashboard, wrong on a sheet whose whole purpose is when to pay.
  const statusOf = (e: SheetEntry) => {
    if (e.status === "Paid as Agreed") return "Paid as Agreed";
    const due = String(e.dueDate).slice(0, 10);
    if (due < today) return "Overdue";
    if (due === today) return "Due Today";
    if (due <= soon) return "Upcoming";
    return "Scheduled";
  };

  const isBill = (e: SheetEntry) => {
    const s = sectionOf(e);
    return s !== "income" && s !== "liens" && !VARIABLE.includes(s);
  };
  const toRow = (e: SheetEntry, amount: number): Row => {
    const d = String(e.dueDate).slice(0, 10);
    return {
      date: `${d.slice(5, 7)}/${d.slice(8, 10)}/${d.slice(0, 4)}`,
      bill: e.description.trim(), cat: e.category.trim(),
      amt: Math.round(amount * 100) / 100, status: statusOf(e),
    };
  };

  const next = shiftMonth(monthKey, 1);
  // A window is one stretch of calendar, or two when it crosses a month end.
  const stretches = win === "a"
    ? [{ monthKey, to: 19, label: `${monthName(monthKey, "long")} 1–19, ${monthKey.slice(0, 4)}`,
         note: "Bills in the current 5th–20th pay window that still need money, plus anything earlier in the month still outstanding." }]
    : [{ monthKey, to: lastDay(monthKey), label: `${monthName(monthKey, "long")} 20–${lastDay(monthKey)}, ${monthKey.slice(0, 4)}`,
         note: "Bills in the current 20th–5th pay window that still need money, plus anything earlier in the month still outstanding." },
       { monthKey: next, to: 4, label: `${monthName(next, "long")} 1–4, ${next.slice(0, 4)}`,
         note: "The tail of the same pay window, falling in the following month." }];

  const sections = stretches.map(st => ({
    ...st,
    rows: entries
      // Anything still unpaid earlier in the month belongs here too: its date sits
      // before the window opened, but it has not stopped needing money.
      .filter(e => e.monthKey === st.monthKey && isBill(e) && !isPaused(e) && effectiveRemaining(e) > 0)
      .filter(e => Number(String(e.dueDate).slice(8, 10)) <= st.to)
      .map(e => toRow(e, effectiveRemaining(e)))
      .sort((a, b) => a.date.localeCompare(b.date) || b.amt - a.amt),
  })).filter(s => s.rows.length > 0);

  const from = win === "a" ? `${monthKey}-05` : `${monthKey}-20`;
  const to   = win === "a" ? `${monthKey}-20` : `${next}-04`;
  const income = entries
    .filter(e => e.frequency === "income" && !isPaused(e))
    .filter(e => { const d = String(e.dueDate).slice(0, 10); return d >= from && d <= to; })
    .map(e => toRow(e, budgetAmount(e)))
    .sort((a, b) => a.date.localeCompare(b.date));

  const all = sections.flatMap(s => s.rows);
  const sum = (rs: Row[]) => rs.reduce((t, r) => t + r.amt, 0);
  const of = (name: string) => sum(all.filter(r => r.status === name));

  const title = win === "a"
    ? `Bills due ${monthName(monthKey, "short")} 5 – ${monthName(monthKey, "short")} 20, ${monthKey.slice(0, 4)}`
    : `Bills due ${monthName(monthKey, "short")} 20 – ${monthName(next, "short")} 4, ${next.slice(0, 4)}`;
  const slug = win === "a" ? `Stone-Brook-${monthKey}-05-to-20` : `Stone-Brook-${monthKey}-20-to-${next}-04`;

  const readAt = new Date(ty, tm - 1, td)
    .toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" });

  const CHIP: Record<string, string> = {
    "Overdue": "s-overdue", "Due Today": "s-today", "Upcoming": "s-upcoming",
    "Scheduled": "s-scheduled", "Paid as Agreed": "s-scheduled",
  };

  const table = (rows: Row[], foot?: { label: string; total: number }) => `
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

  const head = `<title>Stone Brook ${win === "a" ? "Early" : "Late"} ${monthName(monthKey, "short")} Window</title>
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
  .masthead h1{margin:0;font-size:14px;font-weight:600;letter-spacing:.16em;text-transform:uppercase}
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
</style>`;

  const body = `<div class="sheet">
  <div class="masthead">
    <h1>Stone Brook Estate</h1>
    <span class="window">${esc(title)}</span>
  </div>
  <p class="source">Source: Monthly Money dashboard (monthly-money-psi.vercel.app), read ${esc(readAt)}.
     Amounts shown are LEFT OVER (still owed after payments already applied).</p>

  <div class="urgency">
    <div class="u-overdue"><span class="k">Overdue</span><span class="v">${money(of("Overdue"))}</span><span class="n">${all.filter(r => r.status === "Overdue").length} bills</span></div>
    <div class="u-today"><span class="k">Due today</span><span class="v">${money(of("Due Today"))}</span><span class="n">${all.filter(r => r.status === "Due Today").length} bills</span></div>
    <div class="u-upcoming"><span class="k">Next 3 days</span><span class="v">${money(of("Upcoming"))}</span><span class="n">${all.filter(r => r.status === "Upcoming").length} bills</span></div>
    <div class="u-later"><span class="k">Rest of window</span><span class="v">${money(of("Scheduled"))}</span><span class="n">${all.filter(r => r.status === "Scheduled").length} bills</span></div>
  </div>

  ${sections.map((s, i) => `
  <div class="band"><span class="num">${i + 1} &middot;</span> ${esc(s.label)} &nbsp;(unpaid)
    <span class="count">${s.rows.length} bills</span></div>
  <p class="band-note">${esc(s.note)} Ordered by due date.</p>
  ${table(s.rows, { label: `Subtotal — ${s.label}`, total: sum(s.rows) })}`).join("")}

  <div class="band"><span class="num">${sections.length + 1} &middot;</span> Income landing in the same stretch</div>
  ${income.length
    ? table(income, { label: "Total income expected", total: sum(income) })
    : `<p class="empty"><strong>No income entries exist for this window.</strong>
         Month generation copies recurring bills only &mdash; income is entered by hand.</p>`}

  <div class="footer">
    <span>Obligations (liens) excluded &mdash; balances carried until cleared, not payments due in this window.</span>
    <span>Tick the box as each is paid.</span>
    ${sections.length > 1 ? `<span>Window total: ${money(sum(all))}</span>` : ""}
  </div>
</div>`;

  return {
    fragment: head + "\n\n" + body,
    document: `<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n` +
      `<meta name="viewport" content="width=device-width, initial-scale=1">\n${head}\n</head>\n<body>\n${body}\n</body>\n</html>\n`,
    summary: {
      title, slug, bills: all.length, owed: Math.round(sum(all) * 100) / 100,
      overdue: of("Overdue"), dueToday: of("Due Today"),
      upcoming: of("Upcoming"), scheduled: of("Scheduled"),
      income: Math.round(sum(income) * 100) / 100, incomeSources: income.length,
    },
  };
}
