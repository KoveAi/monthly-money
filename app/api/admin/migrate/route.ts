import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// ─────────────────────────────────────────────────────────────────────────────
// ONE-TIME MIGRATION ENDPOINT — DELETE THIS FILE ONCE IT HAS RUN.
//
// Adds the carriesOver column, so whether a line's unpaid balance rolls into
// next month is a decision recorded per bill rather than inferred from whether
// it happens to be marked recurring.
//
// Deliberately NULLABLE with no default: null means "decide automatically"
// (recurring bills carry, one-offs and pay-to-use subscriptions do not), so
// every existing row keeps behaving exactly as it does today until someone
// ticks the box. Additive, rewrites no existing row, and IF NOT EXISTS makes a
// second call harmless.
//
// Guarded by a token because /api is unauthenticated and this runs DDL.
// ─────────────────────────────────────────────────────────────────────────────

const TOKEN = "mm-migrate-2026-09-carries-over";

export async function POST(request: NextRequest) {
  const token = new URL(request.url).searchParams.get("token");
  if (token !== TOKEN) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    await prisma.$executeRawUnsafe(
      `ALTER TABLE "Expense" ADD COLUMN IF NOT EXISTS "carriesOver" BOOLEAN`
    );

    // Read it back so the response proves the column is really there.
    const check = await prisma.$queryRawUnsafe<
      { column_name: string; data_type: string; is_nullable: string; column_default: string | null }[]
    >(
      `SELECT column_name, data_type, is_nullable, column_default
         FROM information_schema.columns
        WHERE table_name = 'Expense' AND column_name = 'carriesOver'`
    );

    return NextResponse.json({ success: true, column: check[0] ?? null });
  } catch (error) {
    console.error("migrate error:", error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
