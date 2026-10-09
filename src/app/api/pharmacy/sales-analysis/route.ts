import { auth } from "@/lib/auth";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { parsePeriodParams, resolvePeriodRange } from "@/lib/period-range";
import { pharmacyPageSchema } from "@/lib/validations";
import { cached } from "@/lib/upstash";
import { NextRequest, NextResponse } from "next/server";

type AggregateRow = {
  kind: "total" | "company" | "product" | "customer" | "channel" | "trend";
  key: string | null; name: string | null; month: string | null;
  amount: number; qty: number; foc: number; ret: number; lines: bigint;
};

// GET /api/pharmacy/sales-analysis — one materialised filtered data set, then
// compact aggregates. This avoids six competing scans against sales_line.
export async function GET(req: NextRequest) {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

  const resolved = parsePeriodParams(req.nextUrl.searchParams);
  const { start, end } = resolvePeriodRange(resolved);
  const paging = pharmacyPageSchema.safeParse({ limit: req.nextUrl.searchParams.get("limit") ?? undefined });
  if (!paging.success) return NextResponse.json({ message: paging.error.issues[0]?.message ?? "Invalid paging" }, { status: 400 });

  const topN = paging.data.limit;
  const cacheKey = `sales:${req.nextUrl.searchParams.toString()}`;
  const { data, hit } = await cached("pharmacy", session.user.id, cacheKey, 60, async () => {
    const rows = await prisma.$queryRaw<AggregateRow[]>(Prisma.sql`
      WITH base AS MATERIALIZED (
        SELECT principal, item_code, item_name, customer_name, channel, sale_date,
          COALESCE(amount, 0)::double precision AS amount,
          COALESCE(sale_qty, 0)::double precision AS qty,
          COALESCE(foc_qty, 0)::double precision AS foc,
          COALESCE(return_qty, 0)::double precision AS ret
        FROM sales_line
        WHERE user_id = ${session.user.id} AND deleted_at IS NULL
          AND sale_date >= ${start} AND sale_date < ${end}
      ),
      company AS (
        SELECT COALESCE(NULLIF(TRIM(principal), ''), 'Unknown') AS key,
          SUM(amount)::double precision AS amount, SUM(qty)::double precision AS qty, COUNT(*)::bigint AS lines
        FROM base GROUP BY 1 ORDER BY amount DESC LIMIT ${topN}
      ),
      product AS (
        SELECT COALESCE(NULLIF(item_code, ''), NULLIF(item_name, ''), 'Unknown') AS key,
          MAX(item_name) AS name, SUM(amount)::double precision AS amount, SUM(qty)::double precision AS qty,
          SUM(foc)::double precision AS foc, SUM(ret)::double precision AS ret
        FROM base GROUP BY 1 ORDER BY amount DESC LIMIT ${topN}
      ),
      customer AS (
        SELECT COALESCE(NULLIF(TRIM(customer_name), ''), 'Unknown') AS key,
          SUM(amount)::double precision AS amount, COUNT(*)::bigint AS lines
        FROM base GROUP BY 1 ORDER BY amount DESC LIMIT ${topN}
      ),
      channel AS (
        SELECT channel AS key, SUM(amount)::double precision AS amount, COUNT(*)::bigint AS lines
        FROM base GROUP BY 1 ORDER BY amount DESC
      ),
      trend AS (
        SELECT to_char(sale_date, 'YYYY-MM') AS month, SUM(amount)::double precision AS amount
        FROM base GROUP BY 1 ORDER BY 1
      )
      SELECT 'total'::text AS kind, NULL::text AS key, NULL::text AS name, NULL::text AS month,
        COALESCE(SUM(amount), 0)::double precision AS amount, COALESCE(SUM(qty), 0)::double precision AS qty,
        0::double precision AS foc, 0::double precision AS ret, COUNT(*)::bigint AS lines
      FROM base
      UNION ALL SELECT 'company', key, NULL, NULL, amount, qty, 0::double precision, 0::double precision, lines FROM company
      UNION ALL SELECT 'product', key, name, NULL, amount, qty, foc, ret, 0::bigint FROM product
      UNION ALL SELECT 'customer', key, NULL, NULL, amount, 0::double precision, 0::double precision, 0::double precision, lines FROM customer
      UNION ALL SELECT 'channel', key, NULL, NULL, amount, 0::double precision, 0::double precision, 0::double precision, lines FROM channel
      UNION ALL SELECT 'trend', NULL, NULL, month, amount, 0::double precision, 0::double precision, 0::double precision, 0::bigint FROM trend`);

    const total = rows.find((row) => row.kind === "total");
    return {
      period: resolved.period,
      totals: { amount: Number(total?.amount ?? 0), qty: Number(total?.qty ?? 0), lines: Number(total?.lines ?? 0) },
      byCompany: rows.filter((row) => row.kind === "company").map((row) => ({ key: row.key ?? "Unknown", amount: Number(row.amount), qty: Number(row.qty), lines: Number(row.lines) })),
      byProduct: rows.filter((row) => row.kind === "product").map((row) => ({ key: row.key ?? "Unknown", name: row.name ?? row.key ?? "Unknown", amount: Number(row.amount), qty: Number(row.qty), foc: Number(row.foc), ret: Number(row.ret) })),
      byCustomer: rows.filter((row) => row.kind === "customer").map((row) => ({ key: row.key ?? "Unknown", amount: Number(row.amount), lines: Number(row.lines) })),
      byChannel: rows.filter((row) => row.kind === "channel").map((row) => ({ key: row.key ?? "Unknown", amount: Number(row.amount), lines: Number(row.lines) })),
      trend: rows.filter((row) => row.kind === "trend").map((row) => ({ month: row.month ?? "", amount: Number(row.amount) })),
    };
  });
  return NextResponse.json(data, { headers: { "X-Cache": hit ? "HIT" : "MISS" } });
}
