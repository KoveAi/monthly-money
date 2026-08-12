import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const monthKey = searchParams.get("monthKey");
  const category = searchParams.get("category");
  // status filter handled client-side via computed status

  const where: Record<string, unknown> = {};
  if (monthKey) where.monthKey = monthKey;
  if (category) where.category = category;

  try {
    const expenses = await prisma.expense.findMany({
      where,
      orderBy: [{ sortOrder: "asc" }, { dueDate: "asc" }, { description: "asc" }],
    });
    return NextResponse.json(expenses);
  } catch (error) {
    console.error("GET /api/expenses error:", error);
    return NextResponse.json({ error: "Failed to fetch expenses" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      description,
      amount,
      amountPaid = 0,
      broughtForward = 0,
      category,
      dueDate,
      isRecurring = false,
      frequency = "monthly",
      status = null,
      paymentDate = null,
      paymentType = null,
      notes = null,
      remainingName = null,
      remainingType = null,
      monthKey,
    } = body;

    if (!description || amount === undefined || !category || !dueDate || !monthKey) {
      return NextResponse.json(
        { error: "Missing required fields: description, amount, category, dueDate, monthKey" },
        { status: 400 }
      );
    }

    const expense = await prisma.expense.create({
      data: {
        description,
        amount: parseFloat(amount),
        amountPaid: parseFloat(amountPaid),
        broughtForward: parseFloat(broughtForward) || 0,
        category,
        dueDate: new Date(dueDate),
        isRecurring,
        status,
        paymentDate: paymentDate ? new Date(paymentDate) : null,
        paymentType,
        notes,
        remainingName,
        remainingType,
        frequency,
        monthKey,
      },
    });

    return NextResponse.json(expense, { status: 201 });
  } catch (error) {
    console.error("POST /api/expenses error:", error);
    return NextResponse.json({ error: "Failed to create expense" }, { status: 500 });
  }
}