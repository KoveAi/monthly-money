import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// ─────────────────────────────────────────────────────────────────────────────
// ONE-TIME MIGRATION ENDPOINT — DELETE THIS FILE ONCE IT HAS RUN.
//
// Adds the broughtForward column so an unpaid balance can roll into the next
// month instead of vanishing. Additive, defaults to zero, touches no existing
// row's data. IF NOT EXISTS makes it safe to call twice.
//
// Guarded by a token because /api is unauthenticated and this runs DDL.
// ─────────────────────────────────────────────────────────────────────────────

const TOKEN = "mm-migrate-2026-08-brought-forward";

export async function POST(request: NextRequest) {
  const token = new URL(request.url).searchParams.get("token");
  if (token !== TOKEN) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    await prisma.$executeRawUnsafe(
      `ALTER TABLE "Expense" ADD COLUMN IF NOT EXISTS "broughtForward" DOUBLE PRECISION NOT NULL DEFAULT 0`
    );

    // Read it back so the response proves the column is really there.
    const check = await prisma.$queryRawUnsafe<{ column_name: string; data_type: string; column_default: string | null }[]>(
      `SELECT column_name, data_type, column_default
         FROM information_schema.columns
        WHERE table_name = 'Expense' AND column_name = 'broughtForward'`
    );

    return NextResponse.json({ success: true, column: check[0] ?? null });
  } catch (error) {
    console.error("migrate error:", error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
