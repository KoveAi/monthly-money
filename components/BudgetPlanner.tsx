"use client";

import { useEffect, useMemo, useState } from "react";
import type { Expense } from "@/components/ExpenseTable";
import {
  rollupMonths, suggestPlan, estimatePlan, evaluatePlan, monthElapsed, annualSetAside,
  SECTION_KEYS, INCOME_BASIS_LABEL,
  type IncomeBasis, type SectionKey, type MonthRollup, type Plan,
} from "@/lib/budget";

const OBSIDIAN  = "#111111";
const GOLD      = "#B8976A";
const IVORY     = "#FAF9F6";
const SURFACE   = "#FFFFFF";
const BORDER    = "#E8E3DC";
const WARM_GRAY = "#6B6460";
const MUTED_GRN = "#2A6B4A";
const MUTED_RED = "#8B2020";
const AMBER     = "#8B5E2A";

const STORE_KEY = "mm-budget-plan-v1";

/** Where the suggested figures come from: averaged closed months, or one month read off directly. */
type PlanSource = "history" | "estimate";

type StoredPlan = {
  source?: PlanSource;
  basis?: IncomeBasis;
  income?: number;
  perCategory?: Partial<Record<SectionKey, number>>;
};
type Store = Record<string, StoredPlan>;

function fmt(v: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(v);
}
function fmtMonth(mk: string) {
  const [y, m] = mk.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("en-US", { month: "long", year: "numeric" });
}
function fmtMonthShort(mk: string) {
  const [y, m] = mk.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("en-US", { month: "short", year: "2-digit" });
}

function readStore(): Store {
  if (typeof window === "undefined") return {};
  try { return JSON.parse(window.localStorage.getItem(STORE_KEY) || "{}") as Store; }
  catch { return {}; }
}

export function BudgetPlanner({ allExpenses, monthKey }: { allExpenses: Expense[]; monthKey: string }) {
  // Read after mount only — localStorage is not available during the server render.
  const [store, setStore] = useState<Store>({});
  const [now, setNow] = useState<Date | null>(null);
  // Bumped to pop open a specific figure's editor from the fill-in checklist.
  const [focus, setFocus] = useState<{ key: string; n: number } | null>(null);

  useEffect(() => {
    setStore(readStore());
    setNow(new Date());
    // The reduction tab writes category targets into the same store; pick them up
    // without a reload so "send to planner" lands immediately.
    const sync = () => setStore(readStore());
    window.addEventListener("mm-plan-updated", sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener("mm-plan-updated", sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  function patchPlan(patch: StoredPlan) {
    setStore(prev => {
      const next: Store = { ...prev, [monthKey]: { ...prev[monthKey], ...patch } };
      try { window.localStorage.setItem(STORE_KEY, JSON.stringify(next)); } catch { /* quota / private mode */ }
      return next;
    });
  }

  function clearPlan() {
    setStore(prev => {
      const next = { ...prev };
      delete next[monthKey];
      try { window.localStorage.setItem(STORE_KEY, JSON.stringify(next)); } catch { /* quota / private mode */ }
      return next;
    });
  }

  const saved = store[monthKey] ?? {};
  const basis: IncomeBasis = saved.basis ?? "average";

  const months  = useMemo(() => rollupMonths(allExpenses), [allExpenses]);
  // Only closed months feed the averages — the month being planned is still filling up.
  const history = useMemo(() => months.filter(m => m.monthKey < monthKey), [months, monthKey]);
  const current = useMemo(() => months.find(m => m.monthKey === monthKey) ?? null, [months, monthKey]);
  const annual  = useMemo(() => annualSetAside(allExpenses, monthKey), [allExpenses, monthKey]);

  // The month an estimate is read off: the one being planned if it has anything in it,
  // otherwise the most recent month on record before it.
  const estimateBase = (current && current.entries > 0) ? current : (history.length ? history[history.length - 1] : null);

  const canUseHistory = history.length > 0;
  const source: PlanSource = saved.source ?? (canUseHistory ? "history" : "estimate");

  const suggestion = useMemo(
    () => source === "history" ? suggestPlan(history, basis, annual.monthly) : estimatePlan(estimateBase, annual.monthly),
    [source, history, basis, annual.monthly, estimateBase],
  );

  const plan: Plan = useMemo(() => ({
    income: saved.income ?? suggestion.plannedIncome,
    perCategory: SECTION_KEYS.reduce((acc, k) => {
      acc[k] = saved.perCategory?.[k] ?? suggestion.perCategory[k];
      return acc;
    }, {} as Record<SectionKey, number>),
  }), [saved.income, saved.perCategory, suggestion]);

  const elapsed = now ? monthElapsed(monthKey, now) : null;
  const result  = useMemo(() => evaluatePlan(plan, current, elapsed), [plan, current, elapsed]);

  const edited = saved.income !== undefined || Object.keys(saved.perCategory ?? {}).length > 0;

  /** Whether a figure is your own, read from the ledger, or still an unanswered blank. */
  function originOf(key: SectionKey): "yours" | "observed" | "blank" {
    if (saved.perCategory?.[key] !== undefined) return "yours";
    return suggestion.perCategory[key] > 0 ? "observed" : "blank";
  }
  const incomeOrigin: "yours" | "observed" | "blank" =
    saved.income !== undefined ? "yours" : suggestion.plannedIncome > 0 ? "observed" : "blank";

  const everRecorded = (key: SectionKey) => months.some(m => m.due[key] > 0);
  const blanks = result.lines.filter(l => originOf(l.key) === "blank");

  if (months.length === 0) {
    return (
      <div className="py-2">
        <SectionTitle monthKey={monthKey} />
        <div className="px-8 py-16 text-center" style={{ background: SURFACE, border: `1px solid ${BORDER}` }}>
          <p className="text-xs mb-3" style={{ color: OBSIDIAN, letterSpacing: "0.2em" }}>NOTHING ON RECORD YET</p>
          <p className="text-sm" style={{ color: WARM_GRAY }}>
            Add a month of expenses and income, then the planner has something to work from.
          </p>
        </div>
      </div>
    );
  }

  const incomeNote =
    incomeOrigin === "yours"                  ? "your figure"
    : suggestion.incomeSamples.length === 0   ? "no income on record — type what you expect"
    : source === "estimate"                   ? `${suggestion.incomeFromExpected ? "expected" : "received"} in ${fmtMonthShort(suggestion.monthsUsed[0])}`
    : basis === "recent"                      ? `last recorded month · ${fmtMonthShort(suggestion.monthsUsed[suggestion.monthsUsed.length - 1])}`
    : basis === "conservative"                ? `leanest of the last ${Math.min(3, suggestion.incomeSamples.length)} income months`
    : `mean of ${suggestion.incomeSamples.length} income month${suggestion.incomeSamples.length === 1 ? "" : "s"}`;

  const outflowPct = plan.income > 0 ? (result.plannedOutflow / plan.income) * 100 : 0;

  return (
    <div className="py-2">
      <SectionTitle monthKey={monthKey} />

      {/* ── Where the suggestion comes from ───────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-4 px-5 py-3 mb-4" style={{ background: SURFACE, border: `1px solid ${BORDER}` }}>
        <span className="text-xs" style={{ color: WARM_GRAY, letterSpacing: "0.14em" }}>
          {source === "history"
            ? `AVERAGED FROM ${history.length} CLOSED MONTH${history.length === 1 ? "" : "S"} · ${fmtMonthShort(history[0].monthKey).toUpperCase()} → ${fmtMonthShort(history[history.length - 1].monthKey).toUpperCase()}`
            : `ESTIMATED FROM ${estimateBase ? fmtMonth(estimateBase.monthKey).toUpperCase() : "—"}`}
        </span>
        <div className="flex flex-wrap items-center gap-2 ml-auto">
          <span className="text-xs" style={{ color: "#BDBAB6", letterSpacing: "0.12em" }}>BASED ON</span>
          <button onClick={() => patchPlan({ source: "history" })} disabled={!canUseHistory}
            className="px-3 py-1.5 text-xs transition-all disabled:opacity-40"
            style={source === "history"
              ? { background: OBSIDIAN, color: "#fff", border: `1px solid ${OBSIDIAN}`, letterSpacing: "0.1em" }
              : { background: "transparent", color: WARM_GRAY, border: `1px solid ${BORDER}`, letterSpacing: "0.1em" }}>
            CLOSED MONTHS
          </button>
          <button onClick={() => patchPlan({ source: "estimate" })} disabled={!estimateBase}
            className="px-3 py-1.5 text-xs transition-all disabled:opacity-40"
            style={source === "estimate"
              ? { background: OBSIDIAN, color: "#fff", border: `1px solid ${OBSIDIAN}`, letterSpacing: "0.1em" }
              : { background: "transparent", color: WARM_GRAY, border: `1px solid ${BORDER}`, letterSpacing: "0.1em" }}>
            ESTIMATE FROM {estimateBase ? fmtMonthShort(estimateBase.monthKey).toUpperCase() : "—"}
          </button>
          {source === "history" && (
            <>
              <span className="text-xs ml-2" style={{ color: "#BDBAB6", letterSpacing: "0.12em" }}>INCOME</span>
              {(["average", "conservative", "recent"] as const).map(b => (
                <button key={b} onClick={() => patchPlan({ basis: b, income: undefined })}
                  className="px-3 py-1.5 text-xs transition-all"
                  style={basis === b
                    ? { background: OBSIDIAN, color: "#fff", border: `1px solid ${OBSIDIAN}`, letterSpacing: "0.1em" }
                    : { background: "transparent", color: WARM_GRAY, border: `1px solid ${BORDER}`, letterSpacing: "0.1em" }}>
                  {INCOME_BASIS_LABEL[b]}
                </button>
              ))}
            </>
          )}
          {edited && (
            <button onClick={clearPlan} className="px-3 py-1.5 text-xs"
              style={{ background: "transparent", color: MUTED_RED, border: `1px solid ${BORDER}`, letterSpacing: "0.1em" }}>
              RESET TO SUGGESTED
            </button>
          )}
        </div>
      </div>

      {source === "estimate" && estimateBase && (
        <div className="px-5 py-4 mb-4 flex items-start gap-4" style={{ background: "#FDFBF7", border: `1px solid #E4D8C4` }}>
          <span style={{ color: AMBER, fontSize: 16, lineHeight: 1, marginTop: 1 }}>◆</span>
          <p className="text-sm leading-relaxed" style={{ color: WARM_GRAY }}>
            This is a first pass read straight off {fmtMonth(estimateBase.monthKey)} — one month, so treat every figure as a
            starting guess rather than a trend. Anything that month didn&apos;t record comes back as <strong style={{ color: OBSIDIAN, fontWeight: 500 }}>NEEDS A FIGURE</strong>;
            type what you think it should be and the plan updates. Once a second month closes, switch to <em>Closed Months</em> and
            the same lines get averaged from real history instead.
          </p>
        </div>
      )}

      {/* ── What still needs a number ─────────────────────────────────────── */}
      {(blanks.length > 0 || incomeOrigin === "blank") && (
        <div className="mb-4" style={{ background: SURFACE, border: `1px solid ${BORDER}`, borderLeft: `2px solid ${AMBER}` }}>
          <div className="px-5 py-3" style={{ borderBottom: `1px solid ${BORDER}` }}>
            <p className="text-xs font-semibold" style={{ color: OBSIDIAN, letterSpacing: "0.18em" }}>STILL TO FILL IN</p>
            <p className="text-xs mt-1" style={{ color: "#BDBAB6", letterSpacing: "0.04em" }}>
              Nothing on record for these, so the plan is treating them as zero. Click one to type your own figure.
            </p>
          </div>
          <div className="px-5 py-4 flex flex-wrap gap-2">
            {incomeOrigin === "blank" && (
              <button onClick={() => setFocus({ key: "income", n: (focus?.n ?? 0) + 1 })}
                className="px-3 py-1.5 text-xs transition-all hover:opacity-70"
                style={{ background: IVORY, color: OBSIDIAN, border: `1px solid ${BORDER}`, letterSpacing: "0.08em" }}>
                MONTHLY INCOME
              </button>
            )}
            {blanks.map(l => (
              <button key={l.key} onClick={() => setFocus({ key: l.key, n: (focus?.n ?? 0) + 1 })}
                className="px-3 py-1.5 text-xs transition-all hover:opacity-70"
                style={{ background: IVORY, color: OBSIDIAN, border: `1px solid ${BORDER}`, letterSpacing: "0.08em" }}>
                {l.label.toUpperCase()}
                <span style={{ color: "#BDBAB6", marginLeft: 8 }}>
                  {l.kind === "debt"     ? "nothing put against it yet"
                    : everRecorded(l.key) ? "not in this month"
                    : "never recorded"}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── Plan summary ──────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-4">
        <div style={{ background: SURFACE, border: `1px solid ${BORDER}`, borderTop: `2px solid ${GOLD}` }} className="p-5">
          <div className="flex items-center gap-2 mb-3">
            <p className="text-xs" style={{ color: WARM_GRAY, letterSpacing: "0.16em" }}>PLANNED INCOME</p>
            <OriginChip origin={incomeOrigin} />
          </div>
          <MoneyInput
            value={plan.income}
            onCommit={v => patchPlan({ income: v })}
            color={incomeOrigin === "blank" ? "#BDBAB6" : OBSIDIAN}
            large
            openSignal={focus?.key === "income" ? focus.n : 0}
          />
          <p className="text-xs mt-2" style={{ color: "#BDBAB6", letterSpacing: "0.06em" }}>{incomeNote}</p>
        </div>
        {[
          { label: "Fixed Commitments",  value: result.plannedFixed,    sub: "recurring bills",                                                    accent: OBSIDIAN },
          { label: "Annual Set-Aside",   value: result.plannedAnnual,   sub: `${annual.items.length} obligations · ${fmt(annual.yearly)}/yr ÷ 12`, accent: "#8A8078" },
          { label: "Obligation Paydown", value: result.plannedDebt,     sub: `of ${fmt(result.debtOutstanding)} still owed`,                       accent: MUTED_RED },
          { label: "Variable Envelopes", value: result.plannedVariable, sub: "food, fuel, incidental",                                             accent: "#4A7C59" },
        ].map(c => (
          <div key={c.label} style={{ background: SURFACE, border: `1px solid ${BORDER}`, borderTop: `2px solid ${c.accent}` }} className="p-5">
            <p className="text-xs mb-3" style={{ color: WARM_GRAY, letterSpacing: "0.16em" }}>{c.label.toUpperCase()}</p>
            <p className="text-2xl font-light tabular-nums" style={{ color: c.accent }}>{fmt(c.value)}</p>
            <p className="text-xs mt-2" style={{ color: "#BDBAB6", letterSpacing: "0.06em" }}>{c.sub}</p>
          </div>
        ))}
        <div className="p-5" style={{
          background: result.unallocated >= 0 ? SURFACE : "#FDF8F8",
          border: `1px solid ${BORDER}`,
          borderTop: `2px solid ${result.unallocated >= 0 ? MUTED_GRN : MUTED_RED}`,
        }}>
          <p className="text-xs mb-3" style={{ color: WARM_GRAY, letterSpacing: "0.16em" }}>UNALLOCATED</p>
          <p className="text-2xl font-light tabular-nums" style={{ color: result.unallocated >= 0 ? MUTED_GRN : MUTED_RED }}>
            {fmt(result.unallocated)}
          </p>
          <p className="text-xs mt-2" style={{ color: "#BDBAB6", letterSpacing: "0.06em" }}>
            {plan.income === 0 ? "no income figure yet" : result.unallocated >= 0 ? "free to save" : "plan exceeds income"}
          </p>
        </div>
      </div>

      {/* ── Allocation bar ────────────────────────────────────────────────── */}
      <div className="mb-8 px-6 py-5" style={{ background: SURFACE, border: `1px solid ${BORDER}` }}>
        <div className="flex justify-between mb-2">
          <p className="text-xs" style={{ color: WARM_GRAY, letterSpacing: "0.16em" }}>
            {plan.income > 0 ? `${Math.round(outflowPct)}% OF PLANNED INCOME ALLOCATED` : "NO INCOME FIGURE TO ALLOCATE AGAINST"}
          </p>
          <p className="text-xs tabular-nums" style={{ color: WARM_GRAY }}>
            {fmt(result.plannedOutflow)} of {fmt(plan.income)}
          </p>
        </div>
        <div className="flex h-2 w-full overflow-hidden" style={{ background: IVORY, border: `1px solid ${BORDER}` }}>
          {result.lines.filter(l => l.planned > 0).map(l => (
            <div key={l.key} title={`${l.label} · ${fmt(l.planned)}`}
              style={{ width: `${plan.income > 0 ? (l.planned / plan.income) * 100 : 0}%`, background: l.accent }} />
          ))}
        </div>
      </div>

      {/* ── Allocation table ──────────────────────────────────────────────── */}
      <div className="mb-10" style={{ border: `1px solid ${BORDER}` }}>
        <div className="grid px-6 py-2" style={{ gridTemplateColumns: "1fr 150px 130px 130px 120px", background: OBSIDIAN }}>
          {["CATEGORY", "PLANNED", "ACTUAL", "VARIANCE", "USED"].map((h, i) => (
            <p key={h} className="text-xs" style={{ color: "rgba(255,255,255,0.5)", letterSpacing: "0.14em", textAlign: i === 0 ? "left" : "right" }}>{h}</p>
          ))}
        </div>

        {(["fixed", "annual", "debt", "variable"] as const).map(kind => {
          const rows = result.lines.filter(l => l.kind === kind);
          const heading = kind === "fixed" ? "FIXED COMMITMENTS"
                        : kind === "annual" ? "SET ASIDE"
                        : kind === "debt"   ? `DEBT PAYDOWN · ${fmt(result.debtOutstanding)} OUTSTANDING`
                        : "VARIABLE ENVELOPES";
          return (
            <div key={kind}>
              <div className="px-6 py-2" style={{ background: IVORY, borderTop: `1px solid ${BORDER}`, borderBottom: `1px solid ${BORDER}` }}>
                <p className="text-xs" style={{ color: WARM_GRAY, letterSpacing: "0.18em" }}>{heading}</p>
              </div>
              {rows.map((l, i) => {
                const origin = originOf(l.key);
                return (
                  <div key={l.key} className="grid items-center px-6 py-3.5"
                    style={{ gridTemplateColumns: "1fr 150px 130px 130px 120px", background: i % 2 === 0 ? SURFACE : IVORY, borderBottom: `1px solid ${BORDER}` }}>
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-0.5 h-4 shrink-0" style={{ background: l.accent }} />
                      <span className="text-xs truncate" style={{ color: OBSIDIAN, letterSpacing: "0.1em" }}>{l.label.toUpperCase()}</span>
                      <OriginChip origin={origin} />
                      {l.aheadOfPace && (
                        <span className="text-xs px-2 py-0.5 shrink-0" style={{ background: "#FDF8F8", color: MUTED_RED, border: "1px solid #D4B5B5", letterSpacing: "0.06em" }}>
                          AHEAD OF PACE
                        </span>
                      )}
                    </div>
                    <div className="flex justify-end">
                      <MoneyInput
                        value={l.planned}
                        onCommit={v => patchPlan({ perCategory: { ...saved.perCategory, [l.key]: v } })}
                        color={origin === "blank" ? "#BDBAB6" : OBSIDIAN}
                        openSignal={focus?.key === l.key ? focus.n : 0}
                      />
                    </div>
                    <span className="text-xs font-mono text-right" style={{ color: WARM_GRAY }}>{fmt(l.actual)}</span>
                    <span className="text-xs font-mono text-right" style={{ color: l.variance < 0 ? MUTED_RED : l.variance > 0 ? MUTED_GRN : "#C8C4BF" }}>
                      {l.variance === 0 ? "—" : `${l.variance > 0 ? "+" : "−"}${fmt(Math.abs(l.variance))}`}
                    </span>
                    <div className="pl-4">
                      <div className="relative h-1 w-full" style={{ background: BORDER }}>
                        <div className="h-1 transition-all duration-700"
                          style={{ width: `${Math.min(l.usedPct, 100)}%`, background: l.usedPct > 100 ? MUTED_RED : l.accent }} />
                        {l.pacePct !== null && (
                          <div className="absolute top-0" title="where this month should be by now"
                            style={{ left: `${Math.min(l.pacePct, 100)}%`, width: 1, height: 4, marginTop: -1.5, background: OBSIDIAN }} />
                        )}
                      </div>
                      <p className="text-xs mt-1 tabular-nums text-right" style={{ color: l.usedPct > 100 ? MUTED_RED : "#BDBAB6" }}>
                        {l.planned > 0 ? `${Math.round(l.usedPct)}%` : "—"}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })}

        {/* Totals */}
        <div className="grid items-center px-6 py-4" style={{ gridTemplateColumns: "1fr 150px 130px 130px 120px", background: OBSIDIAN }}>
          <span className="text-xs" style={{ color: GOLD, letterSpacing: "0.2em" }}>TOTAL PLANNED OUTFLOW</span>
          <span className="text-sm font-light tabular-nums text-right" style={{ color: "#fff" }}>{fmt(result.plannedOutflow)}</span>
          <span className="text-sm font-light tabular-nums text-right" style={{ color: "rgba(255,255,255,0.75)" }}>{fmt(result.actualOutflow)}</span>
          <span className="text-sm font-light tabular-nums text-right"
            style={{ color: result.plannedOutflow - result.actualOutflow < 0 ? "#E38B8B" : "rgba(255,255,255,0.75)" }}>
            {fmt(result.plannedOutflow - result.actualOutflow)}
          </span>
          <span />
        </div>
      </div>

      {/* ── This month against the plan ───────────────────────────────────── */}
      <div className="mb-10" style={{ border: `1px solid ${BORDER}`, background: SURFACE }}>
        <div className="px-6 py-3" style={{ background: IVORY, borderBottom: `1px solid ${BORDER}` }}>
          <p className="text-xs font-semibold" style={{ color: OBSIDIAN, letterSpacing: "0.2em" }}>
            {fmtMonth(monthKey).toUpperCase()} AGAINST PLAN
            {elapsed !== null && <span style={{ color: WARM_GRAY, fontWeight: 400 }}> · {Math.round(elapsed * 100)}% OF THE MONTH ELAPSED</span>}
          </p>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 divide-x" style={{ borderColor: BORDER }}>
          {[
            { label: "INCOME RECEIVED", value: fmt(result.actualIncome),  sub: `${fmt(Math.max(plan.income - result.actualIncome, 0))} still expected`, color: MUTED_GRN },
            { label: "SPENT SO FAR",    value: fmt(result.actualOutflow), sub: `${fmt(result.actualBillsPaid)} bills · ${fmt(result.actualDebtPaid)} debt · ${fmt(result.actualVariableSpent)} variable`, color: OBSIDIAN },
            { label: "NET TO DATE",     value: fmt(result.actualNet),     sub: "received less spent", color: result.actualNet >= 0 ? MUTED_GRN : MUTED_RED },
            { label: "PROJECTED NET",   value: fmt(result.projectedNet),  sub: elapsed !== null ? "at the current pace" : "month closed", color: result.projectedNet >= 0 ? MUTED_GRN : MUTED_RED },
          ].map(c => (
            <div key={c.label} className="px-6 py-5">
              <p className="text-xs mb-2" style={{ color: WARM_GRAY, letterSpacing: "0.16em" }}>{c.label}</p>
              <p className="text-xl font-light tabular-nums" style={{ color: c.color }}>{c.value}</p>
              <p className="text-xs mt-2" style={{ color: "#BDBAB6", letterSpacing: "0.06em" }}>{c.sub}</p>
            </div>
          ))}
        </div>
      </div>

      {/* ── Month history ─────────────────────────────────────────────────── */}
      <MonthHistory months={months} planningMonth={monthKey} />
    </div>
  );
}

function SectionTitle({ monthKey }: { monthKey: string }) {
  return (
    <p className="text-xs mb-6" style={{ color: WARM_GRAY, letterSpacing: "0.2em" }}>
      BUDGET PLANNER — {fmtMonth(monthKey).toUpperCase()}
    </p>
  );
}

function OriginChip({ origin }: { origin: "yours" | "observed" | "blank" }) {
  if (origin === "observed") return null;
  const yours = origin === "yours";
  return (
    <span className="text-xs px-2 py-0.5 shrink-0 whitespace-nowrap"
      style={yours
        ? { background: "#F8FBF9", color: MUTED_GRN, border: "1px solid #C6DCCD", letterSpacing: "0.06em" }
        : { background: "#FDFBF7", color: AMBER,     border: "1px solid #E4D8C4", letterSpacing: "0.06em" }}>
      {yours ? "YOUR FIGURE" : "NEEDS A FIGURE"}
    </span>
  );
}

/** Click-to-edit currency figure. Commits on blur or Enter, reverts on Escape. */
function MoneyInput({ value, onCommit, color, large, openSignal = 0 }: {
  value: number; onCommit: (v: number) => void; color: string; large?: boolean; openSignal?: number;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");

  // The fill-in checklist bumps openSignal to jump straight into this field.
  useEffect(() => {
    if (openSignal > 0) { setDraft(value ? String(value) : ""); setEditing(true); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openSignal]);

  if (!editing) {
    return (
      <button onClick={() => { setDraft(value ? String(value) : ""); setEditing(true); }}
        className={`tabular-nums text-right hover:opacity-60 transition-opacity ${large ? "text-2xl font-light" : "text-xs font-mono"}`}
        style={{ color, borderBottom: `1px dashed ${BORDER}` }}>
        {fmt(value)}
      </button>
    );
  }
  const commit = () => {
    const v = parseFloat(draft);
    setEditing(false);
    if (!isNaN(v) && v >= 0) onCommit(Math.round(v * 100) / 100);
  };
  return (
    <input autoFocus type="number" step="0.01" min="0" value={draft} placeholder="0.00"
      onChange={e => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={e => { if (e.key === "Enter") commit(); if (e.key === "Escape") setEditing(false); }}
      className={`tabular-nums text-right bg-transparent focus:outline-none ${large ? "text-2xl font-light w-full" : "text-xs font-mono w-24"}`}
      style={{ color: OBSIDIAN, borderBottom: `1px solid ${GOLD}` }} />
  );
}

function MonthHistory({ months, planningMonth }: { months: MonthRollup[]; planningMonth: string }) {
  const rows = months.slice().reverse().slice(0, 13);
  const peak = Math.max(1, ...rows.map(m => Math.max(m.incomeReceived, m.outflow)));

  return (
    <div style={{ border: `1px solid ${BORDER}` }}>
      <div className="px-6 py-3" style={{ background: IVORY, borderBottom: `1px solid ${BORDER}` }}>
        <p className="text-xs font-semibold" style={{ color: OBSIDIAN, letterSpacing: "0.2em" }}>MONTHS ON RECORD</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr style={{ background: OBSIDIAN }}>
              {["MONTH", "INCOME RECEIVED", "BILLS PAID", "VARIABLE", "NET", "SAVED", "INCOME VS OUTFLOW"].map((h, i) => (
                <th key={h} className="px-4 py-3"
                  style={{ color: "rgba(255,255,255,0.5)", fontSize: 9, letterSpacing: "0.14em", fontWeight: 600, textAlign: i === 0 || i === 6 ? "left" : "right" }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((m, i) => (
              <tr key={m.monthKey} style={{ background: i % 2 === 0 ? SURFACE : IVORY, borderBottom: `1px solid ${BORDER}` }}>
                <td className="px-4 py-3 whitespace-nowrap">
                  <span className="text-xs" style={{ color: OBSIDIAN, letterSpacing: "0.08em" }}>{fmtMonth(m.monthKey)}</span>
                  {m.monthKey === planningMonth && (
                    <span className="ml-2 text-xs px-1.5 py-0.5" style={{ background: IVORY, color: GOLD, border: `1px solid ${BORDER}`, letterSpacing: "0.06em" }}>PLANNING</span>
                  )}
                </td>
                <td className="px-4 py-3 text-right text-xs font-mono" style={{ color: m.incomeReceived > 0 ? MUTED_GRN : "#C8C4BF" }}>{fmt(m.incomeReceived)}</td>
                <td className="px-4 py-3 text-right text-xs font-mono" style={{ color: WARM_GRAY }}>{fmt(m.billsPaid)}</td>
                <td className="px-4 py-3 text-right text-xs font-mono" style={{ color: WARM_GRAY }}>{fmt(m.variableSpent)}</td>
                <td className="px-4 py-3 text-right text-xs font-mono" style={{ color: m.net >= 0 ? MUTED_GRN : MUTED_RED }}>{fmt(m.net)}</td>
                <td className="px-4 py-3 text-right text-xs font-mono" style={{ color: m.savingsRate >= 0 ? WARM_GRAY : MUTED_RED }}>
                  {m.incomeReceived > 0 ? `${Math.round(m.savingsRate * 100)}%` : "—"}
                </td>
                <td className="px-4 py-3" style={{ minWidth: 200 }}>
                  <div className="flex flex-col gap-1">
                    <div className="h-1.5" style={{ width: `${(m.incomeReceived / peak) * 100}%`, background: MUTED_GRN, minWidth: m.incomeReceived > 0 ? 2 : 0 }} />
                    <div className="h-1.5" style={{ width: `${(m.outflow / peak) * 100}%`, background: m.outflow > m.incomeReceived ? MUTED_RED : GOLD, minWidth: m.outflow > 0 ? 2 : 0 }} />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="px-6 py-3 flex items-center gap-5" style={{ borderTop: `1px solid ${BORDER}`, background: IVORY }}>
        {[[MUTED_GRN, "INCOME RECEIVED"], [GOLD, "OUTFLOW"], [MUTED_RED, "OUTFLOW OVER INCOME"]].map(([c, l]) => (
          <div key={l} className="flex items-center gap-2">
            <div style={{ width: 10, height: 3, background: c }} />
            <span className="text-xs" style={{ color: WARM_GRAY, letterSpacing: "0.1em" }}>{l}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
