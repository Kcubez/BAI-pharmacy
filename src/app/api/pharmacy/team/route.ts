import { auth } from "@/lib/auth";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { OPEN_AR_STATUSES } from "@/lib/constants";
import { cached } from "@/lib/upstash";
import { parsePeriodParams, resolvePeriodRange } from "@/lib/period-range";
import { NextRequest, NextResponse } from "next/server";

type PaidRow = { salesperson: string; collected: number; paidCount: bigint };
type OpenRow = { salesperson: string; outstanding: number; overdue: number; openCount: bigint };
type AreaRow = { area: string; amount: number; lines: bigint };

// GET /api/pharmacy/team — grouped in Postgres, never materialised as 20k rows.
export async function GET(req: NextRequest) {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

  const resolved = parsePeriodParams(req.nextUrl.searchParams);
  const { start, end } = resolvePeriodRange(resolved);
  const cacheKey = `team:${req.nextUrl.searchParams.toString()}`;
  const { data, hit } = await cached("pharmacy", session.user.id, cacheKey, 60, async () => {
    const now = new Date();
    const person = Prisma.sql`COALESCE(NULLIF(TRIM(salesperson), ''), 'Unknown')`;
    const [paid, open, areaSales] = await Promise.all([
      prisma.$queryRaw<PaidRow[]>(Prisma.sql`
        SELECT ${person} AS salesperson, COALESCE(SUM(net_amount), 0)::double precision AS collected,
          COUNT(*)::bigint AS "paidCount"
        FROM receivable
        WHERE user_id = ${session.user.id} AND deleted_at IS NULL
          AND paid_date >= ${start} AND paid_date < ${end}
        GROUP BY ${person}`),
      prisma.$queryRaw<OpenRow[]>(Prisma.sql`
        SELECT ${person} AS salesperson,
          COALESCE(SUM(COALESCE(net_amount, amount)), 0)::double precision AS outstanding,
          COALESCE(SUM(CASE WHEN payment_status = 'overdue' OR due_date < ${now}
            THEN COALESCE(net_amount, amount) ELSE 0 END), 0)::double precision AS overdue,
          COUNT(*)::bigint AS "openCount"
        FROM receivable
        WHERE user_id = ${session.user.id} AND deleted_at IS NULL
          AND payment_status IN (${Prisma.join(OPEN_AR_STATUSES)})
        GROUP BY ${person}`),
      prisma.$queryRaw<AreaRow[]>(Prisma.sql`
        SELECT COALESCE(NULLIF(TRIM(tsp_area), ''), 'Unknown') AS area,
          COALESCE(SUM(amount), 0)::double precision AS amount, COUNT(*)::bigint AS lines
        FROM sales_line
        WHERE user_id = ${session.user.id} AND deleted_at IS NULL
          AND sale_date >= ${start} AND sale_date < ${end}
        GROUP BY 1 ORDER BY amount DESC LIMIT 20`),
    ]);

    const byPerson = new Map<string, { collected: number; paidCount: number; outstanding: number; overdue: number; openCount: number }>();
    for (const row of paid) byPerson.set(row.salesperson, { collected: Number(row.collected), paidCount: Number(row.paidCount), outstanding: 0, overdue: 0, openCount: 0 });
    for (const row of open) {
      const previous = byPerson.get(row.salesperson) ?? { collected: 0, paidCount: 0, outstanding: 0, overdue: 0, openCount: 0 };
      byPerson.set(row.salesperson, { ...previous, outstanding: Number(row.outstanding), overdue: Number(row.overdue), openCount: Number(row.openCount) });
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
