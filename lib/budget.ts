import { effectivePaid, sectionOf, type Classifiable, type LedgerSection, type Settleable } from "@/lib/finance";

// ─────────────────────────────────────────────────────────────────────────────
// Budget planner math. Everything here is derived from the ledger that already
// exists — the months that have been used and the income that has been recorded.
// No new storage, no new numbers: it reuses sectionOf/effectivePaid so a planned
// figure and a dashboard figure can never disagree.
// ─────────────────────────────────────────────────────────────────────────────

export type SectionKey = Exclude<LedgerSection, "income">;

/** Recurring bills — planned from what has historically been billed. */
export const FIXED_KEYS = ["expenses", "business", "marketing"] as const;
/**
 * Liens, collections and defaulted debt. Deliberately NOT a fixed commitment: the
 * balance is what is owed in total, not what it costs to run a month. Planning it at
 * face value would demand tens of thousands a month and make the whole budget useless.
 * It is planned instead as a paydown — what you intend to put against it this month.
 */
export const DEBT_KEYS = ["liens"] as const;
/** Discretionary spend — planned as an envelope you spend down through the month. */
export const VARIABLE_KEYS = ["groceries", "restaurants", "incidental", "fuel"] as const;
export const SECTION_KEYS: SectionKey[] = [...FIXED_KEYS, "annual", ...DEBT_KEYS, ...VARIABLE_KEYS];

export type SectionKind = "fixed" | "annual" | "debt" | "variable";

export const SECTION_META: Record<SectionKey, { label: string; accent: string; kind: SectionKind }> = {
  expenses:    { label: "Expenses",                accent: "#111111", kind: "fixed" },
  business:    { label: "Business Finances",       accent: "#C4A882", kind: "fixed" },
  marketing:   { label: "Marketing",               accent: "#8B5E7A", kind: "fixed" },
  annual:      { label: "Annual Set-Aside",        accent: "#8A8078", kind: "annual" },
  liens:       { label: "Obligation Paydown",      accent: "#8B2020", kind: "debt" },
  groceries:   { label: "Groceries",               accent: "#4A7C59", kind: "variable" },
  restaurants: { label: "Restaurants",             accent: "#7C4A4A", kind: "variable" },
  incidental:  { label: "Incidental",              accent: "#4A6B7C", kind: "variable" },
  fuel:        { label: "Fuel",                    accent: "#8B6320", kind: "variable" },
};

/**
 * What a section contributes to a plan: a bill is planned at what it is billed, but a
 * paydown or an envelope is planned at what actually leaves the account.
 */
const planBasis = (k: SectionKey): "due" | "paid" => SECTION_META[k].kind === "fixed" ? "due" : "paid";

/** Minimum shape the planner needs from a ledger row. */
export type BudgetEntry = Classifiable & Settleable & { monthKey: string };

const zeroed = () =>
  SECTION_KEYS.reduce((acc, k) => { acc[k] = 0; return acc; }, {} as Record<SectionKey, number>);

const round2 = (v: number) => Math.round(v * 100) / 100;

export interface MonthRollup {
  monthKey: string;
  /** Income entries: what was expected vs what actually landed. */
  incomeExpected: number;
  incomeReceived: number;
  /** Billed (or, for variable sections, spent) per section. */
  due: Record<SectionKey, number>;
  /** Settled per section. Variable sections are spent-when-recorded, so paid === due. */
  paid: Record<SectionKey, number>;
  /** Billed this month across recurring bills and annual bills. Excludes debt balances. */
  billsDue: number;
  billsPaid: number;
  /** Put against liens / collections / defaulted debt this month. */
  debtPaid: number;
  /** Still owed on those balances at month end. */
  debtOutstanding: number;
  variableSpent: number;
  /** Everything that actually left: bills paid + debt paydown + variable spent. */
  outflow: number;
  net: number;
  /** net / incomeReceived, 0 when no income was recorded that month. */
  savingsRate: number;
  entries: number;
}

/**
 * One rollup per month that has any activity, oldest first. Variable sections are
 * counted at `amount` (matching the dashboard's spend totals) because a grocery run
 * is money already gone, not an obligation waiting to be settled.
 */
export function rollupMonths(entries: BudgetEntry[]): MonthRollup[] {
  const byMonth = new Map<string, MonthRollup>();

  for (const e of entries) {
    if (!e.monthKey) continue;
    let m = byMonth.get(e.monthKey);
    if (!m) {
      m = {
        monthKey: e.monthKey,
        incomeExpected: 0, incomeReceived: 0,
        due: zeroed(), paid: zeroed(),
        billsDue: 0, billsPaid: 0, debtPaid: 0, debtOutstanding: 0, variableSpent: 0,
        outflow: 0, net: 0, savingsRate: 0, entries: 0,
      };
      byMonth.set(e.monthKey, m);
    }
    m.entries++;

    const section = sectionOf(e);
    if (section === "income") {
      m.incomeExpected += e.amount;
      m.incomeReceived += effectivePaid(e);
      continue;
    }

    const isVariable = (VARIABLE_KEYS as readonly string[]).includes(section);
    m.due[section]  += e.amount;
    m.paid[section] += isVariable ? e.amount : effectivePaid(e);
  }

  const months = Array.from(byMonth.values()).sort((a, b) => a.monthKey.localeCompare(b.monthKey));
  const billKeys = [...FIXED_KEYS, "annual" as const];
  for (const m of months) {
    m.billsDue         = billKeys.reduce((s, k) => s + m.due[k], 0);
    m.billsPaid        = billKeys.reduce((s, k) => s + m.paid[k], 0);
    m.debtPaid         = DEBT_KEYS.reduce((s, k) => s + m.paid[k], 0);
    m.debtOutstanding  = DEBT_KEYS.reduce((s, k) => s + Math.max(0, m.due[k] - m.paid[k]), 0);
    m.variableSpent    = VARIABLE_KEYS.reduce((s, k) => s + m.paid[k], 0);
    m.outflow          = m.billsPaid + m.debtPaid + m.variableSpent;
    m.net              = m.incomeReceived - m.outflow;
    m.savingsRate      = m.incomeReceived > 0 ? m.net / m.incomeReceived : 0;
  }
  return months;
}

/**
 * How the planned income figure is drawn from the months on record.
 *   average      — mean of every month that recorded income
 *   conservative — the leanest of the three most recent income months
 *   recent       — the most recent income month
 */
export type IncomeBasis = "average" | "conservative" | "recent";

export const INCOME_BASIS_LABEL: Record<IncomeBasis, string> = {
  average:      "AVERAGE",
  conservative: "CONSERVATIVE",
  recent:       "LAST MONTH",
};

export interface AnnualObligation {
  description: string;
  amount: number;
  /** Month the figure was taken from — the most recent one on record. */
  monthKey: string;
}

export interface AnnualSetAside {
  items: AnnualObligation[];
  /** Total annual cost per year. */
  yearly: number;
  /** What to hold back each month to meet it. */
  monthly: number;
}

/**
 * Annual bills are once-a-year costs that land in a single month, so they can't be
 * averaged the way monthly bills can — a 3-month history that happens to contain the
 * HOA dues would suggest holding back a third of them every month.
 *
 * Instead: collect every distinct annual obligation on record (most recent amount
 * wins, so a renewal price replaces last year's), total the year, and divide by 12.
 * Entries after `upTo` are ignored so a plan is never built from the future.
 */
export function annualSetAside(entries: BudgetEntry[], upTo?: string): AnnualSetAside {
  const latest = new Map<string, AnnualObligation>();
  for (const e of entries) {
    if (e.frequency !== "annual") continue;
    if (upTo && e.monthKey > upTo) continue;
    const key = e.description.trim().toLowerCase();
    const seen = latest.get(key);
    if (!seen || e.monthKey >= seen.monthKey) {
      latest.set(key, { description: e.description, amount: e.amount, monthKey: e.monthKey });
    }
  }
  const items = Array.from(latest.values()).sort((a, b) => b.amount - a.amount);
  const yearly = round2(items.reduce((s, i) => s + i.amount, 0));
  return { items, yearly, monthly: round2(yearly / 12) };
}

export interface PlanSuggestion {
  /** Month keys the suggestion was drawn from, oldest first. */
  monthsUsed: string[];
  /** Recorded income per month, oldest first — the basis for planned income. */
  incomeSamples: number[];
  /** True when no month recorded received income and expected income was used instead. */
  incomeFromExpected: boolean;
  plannedIncome: number;
  perCategory: Record<SectionKey, number>;
}

function pickIncome(samples: number[], basis: IncomeBasis): number {
  if (samples.length === 0) return 0;
  if (basis === "recent") return samples[samples.length - 1];
  if (basis === "conservative") return Math.min.apply(null, samples.slice(-3));
  return samples.reduce((s, v) => s + v, 0) / samples.length;
}

/**
 * Suggested monthly allocation averaged across `history` (which should already exclude
 * the month being planned — a half-finished month would drag every average down).
 * Fixed sections use their mean billed amount, variable sections their mean spend;
 * the annual line is passed in because it is a yearly figure, not a monthly average.
 */
export function suggestPlan(history: MonthRollup[], basis: IncomeBasis, annualMonthly: number): PlanSuggestion {
  const perCategory = zeroed();
  perCategory.annual = annualMonthly;
  const n = history.length;

  if (n === 0) {
    return { monthsUsed: [], incomeSamples: [], incomeFromExpected: false, plannedIncome: 0, perCategory };
  }

  for (const k of SECTION_KEYS) {
    if (k === "annual") continue;
    const basisKey = planBasis(k);
    // A month with nothing recorded against an envelope is a gap in the records, not
    // a month where nobody ate. Averaging those zeros in would quietly halve the
    // budget, so variable lines average only over months that actually recorded spend.
    const months = SECTION_META[k].kind === "variable"
      ? history.filter(m => m[basisKey][k] > 0)
      : history;
    perCategory[k] = months.length ? round2(months.reduce((s, m) => s + m[basisKey][k], 0) / months.length) : 0;
  }

  const received = history.filter(m => m.incomeReceived > 0).map(m => m.incomeReceived);
  const incomeFromExpected = received.length === 0;
  const samples = incomeFromExpected
    ? history.filter(m => m.incomeExpected > 0).map(m => m.incomeExpected)
    : received;

  return {
    monthsUsed: history.map(m => m.monthKey),
    incomeSamples: samples,
    incomeFromExpected,
    plannedIncome: round2(pickIncome(samples, basis)),
    perCategory,
  };
}

/**
 * Suggested allocation read off a single month — the starting point when there is no
 * closed-month history to average. Everything that month actually shows becomes the
 * plan; everything it doesn't show comes back as zero, which the planner surfaces as
 * a line still needing a figure rather than pretending the cost is nil.
 */
export function estimatePlan(month: MonthRollup | null, annualMonthly: number): PlanSuggestion {
  const perCategory = zeroed();
  perCategory.annual = annualMonthly;

  if (!month) {
    return { monthsUsed: [], incomeSamples: [], incomeFromExpected: false, plannedIncome: 0, perCategory };
  }

  for (const k of SECTION_KEYS) {
    if (k === "annual") continue;
    perCategory[k] = round2(month[planBasis(k)][k]);
  }

  const incomeFromExpected = month.incomeReceived === 0 && month.incomeExpected > 0;
  const income = month.incomeReceived > 0 ? month.incomeReceived : month.incomeExpected;

  return {
    monthsUsed: [month.monthKey],
    incomeSamples: income > 0 ? [income] : [],
    incomeFromExpected,
    plannedIncome: round2(income),
    perCategory,
  };
}

/** A planned figure per section plus the income it is planned against. */
export interface Plan {
  income: number;
  perCategory: Record<SectionKey, number>;
}

export interface PlanLine {
  key: SectionKey;
  label: string;
  accent: string;
  kind: SectionKind;
  planned: number;
  actual: number;
  /** planned − actual. Negative means the line is over budget. */
  variance: number;
  /** actual / planned as a percentage; 0 when nothing is planned. */
  usedPct: number;
  /** Where the line should sit right now given how far into the month it is. */
  pacePct: number | null;
  /** Actual spend has outrun the month's elapsed share of the envelope. */
  aheadOfPace: boolean;
}

export interface PlanResult {
  lines: PlanLine[];
  plannedIncome: number;
  plannedFixed: number;
  plannedAnnual: number;
  plannedDebt: number;
  plannedVariable: number;
  plannedOutflow: number;
  /** Income left after every envelope is funded — the honest discretionary figure. */
  unallocated: number;
  actualBillsPaid: number;
  actualDebtPaid: number;
  /** Balance still owed on liens / collections / defaulted debt. */
  debtOutstanding: number;
  actualVariableSpent: number;
  actualOutflow: number;
  actualIncome: number;
  /** Income received minus everything spent so far. */
  actualNet: number;
  /** Outflow projected to month end: bills committed plus variable spend run out at today's pace. */
  projectedOutflow: number;
  projectedNet: number;
}

/**
 * Compare a plan against a month's actuals. `elapsed` is the fraction of the month
 * already gone (0–1) and should only be supplied for a month in progress — for a
 * closed month there is nothing left to pace against.
 */
export function evaluatePlan(plan: Plan, month: MonthRollup | null, elapsed: number | null): PlanResult {
  const lines: PlanLine[] = SECTION_KEYS.map(key => {
    const meta = SECTION_META[key];
    const planned = plan.perCategory[key] ?? 0;
    // Bills are measured against what is billed this month; paydowns and envelopes
    // against what actually left the account.
    const actual = month ? month[planBasis(key)][key] : 0;
    const pacePct = meta.kind === "variable" && elapsed !== null ? elapsed * 100 : null;
    const usedPct = planned > 0 ? (actual / planned) * 100 : 0;
    return {
      key, label: meta.label, accent: meta.accent, kind: meta.kind,
      planned, actual,
      variance: round2(planned - actual),
      usedPct,
      pacePct,
      aheadOfPace: pacePct !== null && planned > 0 && usedPct > pacePct + 5,
    };
  });

  const sumPlanned = (kind: PlanLine["kind"]) =>
    round2(lines.filter(l => l.kind === kind).reduce((s, l) => s + l.planned, 0));

  const plannedFixed    = sumPlanned("fixed");
  const plannedAnnual   = sumPlanned("annual");
  const plannedDebt     = sumPlanned("debt");
  const plannedVariable = sumPlanned("variable");
  const plannedOutflow  = round2(plannedFixed + plannedAnnual + plannedDebt + plannedVariable);

  const actualBillsPaid      = month ? month.billsPaid : 0;
  const actualDebtPaid       = month ? month.debtPaid : 0;
  const actualVariableSpent  = month ? month.variableSpent : 0;
  const actualIncome         = month ? month.incomeReceived : 0;
  const actualOutflow        = round2(actualBillsPaid + actualDebtPaid + actualVariableSpent);

  // Bills are all-or-nothing commitments, so project the full billed amount. Debt
  // paydown only counts what has actually been put against it — the balance itself is
  // not a month's obligation. Variable spend runs forward at the pace set so far.
  const committedBills = month ? month.billsDue : 0;
  const projectedVariable = elapsed !== null && elapsed > 0
    ? Math.max(actualVariableSpent / elapsed, actualVariableSpent)
    : actualVariableSpent;
  const projectedOutflow = round2(Math.max(committedBills, actualBillsPaid) + actualDebtPaid + projectedVariable);

  return {
    lines,
    plannedIncome: plan.income,
    plannedFixed, plannedAnnual, plannedDebt, plannedVariable, plannedOutflow,
    unallocated: round2(plan.income - plannedOutflow),
    actualBillsPaid, actualDebtPaid,
    debtOutstanding: month ? month.debtOutstanding : 0,
    actualVariableSpent,
    actualOutflow,
    actualIncome,
    actualNet: round2(actualIncome - actualOutflow),
    projectedOutflow,
    projectedNet: round2((plan.income > actualIncome ? plan.income : actualIncome) - projectedOutflow),
  };
}

/** Fraction of `monthKey` already elapsed, or null if the month is not in progress. */
export function monthElapsed(monthKey: string, now: Date): number | null {
  const [y, m] = monthKey.split("-").map(Number);
  if (!y || !m) return null;
  const current = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  if (monthKey !== current) return null;
  const daysInMonth = new Date(y, m, 0).getDate();
  return Math.min(now.getDate() / daysInMonth, 1);
}
