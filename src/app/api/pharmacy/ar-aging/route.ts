import { auth } from "@/lib/auth";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { AR_BUCKETS, OPEN_AR_STATUSES } from "@/lib/constants";
import { pharmacyPageSchema } from "@/lib/validations";
import { cached } from "@/lib/upstash";
import { parsePeriodParams, resolvePeriodRange } from "@/lib/period-range";
import { NextRequest, NextResponse } from "next/server";

type BucketResult = { bucket: string; count: bigint; amount: number | null };
type PriorityRow = {
  id: string; companyName: string | null; customerName: string | null; region: string | null;
  invoiceNo: string; invoiceDate: Date | null; dueDate: Date | null; creditTerms: number | null;
  amount: number; overdueDays: number; paymentStatus: string | null; priority: number;
};

// GET /api/pharmacy/ar-aging — database aggregation + paginated priority queue.
export async function GET(req: NextRequest) {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

  const resolved = parsePeriodParams(req.nextUrl.searchParams);
  const { start, end } = resolvePeriodRange(resolved);
  const paging = pharmacyPageSchema.safeParse({
    page: req.nextUrl.searchParams.get("page") ?? undefined,
    limit: req.nextUrl.searchParams.get("limit") ?? undefined,
  });
  if (!paging.success) return NextResponse.json({ message: paging.error.issues[0]?.message ?? "Invalid paging" }, { status: 400 });

  const { page, limit } = paging.data;
  const search = req.nextUrl.searchParams.get("q")?.trim() ?? "";
  const cacheKey = `ar:${req.nextUrl.searchParams.toString()}`;
  const { data, hit } = await cached("pharmacy", session.user.id, cacheKey, 60, async () => {
    const now = new Date();
    const periodFilter = resolved.period === "overall"
      ? Prisma.empty
      : Prisma.sql` AND invoice_date >= ${start} AND invoice_date < ${end}`;
    const baseFilter = Prisma.sql`
      user_id = ${session.user.id}
      AND deleted_at IS NULL
      AND payment_status IN (${Prisma.join(OPEN_AR_STATUSES)})
      ${periodFilter}`;
    const searchFilter = search
      ? Prisma.sql` AND CONCAT_WS(' ', COALESCE(customer_name, ''), COALESCE(company_name, ''), invoice_no) ILIKE ${`%${search}%`}`
      : Prisma.empty;
    const dayExpression = Prisma.sql`CASE
      WHEN due_date IS NOT NULL AND due_date > ${now} THEN 0
      ELSE GREATEST(COALESCE(overdue_days, 0), COALESCE(FLOOR(EXTRACT(EPOCH FROM (${now} - due_date)) / 86400)::int, 0))
    END`;

    const summaryKey = `ar-summary:${resolved.period}:${start.toISOString()}:${end.toISOString()}`;
    const summaryRequest = cached("pharmacy", session.user.id, summaryKey, 60, () =>
      prisma.$queryRaw<BucketResult[]>(Prisma.sql`
        WITH base AS (
          SELECT COALESCE(net_amount, amount, 0) AS amount,
            CASE WHEN due_date IS NOT NULL AND due_date > ${now} THEN 'current'
              WHEN ${dayExpression} <= 7 THEN '0-7'
              WHEN ${dayExpression} <= 15 THEN '8-15'
              WHEN ${dayExpression} <= 30 THEN '16-30'
              WHEN ${dayExpression} <= 60 THEN '31-60'
              WHEN ${dayExpression} <= 90 THEN '61-90'
              ELSE '90+' END AS bucket
          FROM receivable WHERE ${baseFilter}
        )
        SELECT bucket, COUNT(*)::bigint AS count, COALESCE(SUM(amount), 0)::double precision AS amount
        FROM base GROUP BY bucket`),
    );
    const [summaryResult, priority, priorityCount] = await Promise.all([
      summaryRequest,
      prisma.$queryRaw<PriorityRow[]>(Prisma.sql`
        SELECT id, company_name AS "companyName", customer_name AS "customerName", region,
          invoice_no AS "invoiceNo", invoice_date AS "invoiceDate", due_date AS "dueDate",
          credit_terms AS "creditTerms", COALESCE(net_amount, amount, 0)::double precision AS amount,
          ${dayExpression} AS "overdueDays", payment_status AS "paymentStatus",
          (${dayExpression} * LN(COALESCE(net_amount, amount, 0) + 10))::double precision AS priority
        FROM receivable
        WHERE ${baseFilter} ${searchFilter}
        ORDER BY COALESCE(overdue_days, 0) DESC, due_date ASC NULLS LAST,
          COALESCE(net_amount, amount, 0) DESC, id ASC
        OFFSET ${(page - 1) * limit} LIMIT ${limit}`),
      prisma.$queryRaw<Array<{ count: bigint }>>(Prisma.sql`
        SELECT COUNT(*)::bigint AS count FROM receivable WHERE ${baseFilter} ${searchFilter}`),
    ]);

    const summary = summaryResult.data;
    const amounts = new Map(summary.map((row) => [row.bucket, { count: Number(row.count), amount: Number(row.amount ?? 0) }]));
    const current = amounts.get("current") ?? { count: 0, amount: 0 };
    const buckets = AR_BUCKETS.map((bucket) => ({ bucket, ...(amounts.get(bucket) ?? { count: 0, amount: 0 }) }));
    return {
      buckets,
      current,
      total: { count: summary.reduce((sum, row) => sum + Number(row.count), 0), amount: summary.reduce((sum, row) => sum + Number(row.amount ?? 0), 0) },
      page, limit, totalPriority: Number(priorityCount[0]?.count ?? 0), priority,
    };
  });
  return NextResponse.json(data, { headers: { "X-Cache": hit ? "HIT" : "MISS" } });
}
