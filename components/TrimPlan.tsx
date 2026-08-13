"use client";

import { useEffect, useMemo, useState } from "react";
import type { Expense } from "@/components/ExpenseTable";
import { buildTrimPlan, targetsBySection, TIER_META, type Tier, type TrimItem } from "@/lib/trim";
import { rollupMonths, suggestPlan, estimatePlan, annualSetAside, type IncomeBasis } from "@/lib/budget";

const OBSIDIAN  = "#111111";
const GOLD      = "#B8976A";
const IVORY     = "#FAF9F6";
const SURFACE   = "#FFFFFF";
const BORDER    = "#E8E3DC";
const WARM_GRAY = "#6B6460";
const MUTED_GRN = "#2A6B4A";
const MUTED_RED = "#8B2020";
const AMBER     = "#8B5E2A";

const STORE_KEY = "mm-trim-plan-v1";
/** The planner's store — targets are written here so both tabs stay in step. */
const PLAN_KEY  = "mm-budget-plan-v1";

const TIER_ORDER: Tier[] = ["discretionary", "negotiable", "variable", "business", "locked"];

function fmt(v: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(v);
}
function fmtMonth(mk: string) {
  const [y, m] = mk.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("en-US", { month: "long", year: "numeric" });
}
function read<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try { return JSON.parse(window.localStorage.getItem(key) || "null") ?? fallback; }
  catch { return fallback; }
}

type Store = Record<string, Record<string, number>>;

export function TrimPlan({ allExpenses, monthKey, incomeExpected }: { allExpenses: Expense[]; monthKey: string; incomeExpected: number }) {
  const [store, setStore] = useState<Store>({});
  const [plan, setPlan] = useState<{ income?: number; basis?: IncomeBasis; perCategory?: Record<string, number> }>({});
  const [openTier, setOpenTier] = useState<Tier | null>("discretionary");
  const [showKept, setShowKept] = useState(false);

  useEffect(() => {
    const sync = () => {
      setStore(read<Store>(STORE_KEY, {}));
      setPlan(read<Record<string, any>>(PLAN_KEY, {})[monthKey] ?? {});
    };
    sync();
    window.addEventListener("mm-plan-updated", sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener("mm-plan-updated", sync);
      window.removeEventListener("storage", sync);
    };
  }, [monthKey]);

  // Income and the two set-asides come from the planner — the same derivation, so
  // the two tabs can never disagree. A figure you typed there wins; otherwise this
  // falls back to what the planner suggests from your history, exactly as it does.
  const derived = useMemo(() => {
    const months  = rollupMonths(allExpenses);
    const history = months.filter(m => m.monthKey < monthKey);
    const current = months.find(m => m.monthKey === monthKey) ?? null;
    const annual  = annualSetAside(allExpenses, monthKey);
    const base    = (current && current.entries > 0) ? current : (history.length ? history[history.length - 1] : null);
    return history.length
      ? suggestPlan(history, plan.basis ?? "average", annual.monthly)
      : estimatePlan(base, annual.monthly);
  }, [allExpenses, monthKey, plan.basis]);

  // The month's actual recorded income, same figure the advisor scores against.
  const income        = incomeExpected || plan.income || derived.plannedIncome;
  const annualMonthly = plan.perCategory?.annual ?? derived.perCategory.annual;
  const debtPaydown   = plan.perCategory?.liens  ?? derived.perCategory.liens;
  const incomeIsYours = plan.income !== undefined;

  const overrides = store[monthKey] ?? {};

  const result = useMemo(() => buildTrimPlan({
    entries: allExpenses, monthKey, income, annualMonthly, debtPaydown, overrides,
  }), [allExpenses, monthKey, income, annualMonthly, debtPaydown, overrides]);

  function setTarget(key: string, value: number | null) {
    setStore(prev => {
      const forMonth = { ...(prev[monthKey] ?? {}) };
      if (value === null) delete forMonth[key]; else forMonth[key] = value;
      const next = { ...prev, [monthKey]: forMonth };
      try { window.localStorage.setItem(STORE_KEY, JSON.stringify(next)); } catch { /* private mode */ }
      return next;
    });
  }

  /** Push the per-category totals into the planner so its figures follow these cuts. */
  function applyToPlanner() {
    const sections = targetsBySection(result);
    const all = read<Record<string, any>>(PLAN_KEY, {});
    const forMonth = { ...(all[monthKey] ?? {}) };
    forMonth.perCategory = { ...(forMonth.perCategory ?? {}), ...sections };
    const next = { ...all, [monthKey]: forMonth };
    try { window.localStorage.setItem(PLAN_KEY, JSON.stringify(next)); } catch { /* private mode */ }
    window.dispatchEvent(new Event("mm-plan-updated"));
  }

  // Only when there is genuinely no income anywhere — not merely no override.
  if (!income) {
    return (
      <div className="py-2">
        <Title monthKey={monthKey} />
        <div className="px-8 py-16 text-center" style={{ background: SURFACE, border: `1px solid ${BORDER}` }}>
          <p className="text-xs mb-3" style={{ color: OBSIDIAN, letterSpacing: "0.2em" }}>NO INCOME ON RECORD</p>
          <p className="text-sm" style={{ color: WARM_GRAY, maxWidth: 520, margin: "0 auto" }}>
            There is nothing to reduce toward until this knows what you earn. Record income on the{" "}
            <strong style={{ color: OBSIDIAN, fontWeight: 500 }}>INCOME</strong> tab, or set PLANNED INCOME on the{" "}
            <strong style={{ color: OBSIDIAN, fontWeight: 500 }}>PLANNER</strong> tab, and this will work out what has to
            change to get under it.
          </p>
        </div>
      </div>
    );
  }

  const changed = result.items.filter(i => i.action !== "keep");
  const savedPct = result.currentTotal > 0 ? (result.saved / result.currentTotal) * 100 : 0;

  return (
    <div className="py-2">
      <Title monthKey={monthKey} />

      {/* ── The verdict ───────────────────────────────────────────────────── */}
      <div className="mb-4 px-4 md:px-6 py-5" style={{
        background: result.solved ? "#F8FBF9" : "#FDF8F8",
        border: `1px solid ${result.solved ? "#C6DCCD" : "#D4B5B5"}`,
        borderLeft: `2px solid ${result.solved ? MUTED_GRN : MUTED_RED}`,
      }}>
        <p className="text-xs mb-2" style={{ color: result.solved ? MUTED_GRN : MUTED_RED, letterSpacing: "0.2em" }}>
          {result.solved ? "THESE CHANGES GET YOU UNDER YOUR INCOME" : "THESE CHANGES ARE NOT ENOUGH ON THEIR OWN"}
        </p>
        <p className="text-sm leading-relaxed" style={{ color: WARM_GRAY }}>
          {result.solved
            ? <>Cutting {fmt(result.saved)} a month brings spending to {fmt(result.targetTotal)} against {fmt(result.income)} of income,
                leaving {fmt(result.gapAfter)} clear.</>
            : <>Every subscription cancelled, every service renegotiated and every envelope trimmed saves {fmt(result.saved)} —
                and still leaves you <strong style={{ color: MUTED_RED, fontWeight: 500 }}>{fmt(Math.abs(result.gapAfter))} short each month</strong>.
                The rest has to come from more income or from the locked column below.</>}
        </p>
      </div>

      {/* ── Where you are, where this gets you ────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-4">
        {[
          { label: "Income",        value: fmt(result.income),        sub: incomeExpected ? "recorded for this month" : incomeIsYours ? "your figure" : `averaged from ${derived.monthsUsed.length} month${derived.monthsUsed.length === 1 ? "" : "s"}`, accent: OBSIDIAN },
          { label: "Spending Now",  value: fmt(result.currentTotal),  sub: "bills + variable",        accent: OBSIDIAN },
          { label: "Set-Aside",     value: fmt(result.annualMonthly + result.debtPaydown), sub: "annual + obligations", accent: "#8A8078" },
          { label: "Gap Now",       value: fmt(result.gapNow),        sub: result.gapNow >= 0 ? "clear" : "short every month", accent: result.gapNow >= 0 ? MUTED_GRN : MUTED_RED },
          { label: "This Plan Saves", value: fmt(result.saved),       sub: `${Math.round(savedPct)}% of spending`, accent: MUTED_GRN },
          { label: "Gap After",     value: fmt(result.gapAfter),      sub: result.gapAfter >= 0 ? "under income" : "still short", accent: result.gapAfter >= 0 ? MUTED_GRN : MUTED_RED },
        ].map(c => (
          <div key={c.label} className="p-5" style={{ background: SURFACE, border: `1px solid ${BORDER}`, borderTop: `2px solid ${c.accent}` }}>
            <p className="text-xs mb-3" style={{ color: WARM_GRAY, letterSpacing: "0.14em" }}>{c.label.toUpperCase()}</p>
            <p className="text-2xl font-light tabular-nums" style={{ color: c.accent }}>{c.value}</p>
            <p className="text-xs mt-2" style={{ color: "#BDBAB6", letterSpacing: "0.06em" }}>{c.sub}</p>
          </div>
        ))}
      </div>

      {/* ── Actions ───────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-3 px-4 md:px-5 py-3 mb-8" style={{ background: SURFACE, border: `1px solid ${BORDER}` }}>
        <span className="text-xs" style={{ color: WARM_GRAY, letterSpacing: "0.12em" }}>
          {changed.length} LINE{changed.length === 1 ? "" : "S"} PROPOSED · {fmt(result.saved)} A MONTH · {fmt(result.saved * 12)} A YEAR
        </span>
        <div className="flex items-center gap-2 ml-auto">
          <button onClick={() => setShowKept(!showKept)} className="px-3 py-1.5 text-xs"
            style={{ background: "transparent", color: WARM_GRAY, border: `1px solid ${BORDER}`, letterSpacing: "0.1em" }}>
            {showKept ? "HIDE UNCHANGED" : "SHOW UNCHANGED"}
          </button>
          {Object.keys(overrides).length > 0 && (
            <button onClick={() => setStore(p => { const n = { ...p, [monthKey]: {} }; try { window.localStorage.setItem(STORE_KEY, JSON.stringify(n)); } catch {} return n; })}
              className="px-3 py-1.5 text-xs"
              style={{ background: "transparent", color: MUTED_RED, border: `1px solid ${BORDER}`, letterSpacing: "0.1em" }}>
              RESET MY EDITS
            </button>
          )}
          <button onClick={applyToPlanner} className="px-4 py-1.5 text-xs"
            style={{ background: OBSIDIAN, color: "#fff", border: `1px solid ${OBSIDIAN}`, letterSpacing: "0.1em" }}>
            SEND TO PLANNER
          </button>
        </div>
      </div>

      {/* ── Tiers ─────────────────────────────────────────────────────────── */}
      {TIER_ORDER.map(tier => {
        const rows = result.items.filter(i => i.tier === tier && (showKept || i.action !== "keep" || tier === "locked" || tier === "business"));
        if (rows.length === 0) return null;
        const meta = TIER_META[tier];
        const now = rows.reduce((s, i) => s + i.current, 0);
        const then = rows.reduce((s, i) => s + i.target, 0);
        const open = openTier === tier;
        return (
          <div key={tier} className="mb-4" style={{ border: `1px solid ${BORDER}`, background: SURFACE }}>
            <button onClick={() => setOpenTier(open ? null : tier)}
              className="w-full px-5 py-4 flex items-center gap-4 text-left hover:opacity-70 transition-opacity"
              style={{ background: IVORY, borderBottom: open ? `1px solid ${BORDER}` : "none" }}>
              <div className="w-0.5 h-5 shrink-0" style={{ background: meta.accent }} />
              <div className="min-w-0">
                <p className="text-xs font-semibold" style={{ color: OBSIDIAN, letterSpacing: "0.18em" }}>{meta.label.toUpperCase()}</p>
                <p className="text-xs mt-0.5" style={{ color: "#9E9E9E" }}>{meta.blurb}</p>
              </div>
              <div className="ml-auto flex items-baseline gap-3 shrink-0">
                <span className="text-sm tabular-nums" style={{ color: WARM_GRAY }}>{fmt(now)}</span>
                {then !== now && (
                  <>
                    <span style={{ color: "#C8C4BF" }}>→</span>
                    <span className="text-base font-light tabular-nums" style={{ color: MUTED_GRN }}>{fmt(then)}</span>
                  </>
                )}
                <span style={{ color: GOLD, fontSize: 10 }}>{open ? "▾" : "▸"}</span>
              </div>
            </button>

            {open && (
              <div>
                <div className="hidden md:grid px-5 py-2" style={{ gridTemplateColumns: "1fr 110px 110px 120px 90px", background: OBSIDIAN }}>
                  {["LINE", "AVERAGE", "NOW", "TARGET", "SAVES"].map((h, i) => (
                    <p key={h} className="text-xs" style={{ color: "rgba(255,255,255,0.5)", letterSpacing: "0.14em", textAlign: i === 0 ? "left" : "right" }}>{h}</p>
                  ))}
                </div>
                {rows.map((i, n) => (
                  <TrimRow key={i.key} item={i} zebra={n % 2 === 1}
                    onSet={v => setTarget(i.key, v)} edited={overrides[i.key] !== undefined} />
                ))}
              </div>
            )}
          </div>
        );
      })}

      <p className="text-xs mt-6" style={{ color: "#BDBAB6", letterSpacing: "0.04em", lineHeight: 1.7 }}>
        Every target is editable — type over any figure and the totals follow. Suggestions are made in order of what costs you
        least to accept: things already marked cancelled, then duplicate charges, then tools that overlap something else you
        pay for, then remaining subscriptions, then services worth renegotiating, and only then spending habits. The engine
        stops as soon as the gap closes, so nothing is proposed for its own sake.
      </p>
    </div>
  );
}

function Title({ monthKey }: { monthKey: string }) {
  return (
    <p className="text-xs mb-6" style={{ color: WARM_GRAY, letterSpacing: "0.2em" }}>
      REDUCTION PLAN — {fmtMonth(monthKey).toUpperCase()}
    </p>
  );
}

function TrimRow({ item, zebra, onSet, edited }: {
  item: TrimItem; zebra: boolean; onSet: (v: number | null) => void; edited: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const saves = item.current - item.target;

  const keepBadge = item.kept
    ? { text: "KEPT", bg: "#F8FBF9", fg: MUTED_GRN, br: "#C6DCCD" }
    : null;

  const badge = item.action === "cut"
    ? { text: "CUT", bg: "#FDF8F8", fg: MUTED_RED, br: "#D4B5B5" }
    : item.action === "reduce"
    ? { text: "REDUCE", bg: "#FDFBF7", fg: AMBER, br: "#E4D8C4" }
    : null;

  function commit() {
    const v = parseFloat(draft);
    setEditing(false);
    if (!isNaN(v) && v >= 0) onSet(Math.round(v * 100) / 100);
  }

  return (
    <div className="flex flex-wrap md:grid items-center gap-y-1 px-4 md:px-5 py-3" style={{
      gridTemplateColumns: "1fr 110px 110px 120px 90px",
      background: zebra ? IVORY : SURFACE, borderBottom: `1px solid ${BORDER}`,
    }}>
      <div className="min-w-0 pr-4 w-full md:w-auto">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs" style={{ color: OBSIDIAN, letterSpacing: "0.04em" }}>{item.label}</span>
          {badge && (
            <span className="text-xs px-2 py-0.5 shrink-0" style={{ background: badge.bg, color: badge.fg, border: `1px solid ${badge.br}`, letterSpacing: "0.06em" }}>
              {badge.text}
            </span>
          )}
          {keepBadge && (
            <span className="text-xs px-2 py-0.5 shrink-0" style={{ background: keepBadge.bg, color: keepBadge.fg, border: `1px solid ${keepBadge.br}`, letterSpacing: "0.06em" }}>
              {keepBadge.text}
            </span>
          )}
          {edited && (
            <span className="text-xs px-2 py-0.5 shrink-0" style={{ background: "#F8FBF9", color: MUTED_GRN, border: "1px solid #C6DCCD", letterSpacing: "0.06em" }}>
              YOUR FIGURE
            </span>
          )}
        </div>
        <p className="text-xs mt-0.5" style={{ color: "#BDBAB6" }}>
          {item.reasons[0] ?? item.category}
        </p>
      </div>

      <span className="text-xs font-mono md:text-right" style={{ color: "#BDBAB6" }}><span className="md:hidden">avg </span>{fmt(item.average)}</span>
      <span className="text-xs font-mono md:text-right ml-3 md:ml-0" style={{ color: WARM_GRAY }}><span className="md:hidden">now </span>{fmt(item.current)}</span>

      <div className="flex md:justify-end ml-3 md:ml-0">
        {editing ? (
          <input autoFocus type="number" step="0.01" min="0" value={draft}
            onChange={e => setDraft(e.target.value)} onBlur={commit}
            onKeyDown={e => { if (e.key === "Enter") commit(); if (e.key === "Escape") setEditing(false); }}
            className="text-xs font-mono text-right bg-transparent focus:outline-none w-20"
            style={{ color: OBSIDIAN, borderBottom: `1px solid ${GOLD}` }} />
        ) : (
          <button onClick={() => { setDraft(String(item.target)); setEditing(true); }}
            className="text-xs font-mono text-right hover:opacity-60"
            style={{ color: item.target === 0 ? MUTED_RED : OBSIDIAN, borderBottom: `1px dashed ${BORDER}` }}>
            {fmt(item.target)}
          </button>
        )}
      </div>

      <span className="text-xs font-mono md:text-right ml-3 md:ml-0" style={{ color: saves > 0 ? MUTED_GRN : "#C8C4BF" }}>
        {saves > 0 ? `−${fmt(saves)}` : "—"}
      </span>
    </div>
  );
}
