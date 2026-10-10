import type { Prisma } from "@prisma/client";
import { validateExpense } from "@/lib/expense-validation";

export function expenseCreateData(body: Record<string, unknown>): Prisma.ExpenseCreateInput {
  validateExpense(body, true);
  return {
    description: body.description as string, amount: Number(body.amount),
    amountPaid: Number(body.amountPaid ?? 0), broughtForward: Number(body.broughtForward ?? 0),
    category: body.category as string, dueDate: new Date(body.dueDate as string),
    isRecurring: (body.isRecurring ?? false) as boolean, carriesOver: (body.carriesOver ?? null) as boolean | null,
    frequency: (body.frequency ?? "monthly") as string, status: (body.status ?? null) as string | null,
    paymentDate: body.paymentDate ? new Date(body.paymentDate as string) : null,
    paymentType: (body.paymentType ?? null) as string | null, notes: (body.notes ?? null) as string | null,
    remainingName: (body.remainingName ?? null) as string | null, remainingType: (body.remainingType ?? null) as string | null,
    monthKey: body.monthKey as string,
  };
}

export function expenseUpdateData(body: Record<string, unknown>): Prisma.ExpenseUpdateInput {
  validateExpense(body);
  const data: Record<string, unknown> = {};
  for (const key of ["description", "category", "isRecurring", "carriesOver", "status", "paymentType", "notes", "remainingName", "remainingType", "frequency", "sortOrder"]) {
    if (key in body) data[key] = body[key];
  }
  for (const key of ["amount", "amountPaid", "broughtForward"]) if (key in body) data[key] = Number(body[key]);
  if ("dueDate" in body) data.dueDate = new Date(body.dueDate as string);
  if ("paymentDate" in body) data.paymentDate = body.paymentDate ? new Date(body.paymentDate as string) : null;
  return data as Prisma.ExpenseUpdateInput;
}
