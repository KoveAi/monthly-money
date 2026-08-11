import { budgetAmount, isPaused, sectionOf, type Classifiable, type Settleable } from "@/lib/finance";
import { SECTION_META, VARIABLE_KEYS, type SectionKey } from "@/lib/budget";

// ─────────────────────────────────────────────────────────────────────────────
// The reduction engine: what is actually being spent, what it would take to get
// under the income that is actually arriving, and which lines to move first.
//
// It never invents a saving. Every suggestion points at a real ledger row, says
// why it was picked, and can be overruled — the arithmetic follows whatever you
// decide, not the other way round.
// ─────────────────────────────────────────────────────────────────────────────

export type TrimEntry = Classifiable & Settleable & { id: string; monthKey: string };

/**
 * How much room a line has in it.
 *   locked        — a roof, a loan, a utility. Only renegotiation or moving house changes it.
 *   negotiable    — a real service with real alternatives: phone, internet, lawn, pest.
 *   discretionary — a subscription. Cancelling it costs nothing but the thing itself.
 *   variable      — behaviour, not a contract. Groceries, dining, fuel, incidental.
 */
export type Tier = "locked" | "negotiable" | "discretionary" | "variable";

export const TIER_META: Record<Tier, { label: string; blurb: string; accent: string }> = {
  locked:        { label: "Locked",        blurb: "Obligations you cannot simply cancel",     accent: "#111111" },
  negotiable:    { label: "Negotiable",    blurb: "Services with real alternatives",          accent: "#8B5E2A" },
  discretionary: { label: "Discretionary", blurb: "Subscriptions — cancellable today",        accent: "#8B5E7A" },
  variable:      { label: "Variable",      blurb: "Spending habits, not contracts",           accent: "#4A7C59" },
};

const has = (hay: string, needles: string[]) => needles.some(n => hay.includes(n));

const LOCKED = [
  "mortgage", "insurance", "hoa", "poa", "tax", "water", "sewage", "aqua",
  "duke energy", "enbridge", "electric", "gas bill", "school loan", "student loan",
  "regional finance", "credit", "amex", "american express", "capital one", "forbearance",
  "apple card", "mortgage", "401k",
];
const NEGOTIABLE = [
  "at&t", "phone", "internet", "pest", "landscap", "treeist", "disposal", "trash",
  "hvac", "adt", "security", "maintenance fee", "bank fee", "respicare",
];

/** Tools that do substantially the same job — paying for several is the finding. */
export const OVERLAP_GROUPS: { name: string; match: string[] }[] = [
  { name: "AI assistants",        match: ["claude", "chatgpt", "chat gpt", "copilot", "bastion", "gemini", "ai pro"] },
  { name: "Video & photo editing",match: ["capcut", "inshot", "in shot", "vsco", "unfold", "photoroom", "canva", "picsart", "faceapp"] },
  { name: "Posting & scheduling", match: ["repost", "preview", "buffer", "hootsuite", "upgrow", "later"] },
  { name: "Cloud storage",        match: ["google photos", "icloud", "google one", "dropbox", "google workspace"] },
  { name: "Voice & audio",        match: ["eleven labs", "elevenlabs", "murf", "descript"] },
  { name: "Phone lines",          match: ["at&t phone"] },
  { name: "Bank account fees",    match: ["maintenance fee"] },
];

/** Wording in the ledger that says the thing is already dead but still billing. */
const DORMANT = ["cancelled", "canceled", "account closed", "on hold", "paid off", "expires", "not in use", "no longer"];

export function classify(e: Classifiable): Tier {
  const section = sectionOf(e);
  if ((VARIABLE_KEYS as readonly string[]).includes(section)) return "variable";
  const hay = `${e.description} ${e.category}`.toLowerCase();
  if (has(hay, LOCKED)) return "locked";
  if (has(hay, NEGOTIABLE)) return "negotiable";
  if (section === "business" || section === "marketing") return "discretionary";
  return has(hay, ["netflix", "prime", "storage", "app", "wellness", "salon", "proactive"]) ? "discretionary" : "locked";
}

export function overlapGroupOf(description: string): string | undefined {
  const hay = description.toLowerCase();
  return OVERLAP_GROUPS.find(g => has(hay, g.match))?.name;
}

export type Action = "keep" | "reduce" | "cut";

export interface TrimItem {
  key: string;
  ids: string[];
  label: string;
  category: string;
  section: SectionKey;
  tier: Tier;
  /** Billed in the month being planned. */
  current: number;
  /** Mean across every month this line appears in. */
  average: number;
  /** What the engine proposes, before any override. */
  suggested: number;
  /** What the plan actually uses — an override if one exists, else `suggested`. */
  target: number;
  action: Action;
  /** Plain-English why, shown next to the line. */
  reasons: string[];
  overlapGroup?: string;
  dormant: boolean;
  duplicate: boolean;
}

const round2 = (v: number) => Math.round(v * 100) / 100;
// Parenthesised detail is kept: "Respicare (CVH)" and "Respicare (MRC)" are two
// people's bills, not one bill charged twice. Category is part of the identity for
// the same reason — three BOA fees on three accounts are three real fees.
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "").trim();
const itemKey = (e: Classifiable, section: string) => `${section}:${norm(e.description)}:${norm(e.category)}`;

export interface TrimInput {
  entries: TrimEntry[];
  /** The month whose bills are being reduced. */
  monthKey: string;
  /** Income you can actually count on each month. */
  income: number;
  /** Monthly set-aside for annual bills — a cost even though nothing is billed. */
  annualMonthly: number;
  /** What you intend to put against liens each month. */
  debtPaydown: number;
  /** Per-item target overrides, keyed by TrimItem.key. */
  overrides: Record<string, number>;
}

export interface TrimResult {
  items: TrimItem[];
  /** Everything billed in the month, before any reduction. */
  currentTotal: number;
  /** Same, once every target is applied. */
  targetTotal: number;
  annualMonthly: number;
  debtPaydown: number;
  income: number;
  /** income − (currentTotal + set-aside + paydown). Negative means overspent. */
  gapNow: number;
  /** The same figure once the targets are applied. */
  gapAfter: number;
  saved: number;
  /** True when the targets get you to or under your income. */
  solved: boolean;
}

/**
 * Build the reduction plan. Suggestions are made in order of how little they cost
 * you to accept — dead subscriptions first, then duplicates, then overlapping tools,
 * then discretionary by size, then negotiable services, and only then habits — and
 * the engine stops as soon as the gap is closed. Nothing is suggested for the sake
 * of it, so a month that already balances proposes no cuts at all.
 */
export function buildTrimPlan(input: TrimInput): TrimResult {
  const { entries, monthKey, income, annualMonthly, debtPaydown, overrides } = input;

  // ── Roll the ledger into one row per distinct bill ────────────────────────
  // Variable spend is deliberately excluded here: a grocery run is not a line you
  // can cancel, and treating 30 shop names as 30 cuttable subscriptions would both
  // mislead and wildly overstate the monthly total. It is handled as four envelopes
  // below, on the same basis the planner uses.
  const byKey = new Map<string, TrimItem & { monthsSeen: Map<string, number>; charges: number }>();
  for (const e of entries) {
    const section = sectionOf(e);
    if (section === "income" || section === "liens" || e.frequency === "annual") continue;
    if ((VARIABLE_KEYS as readonly string[]).includes(section)) continue;
    // Paused lines are already out of the budget — there is nothing left to cut.
    if (isPaused(e) || e.amount <= 0) continue;

    const key = itemKey(e, section);
    let it = byKey.get(key);
    if (!it) {
      const hay = `${e.description} ${e.category}`.toLowerCase();
      it = {
        key, ids: [], label: e.description, category: e.category, section,
        tier: classify(e), current: 0, average: 0, suggested: 0, target: 0,
        action: "keep", reasons: [], overlapGroup: overlapGroupOf(e.description),
        dormant: has(hay, DORMANT), duplicate: false,
        monthsSeen: new Map(), charges: 0,
      };
      byKey.set(key, it);
    }
    it.monthsSeen.set(e.monthKey, (it.monthsSeen.get(e.monthKey) ?? 0) + e.amount);
    if (e.monthKey === monthKey) { it.current += e.amount; it.ids.push(e.id); it.charges++; }
  }

  const items: TrimItem[] = [];
  for (const it of Array.from(byKey.values())) {
    const amounts = Array.from(it.monthsSeen.values());
    it.average = round2(amounts.reduce((s, v) => s + v, 0) / amounts.length);
    // The same bill, same category, charged twice inside one month.
    it.duplicate = it.charges > 1;
    const { monthsSeen, charges, ...rest } = it;
    // A bill counts at what it is billed this month — a line that has stopped
    // appearing has stopped costing.
    if (it.current <= 0) continue;
    items.push({ ...rest, current: round2(it.current) });
  }

  // ── Variable spend: four envelopes, averaged per month ────────────────────
  for (const key of VARIABLE_KEYS) {
    const rows = entries.filter(e => sectionOf(e) === key && budgetAmount(e) > 0);
    if (rows.length === 0) continue;
    const perMonth = new Map<string, number>();
    for (const e of rows) perMonth.set(e.monthKey, (perMonth.get(e.monthKey) ?? 0) + e.amount);
    const monthly = Array.from(perMonth.values());
    const avg = round2(monthly.reduce((s, v) => s + v, 0) / monthly.length);
    if (avg <= 0) continue;
    items.push({
      key: `variable:${key}`, ids: [], label: SECTION_META[key].label, category: "Variable",
      section: key, tier: "variable", current: avg, average: avg, suggested: avg, target: avg,
      action: "keep", reasons: [], dormant: false, duplicate: false,
    });
  }

  // ── Score every line for how readily it could go ──────────────────────────
  // Lower rank = suggest first. Nothing here forces a cut; it only sets the order.
  const rank = (i: TrimItem) =>
    i.dormant                    ? 0
    : i.duplicate                ? 1
    : i.overlapGroup && i.tier === "discretionary" ? 2
    : i.tier === "discretionary" ? 3
    : i.tier === "negotiable"    ? 4
    : i.tier === "variable"      ? 5
    : 99;

  // Within an overlap group the priciest is assumed to be the one you actually use.
  const groupPrimary = new Map<string, string>();
  for (const g of OVERLAP_GROUPS) {
    const members = items.filter(i => i.overlapGroup === g.name && i.tier !== "locked");
    if (members.length < 2) continue;
    groupPrimary.set(g.name, members.slice().sort((a, b) => b.current - a.current)[0].key);
  }

  const currentTotal = round2(items.reduce((s, i) => s + i.current, 0));
  let gap = round2(income - (currentTotal + annualMonthly + debtPaydown));

  const ordered = items.slice().sort((a, b) => rank(a) - rank(b) || b.current - a.current);
  for (const i of ordered) {
    // Default to changing nothing, then propose only while still short.
    i.suggested = i.current;
    i.action = "keep";

    if (gap >= 0 || rank(i) === 99) continue;

    if (i.dormant) {
      i.suggested = 0; i.action = "cut";
      i.reasons.push("marked as cancelled, closed or on hold — still billing");
    } else if (i.duplicate) {
      i.suggested = round2(i.current / 2); i.action = "reduce";
      i.reasons.push("charged more than once this month — looks like a duplicate");
    } else if (i.overlapGroup && i.tier === "discretionary" && groupPrimary.get(i.overlapGroup) !== i.key) {
      i.suggested = 0; i.action = "cut";
      i.reasons.push(`overlaps your other ${i.overlapGroup.toLowerCase()}`);
    } else if (i.tier === "discretionary") {
      i.suggested = 0; i.action = "cut";
      i.reasons.push("subscription — cancellable without penalty");
    } else if (i.tier === "negotiable") {
      i.suggested = round2(i.current * 0.85); i.action = "reduce";
      i.reasons.push("worth renegotiating or shopping around — 15% target");
    } else if (i.tier === "variable") {
      i.suggested = round2(i.current * 0.9); i.action = "reduce";
      i.reasons.push("spending habit — 10% is usually reachable");
    }
    gap = round2(gap + (i.current - i.suggested));
  }

  // Overrides win over every suggestion.
  for (const i of items) {
    const o = overrides[i.key];
    i.target = o === undefined ? i.suggested : o;
    if (o !== undefined) {
      i.action = o === 0 ? "cut" : o < i.current ? "reduce" : "keep";
      i.reasons = ["your figure"];
    }
  }

  const targetTotal = round2(items.reduce((s, i) => s + i.target, 0));
  const gapNow   = round2(income - (currentTotal + annualMonthly + debtPaydown));
  const gapAfter = round2(income - (targetTotal  + annualMonthly + debtPaydown));

  return {
    items: items.sort((a, b) => b.current - a.current),
    currentTotal, targetTotal, annualMonthly, debtPaydown, income,
    gapNow, gapAfter, saved: round2(currentTotal - targetTotal), solved: gapAfter >= 0,
  };
}

/** Roll per-item targets up into the planner's per-category figures. */
export function targetsBySection(result: TrimResult): Partial<Record<SectionKey, number>> {
  const out: Partial<Record<SectionKey, number>> = {};
  for (const i of result.items) out[i.section] = round2((out[i.section] ?? 0) + i.target);
  return out;
}

export const sectionLabel = (k: SectionKey) => SECTION_META[k].label;
