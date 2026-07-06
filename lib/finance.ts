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
