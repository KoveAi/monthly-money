import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiError, InvalidInput, privateJson, readJsonObject, requireHousehold } from "@/lib/api-security";
import { expenseCreateData } from "@/lib/expense-data";
import { isMonthKey } from "@/lib/expense-validation";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const denied = await requireHousehold(request);
  if (denied) return denied;
  try {
    const monthKey = request.nextUrl.searchParams.get("monthKey");
    const category = request.nextUrl.searchParams.get("category");
    if (monthKey !== null && !isMonthKey(monthKey)) throw new InvalidInput("monthKey must be YYYY-MM.");
    if (category !== null && category.length > 300) throw new InvalidInput("Category is too long.");
    const expenses = await prisma.expense.findMany({
      where: { ...(monthKey ? { monthKey } : {}), ...(category ? { category } : {}) },
      orderBy: [{ sortOrder: "asc" }, { dueDate: "asc" }, { description: "asc" }],
    });
    return privateJson(expenses);
  } catch (error) { return apiError(error, "Failed to fetch expenses."); }
}

export async function POST(request: NextRequest) {
  const denied = await requireHousehold(request);
  if (denied) return denied;
  try {
    const data = expenseCreateData(await readJsonObject(request));
    return privateJson(await prisma.expense.create({ data }), 201);
  } catch (error) { return apiError(error, "Failed to create expense."); }
}
