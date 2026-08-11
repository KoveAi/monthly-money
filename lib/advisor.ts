import { budgetAmount, type Classifiable } from "@/lib/finance";

// ─────────────────────────────────────────────────────────────────────────────
// The advisor. One job: for each entry, say whether it is on target or over, by
// how much, measured against what that same line cost in recent closed months.
// No projections, no tiers, no suggestions — just the comparison.
// ─────────────────────────────────────────────────────────────────────────────

export type AdvisorEntry = Classifiable & { amount: number; status: string | null; monthKey: string };

/** A line is the same line if the description and category match. */
export const lineKey = (e: Classifiable) =>
  `${e.description.toLowerCase().replace(/[^a-z0-9]/g, "")}:${e.category.toLowerCase().replace(/[^a-z0-9]/g, "")}`;

/** How many closed months the baseline averages over. */
export const BASELINE_MONTHS = 2;

/**
 * The months a baseline is drawn from: the most recent closed months before the one
 * being viewed. Viewing August, that is June and July — which is what makes the
 * comparison fair, since both are finished and neither is the month you are still in.
 */
export function baselineMonths(entries: AdvisorEntry[], monthKey: string, count = BASELINE_MONTHS): string[] {
  const closed = Array.from(new Set(entries.map(e => e.monthKey)))
    .filter(mk => mk && mk < monthKey)
    .sort();
  return closed.slice(-count);
}

export interface Baseline {
  /** Average billed across the baseline months this line appeared in. */
  amount: number;
  /** How many of those months it appeared in — 1 means a single data point. */
  months: number;
}

/** What each line cost, on average, across `months`. */
export function buildBaseline(entries: AdvisorEntry[], months: string[]): Map<string, Baseline> {
  const perLine = new Map<string, Map<string, number>>();
  for (const e of entries) {
    if (!months.includes(e.monthKey)) continue;
    const amount = budgetAmount(e);
    if (amount <= 0) continue;   // paused or zeroed lines set no expectation
    const key = lineKey(e);
    let byMonth = perLine.get(key);
    if (!byMonth) { byMonth = new Map(); perLine.set(key, byMonth); }
    byMonth.set(e.monthKey, (byMonth.get(e.monthKey) ?? 0) + amount);
  }

  const out = new Map<string, Baseline>();
  for (const [key, byMonth] of Array.from(perLine.entries())) {
    const values = Array.from(byMonth.values());
    out.set(key, {
      amount: Math.round((values.reduce((s, v) => s + v, 0) / values.length) * 100) / 100,
      months: values.length,
    });
  }
  return out;
}

export type VerdictState = "on-target" | "over" | "new" | "paused" | "balance";

export interface Verdict {
  state: VerdictState;
  /** What this line used to cost. Null when there is nothing to compare against. */
  baseline: number | null;
  /** How far above the baseline, in dollars. Zero unless state is "over". */
  over: number;
  months: number;
}

/** Compare one entry against its baseline. */
export function verdictFor(e: AdvisorEntry, baselines: Map<string, Baseline>): Verdict {
  if (e.status === "Paused") return { state: "paused", baseline: null, over: 0, months: 0 };
  // A lien is a balance carried until it clears, not a monthly cost — there is no
  // "on target" for it, and it must never be counted as this month's spending.
  if (e.frequency === "lien") return { state: "balance", baseline: null, over: 0, months: 0 };
  const base = baselines.get(lineKey(e));
  if (!base) return { state: "new", baseline: null, over: 0, months: 0 };
  const over = Math.round((budgetAmount(e) - base.amount) * 100) / 100;
  return over > 0
    ? { state: "over", baseline: base.amount, over, months: base.months }
    : { state: "on-target", baseline: base.amount, over: 0, months: base.months };
}

export interface AdvisorSummary {
  months: string[];
  /** Income actually received so far in the month being viewed. */
  incomeReceived: number;
  /** Income expected across the whole month — what the bills are measured against. */
  incomeExpected: number;
  /** Everything billed in the month being viewed, paused lines excluded. */
  spending: number;
  /** Total of every line's overspend against its baseline. */
  overspend: number;
  /** How many lines are over. */
  overCount: number;
  /** incomeExpected − spending. Negative means the month's bills outrun the month's income. */
  balance: number;
  /** Still to land this month. */
  stillToCome: number;
}

/**
 * The one-line verdict for a whole month: what came in, what is going out, how much
 * of that is lines costing more than they used to.
 */
export function summarise(
  monthEntries: AdvisorEntry[],
  baselines: Map<string, Baseline>,
  months: string[],
  incomeReceived: number,
  incomeExpected: number,
): AdvisorSummary {
  let spending = 0, overspend = 0, overCount = 0;
  for (const e of monthEntries) {
    // Income is the other side of the sum; liens are balances, not a month's cost.
    if (e.frequency === "income" || e.frequency === "lien") continue;
    spending += budgetAmount(e);
    const v = verdictFor(e, baselines);
    if (v.state === "over") { overspend += v.over; overCount++; }
  }
  const r2 = (v: number) => Math.round(v * 100) / 100;
  return {
    months,
    incomeReceived: r2(incomeReceived),
    incomeExpected: r2(incomeExpected),
    spending: r2(spending),
    overspend: r2(overspend),
    overCount,
    // Measured against the month's whole income, so a month in progress is not
    // flagged as overspent merely because only one paycheque has landed yet.
    balance: r2(incomeExpected - spending),
    stillToCome: r2(Math.max(0, incomeExpected - incomeReceived)),
  };
}
