"use client";

import { useMemo, useState } from "react";
import type { Expense } from "@/components/ExpenseTable";
import {
  baselineMonths, buildBaseline, sectionBaselines, monthProgress,
  forecastEnvelopes, billOverruns, buildInsights,
  affordability, applyAffordability, buildCommentary, arrearsPosition, arrearsComment, costStructure,
  type EnvelopeForecast, type Insight, type Comment, type CostItem,
} from "@/lib/advisor";
import { budgetAmount, sectionOf } from "@/lib/finance";

const OBSIDIAN  = "#111111";
const GOLD      = "#B8976A";
const IVORY     = "#FAF9F6";
const SURFACE   = "#FFFFFF";
const BORDER    = "#E8E3DC";
const WARM_GRAY = "#6B6460";
const MUTED_GRN = "#2A6B4A";
const MUTED_RED = "#8B2020";
const AMBER     = "#8B5E2A";

const fmt = (v: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(v);
const fmtMonth = (mk: string) => {
  const [y, m] = mk.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("en-US", { month: "short", year: "numeric" });
};

const TRACK: Record<EnvelopeForecast["state"], { label: string; color: string; bg: string; border: string }> = {
  over:           { label: "OVER BUDGET",  color: MUTED_RED, bg: "#FAF2F2", border: "#D4B5B5" },
  "heading-over": { label: "HEADING OVER", color: AMBER,     bg: "#FDFBF7", border: "#E4D8C4" },
  "on-track":     { label: "ON TRACK",     color: MUTED_GRN, bg: "#F2F8F5", border: "#B5D4C0" },
  under:          { label: "UNDER",        color: MUTED_GRN, bg: "#F2F8F5", border: "#B5D4C0" },
};

const COMMENT_TONE: Record<Comment["tone"], { color: string; bg: string; border: string }> = {
  hard:    { color: MUTED_RED, bg: "#FDF8F8", border: "#D4B5B5" },
  action:  { color: AMBER,     bg: "#FDFBF7", border: "#E4D8C4" },
  context: { color: WARM_GRAY, bg: "#FAF9F6", border: BORDER },
  good:    { color: MUTED_GRN, bg: "#F8FBF9", border: "#C6DCCD" },
};

const TONE: Record<Insight["tone"], { mark: string; color: string }> = {
  watch:     { mark: "▲", color: MUTED_RED },
  cut:       { mark: "◆", color: AMBER },
  protected: { mark: "◈", color: "#8B5E7A" },
  good:      { mark: "●", color: MUTED_GRN },
};

export function AdvisorPanel({ allExpenses, monthEntries, monthKey, now, incomeExpected }: {
  allExpenses: Expense[];
  monthEntries: Expense[];
  monthKey: string;
  now: Date | null;
  incomeExpected: number;
}) {
  const [openGroup, setOpenGroup] = useState<string | null>(null);

  const view = useMemo(() => {
    if (!now) return null;
    const months    = baselineMonths(allExpenses, monthKey);
    const baselines = buildBaseline(allExpenses, months);
    const sections  = sectionBaselines(allExpenses, months);
    const progress  = monthProgress(monthKey, now);
    const rawEnvelopes = forecastEnvelopes(monthEntries, sections, progress);
    const overruns  = billOverruns(monthEntries, baselines);

    // Bills are known the moment they are billed; only spending has to be projected.
    const billsNow = monthEntries.reduce((s, e) => {
      const sec = sectionOf(e);
      if (sec === "income" || sec === "liens") return s;
      if (["groceries", "restaurants", "incidental", "fuel"].includes(sec)) return s;
      return s + budgetAmount(e);
    }, 0);
    // Scale the envelopes to what this month's income can actually carry, so a lean
    // month tightens every target and a strong one loosens them, with no input.
    const afford    = affordability(billsNow, incomeExpected, rawEnvelopes);
    const envelopes = applyAffordability(rawEnvelopes, afford, progress);
    // Catching up is tracked beside the month, not inside it: billsNow is this
    // month's charges only, so a payment against old debt never reads as overspend.
    const arrears   = arrearsPosition(monthEntries);
    // Food and fuel are under-reported mid-month, so the structure view uses each
    // envelope's full-month figure — otherwise the 12th always flatters the picture.
    const variableRows: CostItem[] = envelopes.map(e => ({
      description: e.label,
      amount: sections[e.key] ?? e.projected,
      paid: e.spent,
      carried: 0,
    }));
    const structure = costStructure(monthEntries, incomeExpected, variableRows);

    const projectedVariable = envelopes.reduce((s, e) => s + e.projected, 0);
    const projected = Math.round((billsNow + projectedVariable) * 100) / 100;

    return {
      months, progress, envelopes, overruns, billsNow, projectedVariable, projected, afford, structure,
      insights: buildInsights(envelopes, overruns, projected, incomeExpected, progress),
      arrears,
      comments: [arrearsComment(arrears, progress), ...buildCommentary(afford, envelopes, overruns, projected, progress)],
      shortfall: Math.round((projected - incomeExpected) * 100) / 100,
    };
  }, [allExpenses, monthEntries, monthKey, now, incomeExpected]);

  if (!view || view.months.length === 0) return null;
  const { progress, envelopes, insights, comments, afford, arrears, structure, shortfall } = view;
  const ok = shortfall <= 0;

  return (
    <div className="mb-8" style={{ border: `1px solid ${BORDER}`, background: SURFACE }}>

      {/* ── Verdict ───────────────────────────────────────────────────────── */}
      <div className="px-6 py-5" style={{
        background: ok ? "#F8FBF9" : "#FDF8F8",
        borderBottom: `1px solid ${BORDER}`,
        borderLeft: `2px solid ${ok ? MUTED_GRN : MUTED_RED}`,
      }}>
        <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1">
          <p className="text-xs" style={{ color: ok ? MUTED_GRN : MUTED_RED, letterSpacing: "0.2em" }}>
            {ok ? `FORECAST — ${fmt(Math.abs(shortfall))} UNDER INCOME` : `FORECAST — ${fmt(shortfall)} OVER INCOME`}
          </p>
          <span className="text-xs ml-auto" style={{ color: "#BDBAB6", letterSpacing: "0.06em" }}>
            DAY {progress.daysGone} OF {progress.daysIn} · MEASURED AGAINST {view.months.map(fmtMonth).join(" & ").toUpperCase()}
          </span>
        </div>
        <p className="text-sm mt-2 leading-relaxed" style={{ color: WARM_GRAY }}>
          This month&apos;s charges are {fmt(view.billsNow)} of {fmt(incomeExpected)}, leaving{" "}
          <strong style={{ color: afford.available < 0 ? MUTED_RED : OBSIDIAN, fontWeight: 500 }}>{fmt(afford.available)}</strong>{" "}
          for everything else. Spending is running at {fmt(view.projectedVariable)}, so the month lands near{" "}
          <strong style={{ color: OBSIDIAN, fontWeight: 500 }}>{fmt(view.projected)}</strong>.
          {arrears.opening > 0 && (
            <> Separately, {fmt(arrears.opening)} of arrears came in and {fmt(arrears.paidDown)} of it is cleared —
            catching up is not counted against the month.</>
          )}
        </p>
      </div>

      {/* ── Comments: the written assessment ──────────────────────────────── */}
      <div className="px-6 py-3" style={{ background: IVORY, borderBottom: `1px solid ${BORDER}` }}>
        <p className="text-xs font-semibold" style={{ color: OBSIDIAN, letterSpacing: "0.2em" }}>WHERE WE ARE</p>
      </div>
      <div className="px-6 py-5 grid gap-3 md:grid-cols-2" style={{ borderBottom: `1px solid ${BORDER}` }}>
        {comments.map((c, i) => {
          const t = COMMENT_TONE[c.tone];
          return (
            <div key={i} className="px-5 py-4" style={{ background: t.bg, border: `1px solid ${t.border}`, borderLeft: `2px solid ${t.color}` }}>
              <p className="text-sm mb-1.5" style={{ color: t.color, fontWeight: 500 }}>{c.heading}</p>
              <p className="text-xs leading-relaxed" style={{ color: WARM_GRAY }}>{c.body}</p>
            </div>
          );
        })}
      </div>

      {/* ── Where the money goes ──────────────────────────────────────────── */}
      <div className="px-6 py-3 flex flex-wrap items-baseline gap-x-4" style={{ background: IVORY, borderBottom: `1px solid ${BORDER}` }}>
        <p className="text-xs font-semibold" style={{ color: OBSIDIAN, letterSpacing: "0.2em" }}>WHERE THE MONEY GOES</p>
        <span className="text-xs" style={{ color: structure.ratio > 1 ? MUTED_RED : MUTED_GRN, letterSpacing: "0.06em" }}>
          {fmt(structure.total)} of spending against {fmt(structure.income)} of income —{" "}
          <strong style={{ fontWeight: 500 }}>
            {structure.ratio > 1
              ? `$${structure.ratio.toFixed(2)} spent for every $1.00 earned`
              : `${Math.round(structure.ratio * 100)}% of income committed`}
          </strong>
        </span>
        <span className="text-xs ml-auto" style={{ color: "#BDBAB6" }}>
          top {structure.topCount} bills are {Math.round(structure.topShare * 100)}% of the bill base
        </span>
      </div>
      {structure.rows.map((r, i) => {
        const open = openGroup === r.name;
        return (
        <div key={r.name} style={{ borderBottom: `1px solid ${BORDER}` }}>
        <button onClick={() => setOpenGroup(open ? null : r.name)}
          className="w-full grid items-center px-6 py-3 text-left hover:opacity-80 transition-opacity"
          style={{ gridTemplateColumns: "1fr 120px 90px 1fr", background: i % 2 ? IVORY : SURFACE }}>
          <div className="flex items-center gap-3 min-w-0">
            <span style={{ color: GOLD, fontSize: 9, width: 8 }}>{open ? "▾" : "▸"}</span>
            <span className="text-xs" style={{ color: OBSIDIAN, letterSpacing: "0.08em" }}>{r.name.toUpperCase()}</span>
            <span className="text-xs" style={{ color: "#BDBAB6" }}>{r.lines} {r.lines === 1 ? "line" : "lines"}</span>
            {r.overBenchmark && (
              <span className="text-xs px-2 py-0.5 shrink-0" style={{ background: "#FAF2F2", color: MUTED_RED, border: "1px solid #D4B5B5", letterSpacing: "0.06em" }}>
                {Math.round((r.benchmark ?? 0) * 100)}% IS THE CEILING
              </span>
            )}
          </div>
          <span className="text-xs font-mono text-right" style={{ color: OBSIDIAN }}>{fmt(r.amount)}</span>
          <span className="text-xs font-mono text-right" style={{ color: r.overBenchmark ? MUTED_RED : WARM_GRAY }}>
            {Math.round(r.share * 100)}%
          </span>
          <div className="pl-5 flex items-center gap-3">
            <div className="flex-1 h-1.5" style={{ background: BORDER }}>
              <div className="h-1.5" style={{ width: `${Math.min(r.share * 100, 100)}%`, background: r.overBenchmark ? MUTED_RED : r.name === "Business & marketing" ? "#8B5E7A" : GOLD }} />
            </div>
            {r.benchmarkNote && r.overBenchmark && (
              <span className="text-xs shrink-0" style={{ color: "#BDBAB6", maxWidth: 300 }}>{r.benchmarkNote}</span>
            )}
          </div>
        </button>

        {open && (
          <div style={{ background: "#FCFBF9", borderTop: `1px solid ${BORDER}` }}>
            {r.items.map((it, n) => (
              <div key={it.description + n} className="grid items-center px-6 py-2"
                style={{ gridTemplateColumns: "1fr 120px 90px 1fr" }}>
                <span className="text-xs pl-6 truncate" style={{ color: WARM_GRAY }}>
                  {it.description}
                  {it.carried > 0 && <span style={{ color: MUTED_RED }}> · {fmt(it.carried)} carried</span>}
                </span>
                <span className="text-xs font-mono text-right" style={{ color: OBSIDIAN }}>{fmt(it.amount)}</span>
                <span className="text-xs font-mono text-right" style={{ color: it.paid >= it.amount ? MUTED_GRN : "#BDBAB6" }}>
                  {it.paid > 0 ? fmt(it.paid) : "—"}
                </span>
                <span className="text-xs pl-5" style={{ color: "#BDBAB6" }}>
                  {it.paid >= it.amount ? "paid" : it.paid > 0 ? "part paid" : "unpaid"}
                </span>
              </div>
            ))}
            <div className="px-6 py-2 grid" style={{ gridTemplateColumns: "1fr 120px 90px 1fr", borderTop: `1px solid ${BORDER}` }}>
              <span className="text-xs pl-6" style={{ color: "#BDBAB6", letterSpacing: "0.1em" }}>AMOUNT · PAID</span>
              <span className="text-xs font-mono text-right" style={{ color: OBSIDIAN, fontWeight: 500 }}>{fmt(r.amount)}</span>
              <span className="text-xs font-mono text-right" style={{ color: MUTED_GRN }}>{fmt(r.items.reduce((s2, x) => s2 + x.paid, 0))}</span>
              <span />
            </div>
          </div>
        )}
        </div>
        );
      })}

      {/* ── Envelope forecast ─────────────────────────────────────────────── */}
      <div className="grid px-6 py-2" style={{ gridTemplateColumns: "1fr 100px 110px 110px 130px", background: OBSIDIAN }}>
        {["SPENDING", "SO FAR", "PER DAY", "HEADING TO", "CAN AFFORD"].map((h, i) => (
          <p key={h} className="text-xs" style={{ color: "rgba(255,255,255,0.5)", letterSpacing: "0.14em", textAlign: i === 0 ? "left" : "right" }}>{h}</p>
        ))}
      </div>
      {envelopes.map((e, i) => {
        const t = TRACK[e.state];
        return (
          <div key={e.key} className="grid items-center px-6 py-3"
            style={{ gridTemplateColumns: "1fr 100px 110px 110px 130px", background: i % 2 ? IVORY : SURFACE, borderBottom: `1px solid ${BORDER}` }}>
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-0.5 h-4 shrink-0" style={{ background: e.accent }} />
              <span className="text-xs" style={{ color: OBSIDIAN, letterSpacing: "0.08em" }}>{e.label.toUpperCase()}</span>
              <span className="text-xs px-2 py-0.5 shrink-0"
                style={{ color: t.color, background: t.bg, border: `1px solid ${t.border}`, letterSpacing: "0.06em" }}>
                {t.label}{e.overBy > 0 ? ` ${fmt(e.overBy)}` : ""}
              </span>
              {e.protectedFromCuts && (
                <span className="text-xs px-2 py-0.5 shrink-0" style={{ color: "#8B5E7A", background: "#FBF7FA", border: "1px solid #DCC8D6", letterSpacing: "0.06em" }}>
                  PROTECTED
                </span>
              )}
            </div>
            <span className="text-xs font-mono text-right" style={{ color: WARM_GRAY }}>{fmt(e.spent)}</span>
            <span className="text-xs font-mono text-right" style={{ color: "#BDBAB6" }}>{fmt(e.perDay)}</span>
            <span className="text-xs font-mono text-right" style={{ color: e.overBy > 0 ? MUTED_RED : OBSIDIAN }}>{fmt(e.projected)}</span>
            <div className="text-right">
              <span className="text-xs font-mono" style={{ color: WARM_GRAY }}>{fmt(e.target)}</span>
              <span className="block text-xs" style={{ color: "#BDBAB6" }}>
                {e.target < e.budget ? `plan ${fmt(e.budget)} · ${e.budgetNote}` : e.budgetNote}
              </span>
            </div>
          </div>
        );
      })}

      {/* ── Advice ────────────────────────────────────────────────────────── */}
      <div className="px-6 py-3" style={{ background: IVORY, borderTop: `1px solid ${BORDER}`, borderBottom: `1px solid ${BORDER}` }}>
        <p className="text-xs font-semibold" style={{ color: OBSIDIAN, letterSpacing: "0.2em" }}>WHERE TO CUT BACK</p>
      </div>
      <div className="divide-y" style={{ borderColor: BORDER }}>
        {insights.map((ins, i) => (
          <div key={i} className="px-6 py-4 flex items-start gap-4">
            <span style={{ color: TONE[ins.tone].color, fontSize: 13, lineHeight: 1.4, flexShrink: 0 }}>{TONE[ins.tone].mark}</span>
            <div className="min-w-0">
              <p className="text-sm" style={{ color: OBSIDIAN }}>{ins.headline}</p>
              <p className="text-xs mt-1 leading-relaxed" style={{ color: WARM_GRAY }}>{ins.detail}</p>
            </div>
            {ins.saving > 0 && (
              <span className="text-xs font-mono ml-auto shrink-0" style={{ color: MUTED_GRN }}>recovers {fmt(ins.saving)}</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
