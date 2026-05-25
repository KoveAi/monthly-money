export type StatusType =
  | "Paid"
  | "Paid as Agreed"
  | "Past Due"
  | "Overdue"
  | "Due Today"
  | "Upcoming"
  | "Scheduled"
  | "Due"
  | "Cancelled"
  | "Partial"
  | "Forwarded";

export interface ExpenseForStatus {
  status: string | null;
  paymentDate: Date | string | null;
  dueDate: Date | string;
  amountPaid: number;
  amount: number;
}

export function computeStatus(expense: ExpenseForStatus): StatusType {
  // Payment facts take priority over any stored status label
  if (expense.paymentDate) return "Paid";
  if (expense.amount > 0 && expense.amountPaid >= expense.amount) return "Paid";
  // Explicit status (e.g. "Past Due", "Paid as Agreed") comes next
  if (expense.status) return expense.status as StatusType;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(expense.dueDate);
  due.setHours(0, 0, 0, 0);

  if (due < today) return "Overdue";
  if (due.getTime() === today.getTime()) return "Due Today";
  const threeDays = new Date(today);
  threeDays.setDate(today.getDate() + 3);
  if (due <= threeDays) return "Upcoming";
  return "Scheduled";
}

export type StatusColor = { bg: string; text: string; border: string };

export function getStatusStyle(status: StatusType): StatusColor {
  switch (status) {
    case "Paid":           return { bg: "#dcfce7", text: "#15803d", border: "#bbf7d0" };
    case "Paid as Agreed": return { bg: "#fef9c3", text: "#92400e", border: "#fde68a" };
    case "Past Due":       return { bg: "#fee2e2", text: "#b91c1c", border: "#fecaca" };
    case "Overdue":        return { bg: "#fee2e2", text: "#b91c1c", border: "#fecaca" };
    case "Due Today":      return { bg: "#ffedd5", text: "#c2410c", border: "#fed7aa" };
    case "Upcoming":       return { bg: "#e0f2fe", text: "#0369a1", border: "#bae6fd" };
    case "Scheduled":      return { bg: "#dbeafe", text: "#1d4ed8", border: "#bfdbfe" };
    case "Due":            return { bg: "#f1f5f9", text: "#475569", border: "#e2e8f0" };
    case "Cancelled":      return { bg: "#f8fafc", text: "#94a3b8", border: "#e2e8f0" };
    case "Partial":        return { bg: "#ccfbf1", text: "#0f766e", border: "#99f6e4" };
    case "Forwarded":      return { bg: "#ede9fe", text: "#6d28d9", border: "#ddd6fe" };
    default:               return { bg: "#f1f5f9", text: "#64748b", border: "#e2e8f0" };
  }
}

export const ALL_STATUSES: StatusType[] = [
  "Paid", "Paid as Agreed", "Past Due", "Due Today", "Upcoming",
  "Scheduled", "Due", "Partial", "Forwarded", "Cancelled",
];
