import { budgetAmount, sectionOf, type Classifiable } from "@/lib/finance";
import { VARIABLE_KEYS, SECTION_META, type SectionKey } from "@/lib/budget";

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

// ─────────────────────────────────────────────────────────────────────────────
// Forecasting. A bill is known the moment it is billed, but spending is a pace:
// ten days of groceries tells you what the month will cost if nothing changes.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Sections the advisor will never propose cutting. Marketing runs the business
 * being built — trimming it to balance a month would cost more than it saves — so
 * it is reported for visibility and then left alone.
 */
export const PROTECTED_SECTIONS: SectionKey[] = ["marketing"];
export const isProtected = (s: SectionKey) => PROTECTED_SECTIONS.includes(s);

/** Lines run to a weekly figure rather than a monthly one. Keyed by lineKey. */
export const WEEKLY_BUDGETS: Record<string, number> = {
  "foodlion:groceries": 160,
};

export interface MonthProgress {
  daysIn: number;
  daysGone: number;
  /** 0–1. Never zero, so a projection on day one does not divide by nothing. */
  elapsed: number;
  weeks: number;
  inProgress: boolean;
}

export function monthProgress(monthKey: string, now: Date): MonthProgress {
  const [y, m] = monthKey.split("-").map(Number);
  const daysIn = new Date(y, m, 0).getDate();
  const current = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const inProgress = monthKey === current;
  const daysGone = inProgress ? Math.min(now.getDate(), daysIn) : daysIn;
  return { daysIn, daysGone, elapsed: Math.max(daysGone / daysIn, 1 / daysIn), weeks: daysIn / 7, inProgress };
}

export type TrackState = "under" | "on-track" | "heading-over" | "over";

export interface EnvelopeForecast {
  key: SectionKey;
  label: string;
  accent: string;
  /** Spent so far this month. */
  spent: number;
  /** Average day so far. */
  perDay: number;
  /** Where the month lands at this pace. */
  projected: number;
  /** What it usually costs — the baseline, or a weekly budget where one is set. */
  budget: number;
  budgetNote: string;
  /** projected − budget when over, else 0. */
  overBy: number;
  state: TrackState;
  protectedFromCuts: boolean;
  /** What a week would have to drop by to land on budget. */
  cutPerWeek: number;
}

/** Average monthly spend per section across the baseline months. */
export function sectionBaselines(entries: AdvisorEntry[], months: string[]): Record<string, number> {
  const perSection: Record<string, Map<string, number>> = {};
  for (const e of entries) {
    if (!months.includes(e.monthKey)) continue;
    const s = sectionOf(e);
    const amount = budgetAmount(e);
    if (amount <= 0) continue;
    if (!perSection[s]) perSection[s] = new Map();
    perSection[s].set(e.monthKey, (perSection[s].get(e.monthKey) ?? 0) + amount);
  }
  const out: Record<string, number> = {};
  for (const s of Object.keys(perSection)) {
    const v = Array.from(perSection[s].values());
    out[s] = Math.round((v.reduce((a, b) => a + b, 0) / v.length) * 100) / 100;
  }
  return out;
}

/** Project each spending envelope to month end at the pace set so far. */
export function forecastEnvelopes(
  monthEntries: AdvisorEntry[],
  baseSections: Record<string, number>,
  progress: MonthProgress,
): EnvelopeForecast[] {
  const r2 = (v: number) => Math.round(v * 100) / 100;

  return VARIABLE_KEYS.map(key => {
    const rows  = monthEntries.filter(e => sectionOf(e) === key);
    const spent = rows.reduce((s, e) => s + budgetAmount(e), 0);

    // A weekly budget set on any line in this envelope defines the envelope's
    // figure: it is a deliberate plan, and beats an average of what happened before.
    const weeklyBudget = Object.keys(WEEKLY_BUDGETS)
      .filter(k => k.endsWith(":" + key))
      .reduce((s, k) => s + WEEKLY_BUDGETS[k], 0);

    const budget = weeklyBudget > 0 ? r2(weeklyBudget * progress.weeks) : (baseSections[key] ?? 0);
    const budgetNote = weeklyBudget > 0
      ? "$" + weeklyBudget.toFixed(0) + "/week"
      : baseSections[key] ? "usual monthly spend" : "no history";

    const projected = r2(spent / progress.elapsed);
    const overBy = r2(Math.max(0, projected - budget));
    const state: TrackState =
      budget <= 0                 ? "on-track"
      : spent > budget            ? "over"
      : projected > budget * 1.05 ? "heading-over"
      : projected < budget * 0.9  ? "under"
      : "on-track";

    return {
      key, label: SECTION_META[key].label, accent: SECTION_META[key].accent,
      spent: r2(spent), perDay: r2(spent / progress.daysGone), projected,
      budget, budgetNote, overBy, state,
      protectedFromCuts: isProtected(key),
      cutPerWeek: r2(overBy / progress.weeks),
    };
  });
}

export interface BillOverrun {
  label: string;
  over: number;
  baseline: number;
  section: SectionKey;
}

/** Bills billed above what the same line ran to in the baseline months. */
export function billOverruns(
  monthEntries: AdvisorEntry[],
  baselines: Map<string, Baseline>,
): BillOverrun[] {
  const out: BillOverrun[] = [];
  for (const e of monthEntries) {
    const section = sectionOf(e);
    if (section === "income" || section === "liens") continue;
    if ((VARIABLE_KEYS as readonly string[]).includes(section)) continue;
    const v = verdictFor(e, baselines);
    if (v.state === "over" && v.baseline !== null) {
      out.push({ label: e.description, over: v.over, baseline: v.baseline, section: section as SectionKey });
    }
  }
  return out.sort((a, b) => b.over - a.over);
}

export interface Insight {
  /** Short instruction — what to actually do. */
  headline: string;
  /** The arithmetic behind it. */
  detail: string;
  /** Dollars a month this would recover. */
  saving: number;
  tone: "cut" | "watch" | "protected" | "good";
}

/**
 * Where to cut, in order of what it recovers. Protected sections are reported so
 * nothing is hidden, but never proposed — the advice has to be actionable, and
 * "stop marketing the business" is not advice, it is a different business.
 */
export function buildInsights(
  envelopes: EnvelopeForecast[],
  overruns: BillOverrun[],
  projectedSpending: number,
  income: number,
  progress: MonthProgress,
): Insight[] {
  const out: Insight[] = [];
  const money = (v: number) => "$" + v.toFixed(2);
  const shortfall = Math.round((projectedSpending - income) * 100) / 100;

  if (shortfall > 0) {
    out.push({
      headline: "Find " + money(shortfall) + " this month",
      detail: "At today's pace the month lands at " + money(projectedSpending) + " against " + money(income)
            + " of income. Everything below adds up to what is available to close it.",
      saving: 0, tone: "watch",
    });
  }

  for (const e of envelopes.filter(x => x.overBy > 0 && !x.protectedFromCuts).sort((a, b) => b.overBy - a.overBy)) {
    out.push({
      headline: e.label + ": pull back " + money(e.cutPerWeek) + " a week",
      detail: money(e.spent) + " in " + progress.daysGone + " days is " + money(e.perDay)
            + " a day — landing at " + money(e.projected) + " against " + money(e.budget)
            + " (" + e.budgetNote + "). That is " + money(e.overBy) + " over.",
      saving: e.overBy, tone: "cut",
    });
  }

  for (const b of overruns.filter(x => !isProtected(x.section))) {
    out.push({
      headline: b.label + " is up " + money(b.over),
      detail: "Billed above the " + money(b.baseline) + " it usually runs to. Worth checking the bill or the plan behind it.",
      saving: b.over, tone: "cut",
    });
  }

  const protectedOver  = envelopes.filter(e => e.protectedFromCuts && e.overBy > 0);
  const protectedBills = overruns.filter(b => isProtected(b.section));
  if (protectedOver.length || protectedBills.length) {
    const total = protectedOver.reduce((s, e) => s + e.overBy, 0) + protectedBills.reduce((s, b) => s + b.over, 0);
    out.push({
      headline: "Marketing is up " + money(total) + " — left alone",
      detail: "Marketing runs the business being built, so it is never proposed as a cut. It is shown here only so the number is not a surprise.",
      saving: 0, tone: "protected",
    });
  }

  const onTrack = envelopes.filter(e => (e.state === "under" || e.state === "on-track") && e.spent > 0);
  if (onTrack.length) {
    out.push({
      headline: onTrack.map(e => e.label).join(", ") + (onTrack.length === 1 ? " is" : " are") + " on track",
      detail: "Running at or below the usual pace — nothing to do here.",
      saving: 0, tone: "good",
    });
  }

  return out;
}
