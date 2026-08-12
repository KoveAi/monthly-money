import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;
    const body = await request.json();

    // Build update object — only include fields that are present
    const updateData: Record<string, unknown> = {};

    if ("description" in body) updateData.description = body.description;
    if ("amount" in body) updateData.amount = parseFloat(body.amount);
    if ("amountPaid" in body) updateData.amountPaid = parseFloat(body.amountPaid);
    if ("broughtForward" in body) updateData.broughtForward = parseFloat(body.broughtForward) || 0;
    if ("category" in body) updateData.category = body.category;
    if ("dueDate" in body) updateData.dueDate = body.dueDate ? new Date(body.dueDate) : undefined;
    if ("isRecurring" in body) updateData.isRecurring = body.isRecurring;
    if ("status" in body) updateData.status = body.status ?? null;
    if ("paymentDate" in body) updateData.paymentDate = body.paymentDate ? new Date(body.paymentDate) : null;
    if ("paymentType" in body) updateData.paymentType = body.paymentType;
    if ("notes" in body) updateData.notes = body.notes;
    if ("remainingName" in body) updateData.remainingName = body.remainingName;
    if ("remainingType" in body) updateData.remainingType = body.remainingType;
    if ("frequency" in body) updateData.frequency = body.frequency;
    if ("sortOrder" in body) updateData.sortOrder = body.sortOrder;

    const expense = await prisma.expense.update({
      where: { id },
      data: updateData,
    });

    return NextResponse.json(expense);
  } catch (error) {
    console.error("PUT /api/expenses/[id] error:", error);
    return NextResponse.json({ error: "Failed to update expense" }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;
    await prisma.expense.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("DELETE /api/expenses/[id] error:", error);
    return NextResponse.json({ error: "Failed to delete expense" }, { status: 500 });
  }
}
