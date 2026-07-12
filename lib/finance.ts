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
  if (e.amountPaid > 0) return e.amountPaid;
  if (e.paymentDate) return e.amount;
  const st = computeStatus(e);
  return st === "Paid" ? e.amount : 0;
}

/** Outstanding balance still owed (never negative). */
export function effectiveRemaining(e: Settleable): number {
  return Math.max(0, e.amount - effectivePaid(e));
}

/** Minimum shape needed to route an entry into its ledger section. */
export interface Classifiable {
  description: string;
  category: string;
  frequency: string;
}

export const isApple = (e: Classifiable) =>
  e.description.toLowerCase().includes("apple");

export const isBusinessItem = (e: Classifiable) =>
  e.category === "GR Business" || e.category === "Kove Ai-Business" || isApple(e);

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
  e.category === "Marketing" || (isBusinessItem(e) && looksLikeMarketing(e));

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
    case "business":    return { frequency: keepAnnual ? "annual" : "monthly", category: "GR Business" };
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
