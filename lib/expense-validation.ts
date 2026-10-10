import { InvalidInput } from "@/lib/api-security";

export const isMonthKey = (value: unknown): value is string =>
  typeof value === "string" && /^20\d{2}-(0[1-9]|1[0-2])$/.test(value);

export function validateExpense(body: Record<string, unknown>, create = false): void {
  if (create) for (const key of ["description", "amount", "category", "dueDate", "monthKey"]) {
    if (!(key in body)) throw new InvalidInput(`Missing required field: ${key}`);
  }
  for (const key of ["description", "category", "frequency"]) {
    if (key in body && (typeof body[key] !== "string" || !(body[key] as string).trim() || (body[key] as string).length > 300)) {
      throw new InvalidInput(`${key} must be a nonempty string of at most 300 characters.`);
    }
  }
  for (const key of ["status", "paymentType", "notes", "remainingName", "remainingType"]) {
    if (key in body && body[key] !== null && (typeof body[key] !== "string" || (body[key] as string).length > 4000)) {
      throw new InvalidInput(`${key} must be text or null.`);
    }
  }
  for (const key of ["amount", "amountPaid", "broughtForward"]) {
    if (!(key in body)) continue;
    const value = body[key];
    if ((typeof value !== "number" && typeof value !== "string") ||
        (typeof value === "string" && !/^\d+(\.\d{1,2})?$/.test(value)) ||
        !Number.isFinite(Number(value)) || Number(value) < 0 || Number(value) > 1e9) {
      throw new InvalidInput(`${key} must be a finite nonnegative amount.`);
    }
  }
  for (const key of ["dueDate", "paymentDate"]) {
    if (!(key in body) || (key === "paymentDate" && (body[key] === null || body[key] === ""))) continue;
    if (typeof body[key] !== "string" || !/^\d{4}-\d{2}-\d{2}(T.*)?$/.test(body[key] as string) ||
        !Number.isFinite(new Date(body[key] as string).getTime())) throw new InvalidInput(`${key} must be a valid date.`);
    const datePart = (body[key] as string).slice(0, 10);
    if (new Date(`${datePart}T00:00:00Z`).toISOString().slice(0, 10) !== datePart) {
      throw new InvalidInput(`${key} must be a real calendar date.`);
    }
  }
  if ("monthKey" in body && !isMonthKey(body.monthKey)) throw new InvalidInput("monthKey must be YYYY-MM.");
  if ("isRecurring" in body && typeof body.isRecurring !== "boolean") throw new InvalidInput("isRecurring must be true or false.");
  if ("carriesOver" in body && body.carriesOver !== null && typeof body.carriesOver !== "boolean") throw new InvalidInput("carriesOver must be true, false, or null.");
  if ("sortOrder" in body && (typeof body.sortOrder !== "number" || !Number.isSafeInteger(body.sortOrder) || Math.abs(body.sortOrder) > 1e6)) throw new InvalidInput("sortOrder must be an integer.");
}
