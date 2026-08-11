"use client";

import { computeStatus, type ExpenseForStatus } from "@/lib/status";

interface StatusBadgeProps {
  expense: ExpenseForStatus;
}

function getElegantStyle(status: string): { color: string; bg: string; border: string } {
  switch (status) {
    case "Paid":           return { color: "#2A6B4A", bg: "#F2F8F5", border: "#B5D4C0" };
    case "Paid as Agreed": return { color: "#7A6230", bg: "#FAF7EE", border: "#D9CFA0" };
    case "Past Due":
    case "Overdue":        return { color: "#8B2020", bg: "#FAF2F2", border: "#D4B5B5" };
    case "Due Today":      return { color: "#8B5E2A", bg: "#FAF6F0", border: "#D4C0A0" };
    case "Upcoming":       return { color: "#2A5080", bg: "#F2F6FA", border: "#B5C8D4" };
    case "Scheduled":      return { color: "#4A4A4A", bg: "#F8F8F8", border: "#D8D8D8" };
    case "Partial":        return { color: "#2A6B5A", bg: "#F2FAF8", border: "#B5D4CC" };
    case "Forwarded":      return { color: "#5A3A7A", bg: "#F6F2FA", border: "#C8B5D4" };
    case "Cancelled":      return { color: "#9A9A9A", bg: "#F8F8F8", border: "#E0E0E0" };
    case "Paused":         return { color: "#6B6460", bg: "#F5F3F0", border: "#DDD6CC" };
    default:               return { color: "#6B6460", bg: "#FAF9F6", border: "#E8E3DC" };
  }
}

export function StatusBadge({ expense }: StatusBadgeProps) {
  const status = computeStatus(expense);
  const { color, bg, border } = getElegantStyle(status);
  return (
    <span
      className="inline-flex items-center px-2 py-0.5 text-xs whitespace-nowrap"
      style={{ color, background: bg, border: `1px solid ${border}`, letterSpacing: "0.06em" }}
    >
      {status === "Cancelled" ? <span className="line-through">{status}</span> : status}
    </span>
  );
}
