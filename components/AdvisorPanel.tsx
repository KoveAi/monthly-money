"use client";

import { useMemo } from "react";
import type { Expense } from "@/components/ExpenseTable";
import {
  baselineMonths, buildBaseline, sectionBaselines, monthProgress,
  forecastEnvelopes, billOverruns, buildInsights,
  type EnvelopeForecast, type Insight,
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
  const view = useMemo(() => {
    if (!now) return null;
    const months    = baselineMonths(allExpenses, monthKey);
    const baselines = buildBaseline(allExpenses, months);
    const sections  = sectionBaselines(allExpenses, months);
    const progress  = monthProgress(monthKey, now);
    const envelopes = forecastEnvelopes(monthEntries, sections, progress);
    const overruns  = billOverruns(monthEntries, baselines);

    // Bills are known the moment they are billed; only spending has to be projected.
    const billsNow = monthEntries.reduce((s, e) => {
      const sec = sectionOf(e);
      if (sec === "income" || sec === "liens") return s;
      if (["groceries", "restaurants", "incidental", "fuel"].includes(sec)) return s;
      return s + budgetAmount(e);
    }, 0);
    const projectedVariable = envelopes.reduce((s, e) => s + e.projected, 0);
    const projected = Math.round((billsNow + projectedVariable) * 100) / 100;

    return {
      months, progress, envelopes, overruns, billsNow, projectedVariable, projected,
      insights: buildInsights(envelopes, overruns, projected, incomeExpected, progress),
      shortfall: Math.round((projected - incomeExpected) * 100) / 100,
    };
  }, [allExpenses, monthEntries, monthKey, now, incomeExpected]);

  if (!view || view.months.length === 0) return null;
  const { progress, envelopes, insights, shortfall } = view;
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
          Bills are {fmt(view.billsNow)}. Spending is running at {fmt(view.projectedVariable)} for the month,
          so this lands near <strong style={{ color: OBSIDIAN, fontWeight: 500 }}>{fmt(view.projected)}</strong> against{" "}
          {fmt(incomeExpected)} of income.
        </p>
      </div>

      {/* ── Envelope forecast ─────────────────────────────────────────────── */}
      <div className="grid px-6 py-2" style={{ gridTemplateColumns: "1fr 100px 110px 110px 130px", background: OBSIDIAN }}>
        {["SPENDING", "SO FAR", "PER DAY", "HEADING TO", "BUDGET"].map((h, i) => (
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
              <span className="text-xs font-mono" style={{ color: WARM_GRAY }}>{fmt(e.budget)}</span>
              <span className="block text-xs" style={{ color: "#BDBAB6" }}>{e.budgetNote}</span>
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
