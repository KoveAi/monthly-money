import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiError, InvalidInput, privateJson, readJsonObject, requireHousehold } from "@/lib/api-security";
import { expenseUpdateData } from "@/lib/expense-data";

type Context = { params: Promise<{ id: string }> };
export const dynamic = "force-dynamic";

function validateId(id: string) {
  if (!/^[a-zA-Z0-9_-]{1,100}$/.test(id)) throw new InvalidInput("Invalid expense ID.");
}

export async function PUT(request: NextRequest, { params }: Context) {
  const denied = await requireHousehold(request);
  if (denied) return denied;
  try {
    const { id } = await params;
    validateId(id);
    const data = expenseUpdateData(await readJsonObject(request));
    return privateJson(await prisma.expense.update({ where: { id }, data }));
  } catch (error) { return apiError(error, "Failed to update expense."); }
}

export async function DELETE(request: NextRequest, { params }: Context) {
  const denied = await requireHousehold(request);
  if (denied) return denied;
  try {
    const { id } = await params;
    validateId(id);
    await prisma.expense.delete({ where: { id } });
    return privateJson({ success: true });
  } catch (error) { return apiError(error, "Failed to delete expense."); }
}
