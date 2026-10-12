import { auth } from "@/lib/auth";
import { pharmacyTeamCollected, pharmacyTeamOutstanding, pharmacyTeamAreas } from "@/generated/prisma/sql";
import { prisma } from "@/lib/prisma";
import { OPEN_AR_STATUSES } from "@/lib/constants";
import { cached } from "@/lib/upstash";
import { parsePeriodParams, resolvePeriodRange } from "@/lib/period-range";
import { NextRequest, NextResponse } from "next/server";


// GET /api/pharmacy/team — grouped in Postgres, never materialised as 20k rows.
export async function GET(req: NextRequest) {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

  const resolved = parsePeriodParams(req.nextUrl.searchParams);
  const { start, end } = resolvePeriodRange(resolved);
  const cacheKey = `team:${req.nextUrl.searchParams.toString()}`;
  const { data, hit } = await cached("pharmacy", session.user.id, cacheKey, 60, async () => {
    const now = new Date();
    const [paid, open, areaSales] = await Promise.all([
      prisma.$queryRawTyped(pharmacyTeamCollected(session.user.id, start, end)),
      prisma.$queryRawTyped(pharmacyTeamOutstanding(now, session.user.id, OPEN_AR_STATUSES)),
      prisma.$queryRawTyped(pharmacyTeamAreas(session.user.id, start, end)),
    ]);

    const byPerson = new Map<string, { collected: number; paidCount: number; outstanding: number; overdue: number; openCount: number }>();
    for (const row of paid) byPerson.set(row.salesperson ?? "Unknown", { collected: Number(row.collected), paidCount: Number(row.paidCount), outstanding: 0, overdue: 0, openCount: 0 });
    for (const row of open) {
      const previous = byPerson.get(row.salesperson ?? "Unknown") ?? { collected: 0, paidCount: 0, outstanding: 0, overdue: 0, openCount: 0 };
      byPerson.set(row.salesperson ?? "Unknown", { ...previous, outstanding: Number(row.outstanding), overdue: Number(row.overdue), openCount: Number(row.openCount) });
    }
    const bySalesperson = [...byPerson.entries()]
      .map(([salesperson, value]) => ({
        salesperson,
        ...value,
        collectionRate: value.outstanding + value.collected > 0
          ? Math.round((value.collected / (value.collected + value.outstanding)) * 100)
          : 0,
      }))
      .sort((a, b) => b.collected - a.collected);

    return {
      period: resolved.period,
      bySalesperson,
      byArea: areaSales.map((row) => ({ area: row.area, amount: Number(row.amount), lines: Number(row.lines) })),
    };
  });
  return NextResponse.json(data, { headers: { "X-Cache": hit ? "HIT" : "MISS" } });
}
