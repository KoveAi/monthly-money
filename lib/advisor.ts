import { budgetAmount, effectivePaid, isPayAsYouGo, sectionOf, type Classifiable } from "@/lib/finance";
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

/**
 * How many closed months the baseline averages over. One, deliberately: July is the
 * first month recorded accurately, and averaging it with a month that was not would
 * bury the very thing the baseline is meant to measure. Raise this once several
 * accurate months have accumulated.
 */
export const BASELINE_MONTHS = 1;

/**
 * The months a baseline is drawn from: the most recent closed month before the one
 * being viewed. Viewing August, that is July — finished, and not the month you are
 * still in, so the comparison is against a complete picture rather than a partial one.
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
  /** This envelope's share of whatever the income leaves after bills. */
  affordable: number;
  /** What it is actually measured against: the lower of budget and affordable. */
  target: number;
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
      budget, budgetNote, affordable: budget, target: budget, overBy, state,
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
            + " a day — landing at " + money(e.projected) + " against " + money(e.target)
            + " (" + (e.target < e.budget ? "all the income leaves after bills" : e.budgetNote) + "). That is "
            + money(e.overBy) + " over.",
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

// ─────────────────────────────────────────────────────────────────────────────
// Affordability. What you used to spend is history; what the month can carry is
// arithmetic. Bills are committed, so everything left over is what there actually
// is to spend — and when income moves, every envelope moves with it.
// ─────────────────────────────────────────────────────────────────────────────

export interface Affordability {
  income: number;
  /** Committed this month: every bill, excluding spending envelopes and balances. */
  bills: number;
  /** income − bills. Negative means the bills alone outrun the month. */
  available: number;
  /** What the envelopes would cost at their plan or usual pace. */
  planned: number;
  /** How far the plan exceeds what is available. */
  squeeze: number;
  /** Bills alone already exceed income — no allocation of spending can balance it. */
  unfunded: boolean;
}

export function affordability(bills: number, income: number, envelopes: EnvelopeForecast[]): Affordability {
  const r2 = (v: number) => Math.round(v * 100) / 100;
  const planned = envelopes.reduce((s, e) => s + e.budget, 0);
  const available = r2(income - bills);
  return {
    income: r2(income), bills: r2(bills), available, planned: r2(planned),
    squeeze: r2(Math.max(0, planned - Math.max(available, 0))),
    unfunded: available <= 0,
  };
}

/**
 * Scale each envelope to what the month can actually carry. The plan is kept as the
 * reference, but the target is never more than the income allows: a $160 week of
 * groceries is not a budget if the bills already spent the money.
 */
export function applyAffordability(
  envelopes: EnvelopeForecast[],
  afford: Affordability,
  progress: MonthProgress,
): EnvelopeForecast[] {
  const r2 = (v: number) => Math.round(v * 100) / 100;
  const pot = Math.max(afford.available, 0);
  const planned = afford.planned;

  return envelopes.map(e => {
    const share = planned > 0 ? e.budget / planned : 0;
    const affordable = r2(pot * share);
    // When the bills already exceed income there is nothing to allocate, and scaling
    // every envelope to zero would be advising no food. The plan stands as the target
    // in that case; the commentary carries the harder message, which is that hitting
    // every target still will not balance the month.
    const target = afford.unfunded ? e.budget : Math.min(e.budget, affordable);
    const overBy = r2(Math.max(0, e.projected - target));
    const state: TrackState =
      target <= 0                 ? "over"
      : e.spent > target          ? "over"
      : e.projected > target * 1.05 ? "heading-over"
      : e.projected < target * 0.9  ? "under"
      : "on-track";
    // What a week has to come down by, over the weeks that are actually left.
    const weeksLeft = Math.max((progress.daysIn - progress.daysGone) / 7, 0.5);
    return { ...e, affordable, target, overBy, state, cutPerWeek: r2(overBy / weeksLeft) };
  });
}

export interface Comment {
  heading: string;
  body: string;
  tone: "hard" | "action" | "context" | "good";
}

/**
 * The written assessment. Says where the month actually stands, what is driving it,
 * what to do first, and — importantly — where the cuts run out, because advice that
 * implies a solvable problem when there isn't one is worse than no advice.
 */
export function buildCommentary(
  afford: Affordability,
  envelopes: EnvelopeForecast[],
  overruns: BillOverrun[],
  projected: number,
  progress: MonthProgress,
): Comment[] {
  const out: Comment[] = [];
  const M = (v: number) => "$" + Math.abs(v).toFixed(2);
  const shortfall = Math.round((projected - afford.income) * 100) / 100;
  const cuttable = envelopes.filter(e => !e.protectedFromCuts).reduce((s, e) => s + e.overBy, 0)
                 + overruns.filter(o => !isProtected(o.section)).reduce((s, o) => s + o.over, 0);
  // Where the month lands if every envelope hits its target exactly — the best case
  // that does not involve going without.
  const onTarget = Math.round((afford.bills + envelopes.reduce((s, e) => s + e.target, 0)) * 100) / 100;
  const residual = Math.round((onTarget - afford.income) * 100) / 100;
  const weeksLeft = Math.max((progress.daysIn - progress.daysGone) / 7, 0);

  // 1. Where the month stands, before any spending at all.
  if (afford.available < 0) {
    out.push({
      heading: "The bills alone are more than the income",
      tone: "hard",
      body: `Committed bills come to ${M(afford.bills)} against ${M(afford.income)} of income — ${M(afford.available)} short `
          + `before a single grocery run. Nothing in the spending envelopes can fix that, because there is nothing left to `
          + `allocate: every dollar of food, fuel and incidental this month is unfunded. The gap has to close on the bills `
          + `themselves or on income.`,
    });
  } else {
    out.push({
      heading: `${M(afford.available)} left after the bills`,
      tone: afford.squeeze > 0 ? "action" : "good",
      body: `Bills take ${M(afford.bills)} of ${M(afford.income)}, leaving ${M(afford.available)} for food, fuel and everything else. `
          + (afford.squeeze > 0
              ? `The usual pace of those would cost ${M(afford.planned)}, which is ${M(afford.squeeze)} more than there is — so the `
              + `envelopes below are scaled to what the month can actually carry, not to what they normally run to.`
              : `The usual pace of those comes to ${M(afford.planned)}, which fits.`),
    });
  }

  // 2. Where it is heading, and whether cutting can get there.
  if (shortfall > 0) {
    const enough = residual <= 0;
    out.push({
      heading: enough
        ? `Heading ${M(shortfall)} over — hitting every target closes it`
        : `Heading ${M(shortfall)} over — ${M(residual)} of it cannot be cut away`,
      tone: enough ? "action" : "hard",
      body: `At ${progress.daysGone} days in, the month is tracking to ${M(projected)}. Holding every envelope to target `
          + `saves ${M(Math.max(0, projected - onTarget))} and brings it to ${M(onTarget)}. `
          + (enough
              ? `That finishes inside the income, but only if it starts now — with ${weeksLeft.toFixed(1)} weeks left, each week of `
              + `delay costs about ${M(shortfall / Math.max(weeksLeft, 1))}.`
              : `That is still ${M(residual)} above the ${M(afford.income)} coming in. No amount of care with food and fuel closes `
              + `that part — it sits in the bills or in the income, and pretending otherwise just moves the shortfall to next month.`),
    });
  } else {
    out.push({
      heading: "On course to finish within income",
      tone: "good",
      body: `Tracking to ${M(projected)} against ${M(afford.income)}. Holding the current pace finishes the month with ${M(-shortfall)} to spare.`,
    });
  }

  // 3. The single biggest lever, named.
  const worst = envelopes.filter(e => !e.protectedFromCuts && e.overBy > 0).sort((a, b) => b.overBy - a.overBy)[0];
  if (worst) {
    out.push({
      heading: `${worst.label} is the biggest single lever`,
      tone: "action",
      body: `${M(worst.spent)} in ${progress.daysGone} days — ${M(worst.perDay)} a day — heading to ${M(worst.projected)} against a `
          + `${M(worst.target)} target — ${M(worst.overBy)} over, more than any other line available. It is spending rather than a `
          + `contract, so it can change this week: about ${M(worst.cutPerWeek)} a week for the rest of the month.`,
    });
  }

  // 4. What income would have to be for this to work.
  const needed = Math.round((projected) * 100) / 100;
  if (shortfall > 0) {
    out.push({
      heading: `This month works at ${M(needed)} of income`,
      tone: "context",
      body: `That is ${M(shortfall)} above what is coming in. Income moves month to month, so this figure moves with it — when a `
          + `stronger month lands, the envelopes widen automatically and the pressure comes off without changing anything here.`,
    });
  }

  // 5. What is protected, stated once so it is never mistaken for an oversight.
  const protectedSpend = overruns.filter(o => isProtected(o.section)).reduce((s, o) => s + o.over, 0);
  out.push({
    heading: "Marketing is not on the table",
    tone: "context",
    body: protectedSpend > 0
      ? `It is running ${M(protectedSpend)} above its usual and is still left alone. It is what builds the business that fixes the `
      + `income side, so cutting it to balance a month would be borrowing from the only line that changes the picture.`
      : `It is never proposed as a cut. It builds the business that fixes the income side, so trimming it to balance a month would `
      + `cost more than it saves.`,
  });

  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// Catching up is not overspending. A payment against last month's arrears is
// progress, and scoring it as this month's cost would punish exactly the thing
// that gets you out. The month is judged on its own charges; the debt position
// is tracked beside it, and moving in the right direction is the win.
// ─────────────────────────────────────────────────────────────────────────────

export interface ArrearsPosition {
  /** Balance carried into this month. */
  opening: number;
  /** Of what has been paid, how much went against that balance. */
  paidDown: number;
  /** Opening less what has been cleared. */
  remaining: number;
  /** This month's charges still unpaid on lines that accrue — tomorrow's arrears. */
  newThisMonth: number;
  /** Where the balance lands if nothing else is paid. */
  closing: number;
  /** closing − opening. Negative is the direction you want. */
  change: number;
}

/**
 * Payments are applied to arrears first, because that is what catching up means:
 * money goes to the oldest debt, and only what is left over counts against the
 * current charge. Pay-to-use lines never contribute new arrears.
 */
export function arrearsPosition(monthEntries: (AdvisorEntry & { amountPaid: number; broughtForward?: number; paymentDate: Date | string | null; dueDate: Date | string })[]): ArrearsPosition {
  const r2 = (v: number) => Math.round(v * 100) / 100;
  let opening = 0, paidDown = 0, newThisMonth = 0;

  for (const e of monthEntries) {
    const section = sectionOf(e);
    if (section === "income" || section === "liens") continue;
    if ((VARIABLE_KEYS as readonly string[]).includes(section)) continue;

    const bf = e.broughtForward ?? 0;
    const paid = effectivePaid(e);
    const toArrears = Math.min(paid, bf);
    const toCharge = paid - toArrears;

    opening  += bf;
    paidDown += toArrears;
    if (!isPayAsYouGo(e)) newThisMonth += Math.max(0, budgetAmount(e) - toCharge);
  }

  const remaining = r2(opening - paidDown);
  const closing = r2(remaining + newThisMonth);
  return {
    opening: r2(opening), paidDown: r2(paidDown), remaining,
    newThisMonth: r2(newThisMonth), closing, change: r2(closing - opening),
  };
}

/**
 * The catch-up verdict. Whether the hole is getting deeper is a different question
 * from whether the month balances, and it is the one that says if the rotation is
 * working — so it gets said separately, in those terms.
 */
export function arrearsComment(a: ArrearsPosition, progress: MonthProgress): Comment {
  const M = (v: number) => "$" + Math.abs(v).toFixed(2);

  if (a.opening === 0 && a.newThisMonth === 0) {
    return {
      heading: "Nothing carried, nothing accruing",
      tone: "good",
      body: "Every bill that accrues is square. There is no balance rolling into next month.",
    };
  }

  // Mid-month, most of this month's charges are simply not due yet. Counting them
  // as a growing balance would cry wolf on the 12th of every month, so while the
  // month is running the verdict is about the old debt only, and what is still to
  // pay is reported as what it is: the rest of the month.
  if (progress.inProgress) {
    const daysLeft = progress.daysIn - progress.daysGone;
    if (a.paidDown > 0) {
      return {
        heading: `Caught up ${M(a.paidDown)} so far — ${M(a.remaining)} of old debt left`,
        tone: a.remaining === 0 ? "good" : "action",
        body: `Came in owing ${M(a.opening)} from last month and ${M(a.paidDown)} of it is cleared. Separately, ${M(a.newThisMonth)} `
            + `of this month's own charges are still to pay with ${daysLeft} days left — normal at this point in the month, but `
            + `whatever is still unpaid on the 31st joins the balance and starts September.`,
      };
    }
    return {
      heading: `${M(a.opening)} of old debt, nothing paid against it yet`,
      tone: "action",
      body: `Last month's balance is untouched, and ${M(a.newThisMonth)} of this month's charges are still to pay with ${daysLeft} `
          + `days left. Anything unpaid at month end joins the balance — the rotation only works while that total falls.`,
    };
  }

  if (a.change < 0) {
    return {
      heading: `Catching up — the balance fell ${M(a.change)}`,
      tone: "good",
      body: `Came in owing ${M(a.opening)} and ${M(a.paidDown)} of that was cleared. Even after this month's unpaid charges of `
          + `${M(a.newThisMonth)}, the carried balance closed at ${M(a.closing)}. That is the rotation working: the hole got `
          + `smaller, which is a different and better thing than the month merely balancing.`,
    };
  }

  return {
    heading: a.paidDown > 0
      ? `Paid ${M(a.paidDown)} off, but the balance still grew ${M(a.change)}`
      : `The carried balance grew ${M(a.change)}`,
    tone: "hard",
    body: `Opened at ${M(a.opening)}${a.paidDown > 0 ? `, ${M(a.paidDown)} paid against it` : " with nothing paid against it"}, `
        + `and ${M(a.newThisMonth)} of this month's charges went unpaid — so it closed at ${M(a.closing)}. `
        + `Rotating which bill waits only works while the total falls. It rose, which means next month starts harder `
        + `than this one did.`,
  };
}
