import { auth } from "@/lib/auth";
import { pharmacySalesAnalysis } from "@/generated/prisma/sql";
import { prisma } from "@/lib/prisma";
import { parsePeriodParams, resolvePeriodRange } from "@/lib/period-range";
import { pharmacyPageSchema } from "@/lib/validations";
import { cached } from "@/lib/upstash";
import { NextRequest, NextResponse } from "next/server";


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
    const rows = await prisma.$queryRawTyped(pharmacySalesAnalysis(session.user.id, start, end, topN));

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
