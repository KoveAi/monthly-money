import { computeStatus } from "@/lib/status";

// ─────────────────────────────────────────────────────────────────────────────
// Single source of truth for how money is counted and how entries are grouped.
// Both the dashboard and the monthly statement import from here so the numbers
// can never drift apart.
// ─────────────────────────────────────────────────────────────────────────────

/** Minimum shape needed to reason about how much of an obligation is settled. */
export interface Settleable {
  amount: number;
  amountPaid: number;
  /** Unpaid balance carried in from last month. Absent on older records. */
  broughtForward?: number;
  status: string | null;
  paymentDate: Date | string | null;
  dueDate: Date | string;
}

/**
 * Amount actually settled against an obligation.
 * Accounting rule:
 *   • a recorded partial payment counts for exactly what was paid;
 *   • a payment date, or a "Paid" status, settles it in full;
 *   • "Paid as Agreed" means paying the balance down as funds allow — so it counts
 *     ONLY the amount actually paid and leaves the remainder outstanding. It is
 *     never treated as settled in full.
 */
export function effectivePaid(e: Settleable): number {
  if (isPaused(e)) return 0;
  if (e.amountPaid > 0) return e.amountPaid;
  if (e.paymentDate) return e.amount;
  const st = computeStatus(e);
  return st === "Paid" ? e.amount : 0;
}

/**
 * What is actually owed right now: this month's charge plus anything that went
 * unpaid last month and rolled in. This is the figure a payment is measured
 * against — the bare charge understates a bill you are behind on.
 */
export function owedAmount(e: Settleable & { status: string | null }): number {
  return isPaused(e) ? 0 : e.amount + (e.broughtForward ?? 0);
}

/**
 * Left over after this month's payment — the amount that rolls into next month.
 * Negative is a credit: overpay a utility, or have them take a payment twice, and
 * you are genuinely in front on that line. Flooring it at zero hid real money and
 * made the account disagree with the ledger.
 */
export function effectiveRemaining(e: Settleable & { status: string | null }): number {
  return isPaused(e) ? 0 : owedAmount(e) - effectivePaid(e);
}

/**
 * A line that is on hold: kept on the books with its amount intact so it can be
 * restarted, but weighing nothing while it is paused. Distinct from "Cancelled",
 * which is gone for good, and from zeroing the amount, which loses what it costs.
 */
export const isPaused = (e: { status: string | null }) => e.status === "Paused";

/**
 * What a line contributes to a budget. Every total — due, spent, planned, averaged —
 * goes through this rather than reading `amount` directly, so pausing something takes
 * it out of the arithmetic everywhere at once while the row stays on screen.
 */
export const budgetAmount = (e: { status: string | null; amount: number }) =>
  isPaused(e) ? 0 : e.amount;

/**
 * Business lines that behave like ordinary bills: miss one and you still owe it.
 * Everything else in Business, and everything in Marketing, is pay-to-use — a
 * subscription you either pay to keep using or lose access to. Nothing accrues.
 */
// "apple card" also catches the MacBook payment plan, which is the same kind of
// thing: a card balance, not a subscription. Note it does not catch "Apple Bill",
// which is genuine pay-to-use.
export const ACCRUING_BUSINESS = ["the bold building", "microsoft business 365", "hspo", "apple card"];

/**
 * Pay-to-use: the charge buys the month, so an unpaid one is simply a month not
 * bought. It never becomes a debt and never rolls into the next month.
 */
export function isPayAsYouGo(e: Classifiable): boolean {
  const section = sectionOf(e);
  if (section === "marketing") return true;
  if (section !== "business") return false;
  const name = e.description.toLowerCase();
  return !ACCRUING_BUSINESS.some(k => name.includes(k));
}

/** What actually rolls into next month — nothing, for a pay-to-use line. */
export function rollingRemaining(e: Settleable & Classifiable & { status: string | null }): number {
  return isPayAsYouGo(e) ? 0 : effectiveRemaining(e);
}

/**
 * Lines confirmed as needed. The reduction engine matches tools by category and
 * cannot see who uses them — two Claude subscriptions in a two-person household
 * look like duplication and are not — so anything named here is never proposed as
 * a cut, whatever the engine thinks it has spotted. Add to it as things are ruled
 * in; that judgement belongs to the household, not the heuristic.
 */
export const KEEP_LIST: { match: string; why: string }[] = [
  { match: "claude max",     why: "coding — daily driver" },
  { match: "claude ai",      why: "Michelle's projects" },
  { match: "chat gpt",       why: "both of you, separate uses" },
  { match: "chatgpt",        why: "both of you, separate uses" },
  { match: "anthropic",      why: "API credits" },
  { match: "bastion",        why: "Michelle, pay as you go" },
  { match: "google one",     why: "Michelle" },
  { match: "theranest",      why: "practice management — the business runs on it" },
];

export function keptReason(e: Classifiable): string | null {
  const name = e.description.toLowerCase();
  return KEEP_LIST.find(k => name.includes(k.match))?.why ?? null;
}

export const isKept = (e: Classifiable) => keptReason(e) !== null;

/** Minimum shape needed to route an entry into its ledger section. */
export interface Classifiable {
  description: string;
  category: string;
  frequency: string;
}

export const isApple = (e: Classifiable) =>
  e.description.toLowerCase().includes("apple");

// Category assigned by an explicit "move to Business Finances". It pins the entry
// to Business so the marketing name-heuristic below can't reclaim it (e.g. "Repost"
// reads as a marketing tool by name, but a deliberate move must win).
export const BUSINESS_PINNED = "Business Finance";

export const isBusinessItem = (e: Classifiable) =>
  e.category === "GR Business" || e.category === "Kove Ai-Business" ||
  e.category === BUSINESS_PINNED || isApple(e);

/**
 * Marketing is a carve-out of Business Finances: an explicit "Marketing" category,
 * or a business tool whose name reads as a marketing / content / social / advertising
 * platform. (Canva intentionally excluded — no longer in use.)
 */
export const MARKETING_KEYWORDS = [
  "photoroom", "vsco", "capcut", "runway", "unfold", "preview", "repost",
  "upgrow", "ig comment", "instagram", "meta verified", "squarespace", "square space",
  "inshot", "faceapp", "psychology today", "mailchimp", "hootsuite", "buffer",
  "hubspot", "semrush", "ahrefs", "linktree", "picsart", "advertis", "marketing", " ads",
];

export const looksLikeMarketing = (e: Classifiable) => {
  const hay = `${e.description} ${e.category}`.toLowerCase();
  return MARKETING_KEYWORDS.some(k => hay.includes(k));
};

export const isMarketingItem = (e: Classifiable) =>
  e.category === "Marketing" ||
  (e.category !== BUSINESS_PINNED && isBusinessItem(e) && looksLikeMarketing(e));

export type LedgerSection =
  | "income" | "expenses" | "business" | "marketing"
  | "annual" | "liens" | "groceries" | "restaurants" | "incidental" | "fuel";

/**
 * The one place that decides which section an entry belongs to. Precedence matches
 * the dashboard filters: income first, then the category-based carve-outs
 * (marketing, then business), then the remaining frequency-based buckets.
 */
export function sectionOf(e: Classifiable): LedgerSection {
  if (e.frequency === "income") return "income";
  if (isMarketingItem(e)) return "marketing";
  if (isBusinessItem(e)) return "business";
  if (e.frequency === "annual") return "annual";
  if (e.frequency === "lien") return "liens";
  if (
    e.frequency === "groceries" || e.frequency === "restaurants" ||
    e.frequency === "incidental" || e.frequency === "fuel"
  ) return e.frequency;
  return "expenses";
}

export type MoveTarget =
  | "expenses" | "business" | "marketing" | "annual" | "liens"
  | "groceries" | "restaurants" | "incidental" | "fuel" | "income";

/** Human labels for each move destination (shared by every move UI). */
export const MOVE_OPTIONS: { value: MoveTarget; label: string }[] = [
  { value: "expenses",    label: "Monthly Expenses" },
  { value: "business",    label: "Business Finances" },
  { value: "marketing",   label: "Marketing" },
  { value: "annual",      label: "Annual Expenses" },
  { value: "liens",       label: "Outstanding Obligations" },
  { value: "income",      label: "Income" },
  { value: "groceries",   label: "Groceries" },
  { value: "restaurants", label: "Restaurants" },
  { value: "incidental",  label: "Incidental" },
  { value: "fuel",        label: "Fuel" },
];

/**
 * Field patch that relocates an entry into `target`. Business & Marketing are
 * identified by category, so a move OUT of them also rewrites the category —
 * otherwise the section filter pulls the row straight back and the move looks
 * like it did nothing. This is the ONE place move logic lives; every move UI
 * (desktop dropdown, mobile card, edit modal) goes through it.
 */
export function movePatch(e: Classifiable, target: MoveTarget): { frequency: string; category?: string } {
  const categoryBound = isBusinessItem(e) || e.category === "Marketing";
  const keepAnnual = e.frequency === "annual";
  switch (target) {
    case "expenses":    return categoryBound ? { frequency: "monthly", category: "Monthly" } : { frequency: "monthly" };
    case "business":    return { frequency: keepAnnual ? "annual" : "monthly", category: BUSINESS_PINNED };
    case "marketing":   return { frequency: keepAnnual ? "annual" : "monthly", category: "Marketing" };
    case "annual":      return categoryBound ? { frequency: "annual", category: "Annual" } : { frequency: "annual" };
    case "liens":       return categoryBound ? { frequency: "lien", category: "Obligation" } : { frequency: "lien" };
    case "groceries":   return { frequency: "groceries", category: "Groceries" };
    case "restaurants": return { frequency: "restaurants", category: "Dining" };
    case "incidental":  return { frequency: "incidental", category: "Incidental" };
    case "fuel":        return { frequency: "fuel", category: "Fuel" };
    case "income":      return { frequency: "income", category: "Income" };
  }
  return { frequency: e.frequency };
}
