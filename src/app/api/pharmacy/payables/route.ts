import { auth } from "@/lib/auth";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { OPEN_AP_STATUSES } from "@/lib/constants";
import { pharmacyPageSchema } from "@/lib/validations";
import { cached } from "@/lib/upstash";
import { parsePeriodParams, resolvePeriodRange } from "@/lib/period-range";
import { NextRequest, NextResponse } from "next/server";

type SupplierRow = { supplier: string; outstanding: number; overdue: number; dueSoon: number; discountAtRisk: number; invoices: bigint };
type PriorityRow = {
  id: string; supplierName: string | null; invoiceNumber: string; poNumber: string | null;
  invoiceDate: Date | null; dueDate: Date | null; creditTermDays: number | null; amount: number;
  status: string; overdue: boolean; dueSoon: boolean; discountAtRisk: number; priority: number;
};

// GET /api/pharmacy/payables — DB grouped supplier totals + DB paginated queue.
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
  const cacheKey = `payables:${req.nextUrl.searchParams.toString()}`;
  const { data, hit } = await cached("pharmacy", session.user.id, cacheKey, 60, async () => {
    const now = new Date();
    const periodFilter = resolved.period === "overall"
      ? Prisma.empty
      : Prisma.sql` AND invoice_date >= ${start} AND invoice_date < ${end}`;
    const baseFilter = Prisma.sql`
      user_id = ${session.user.id}
      AND deleted_at IS NULL
      AND status IN (${Prisma.join(OPEN_AP_STATUSES)})
      ${periodFilter}`;
    const searchFilter = search
      ? Prisma.sql` AND CONCAT_WS(' ', COALESCE(supplier_name, ''), invoice_number, COALESCE(po_number, '')) ILIKE ${`%${search}%`}`
      : Prisma.empty;
    const amount = Prisma.sql`COALESCE(net_amount, amount, 0)`;
    const overdue = Prisma.sql`(status = 'overdue' OR (due_date IS NOT NULL AND due_date < ${now}))`;
    const dueSoon = Prisma.sql`(NOT ${overdue} AND due_date IS NOT NULL AND due_date - ${now} < INTERVAL '7 days')`;
    const discountAtRisk = Prisma.sql`CASE WHEN ${overdue}
      THEN COALESCE(in_time_disc_amt, CASE WHEN in_time_disc_rate IS NOT NULL THEN ${amount} * in_time_disc_rate ELSE 0 END)
      ELSE 0 END`;
    const daysOverdue = Prisma.sql`CASE WHEN due_date IS NOT NULL AND due_date < ${now}
      THEN FLOOR(EXTRACT(EPOCH FROM (${now} - due_date)) / 86400)::int ELSE 0 END`;

    const supplierKey = `payables-suppliers:${resolved.period}:${start.toISOString()}:${end.toISOString()}`;
    const supplierRequest = cached("pharmacy", session.user.id, supplierKey, 60, () =>
      prisma.$queryRaw<SupplierRow[]>(Prisma.sql`
        SELECT COALESCE(NULLIF(TRIM(supplier_name), ''), 'Unknown') AS supplier,
          COALESCE(SUM(${amount}), 0)::double precision AS outstanding,
          COALESCE(SUM(CASE WHEN ${overdue} THEN ${amount} ELSE 0 END), 0)::double precision AS overdue,
          COALESCE(SUM(CASE WHEN ${dueSoon} THEN ${amount} ELSE 0 END), 0)::double precision AS "dueSoon",
          COALESCE(SUM(${discountAtRisk}), 0)::double precision AS "discountAtRisk",
          COUNT(*)::bigint AS invoices
        FROM purchase_invoice WHERE ${baseFilter}
        GROUP BY COALESCE(NULLIF(TRIM(supplier_name), ''), 'Unknown')
        ORDER BY outstanding DESC`),
    );
    const [supplierResult, priority, priorityCount] = await Promise.all([
      supplierRequest,
      prisma.$queryRaw<PriorityRow[]>(Prisma.sql`
        SELECT id, supplier_name AS "supplierName", invoice_number AS "invoiceNumber", po_number AS "poNumber",
          invoice_date AS "invoiceDate", due_date AS "dueDate", credit_term_days AS "creditTermDays",
          ${amount}::double precision AS amount, status, ${overdue} AS overdue, ${dueSoon} AS "dueSoon",
          ${discountAtRisk}::double precision AS "discountAtRisk",
          (${daysOverdue} * LN(${amount} + 10) + ${discountAtRisk} / 100000)::double precision AS priority
        FROM purchase_invoice WHERE ${baseFilter} ${searchFilter}
        ORDER BY due_date ASC NULLS LAST, COALESCE(net_amount, amount, 0) DESC, id ASC
        OFFSET ${(page - 1) * limit} LIMIT ${limit}`),
      prisma.$queryRaw<Array<{ count: bigint }>>(Prisma.sql`
        SELECT COUNT(*)::bigint AS count FROM purchase_invoice WHERE ${baseFilter} ${searchFilter}`),
    ]);

    const allSuppliers = supplierResult.data;
    const bySupplier = search
      ? allSuppliers.filter((row) => row.supplier.toLowerCase().includes(search.toLowerCase()))
      : allSuppliers;
    return {
      totals: {
        outstanding: bySupplier.reduce((sum, row) => sum + Number(row.outstanding ?? 0), 0),
        overdue: bySupplier.reduce((sum, row) => sum + Number(row.overdue ?? 0), 0),
        discountAtRisk: bySupplier.reduce((sum, row) => sum + Number(row.discountAtRisk ?? 0), 0),
        openCount: bySupplier.reduce((sum, row) => sum + Number(row.invoices), 0),
      },
      bySupplier: bySupplier.map((row) => ({ ...row, invoices: Number(row.invoices) })),
      page, limit, totalPriority: Number(priorityCount[0]?.count ?? 0), priority,
    };
  });
  return NextResponse.json(data, { headers: { "X-Cache": hit ? "HIT" : "MISS" } });
}
