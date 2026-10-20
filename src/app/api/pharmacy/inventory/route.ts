import { RequestTiming } from "@/lib/request-timing";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { pharmacyPageSchema } from "@/lib/validations";
import { cached } from "@/lib/upstash";
import { parsePeriodParams, resolvePeriodRange } from "@/lib/period-range";
import { inventoryOptions, inventoryQueries } from "@/lib/inventory-query";
import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const timing = new RequestTiming();
  const session = await timing.measure("auth", () => auth.api.getSession({ headers: req.headers }));
  if (!session) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  const params = req.nextUrl.searchParams;
  const paging = pharmacyPageSchema.safeParse({ page: params.get("page") ?? undefined, limit: params.get("limit") ?? undefined });
  const options = inventoryOptions.safeParse({ tab: params.get("tab") ?? undefined, sort: params.get("sort") ?? undefined });
  if (!paging.success || !options.success) return NextResponse.json({ message: "Invalid inventory query" }, { status: 400 });
  const resolved = parsePeriodParams(params);
  const { start, end } = resolvePeriodRange(resolved);
  const { page, limit } = paging.data;
  const { tab, sort } = options.data;
  const now = new Date();
  const query = inventoryQueries({ userId: session.user.id, tab, sort, page, limit, search: params.get("q")?.trim() ?? "",
    asOf: new Date(Math.min(now.getTime(), end.getTime() - 1)),
    since: resolved.period === "overall" ? new Date(now.getTime() - 90 * 86400000) : start,
    until: resolved.period === "overall" ? now : end });
  const [summary, result] = await Promise.all([
    cached("pharmacy", session.user.id, `inventory-summary-v3:${resolved.period}:${start.toISOString()}:${end.toISOString()}`, 180,
      async () => timing.measure("db_summary", async () => (await prisma.$queryRawTyped(query.summary))[0])),
    cached("pharmacy", session.user.id, `inventory-page-v3:${params.toString()}`, 180,
      async () => timing.measure("db_page", async () => (await prisma.$queryRaw<Array<{ total: number; rows: unknown[] }>>(query.selected))[0])),
  ]);
  return NextResponse.json({ totals: summary.data, page, limit, total: result.data.total,
    stockout: [], belowMin: [], overstock: [], slowMoving: [], reorder: [], expiring: [],
    [tab]: result.data.rows }, { headers: { "Server-Timing": timing.header(), "X-Cache": result.hit && summary.hit ? "HIT" : "MISS" } });
}
