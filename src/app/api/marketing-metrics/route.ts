import { Prisma } from "@/generated/prisma/client";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { notDeleted, softDeleteData } from "@/lib/soft-delete";
import { ownedByUserOrAdmin } from "@/lib/tenant-scope";
import { marketingMetricSchema } from "@/lib/validations";
import { parsePageRequest } from "@/lib/pagination";
import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

  const dateFrom = req.nextUrl.searchParams.get("dateFrom");
  const dateTo = req.nextUrl.searchParams.get("dateTo");
  const { page, limit } = parsePageRequest(req.nextUrl.searchParams);

  const where: Prisma.MarketingMetricWhereInput = { ...ownedByUserOrAdmin(session), ...notDeleted };
  if (dateFrom || dateTo) {
    where.metricDate = {
      ...(dateFrom ? { gte: new Date(`${dateFrom}T00:00:00.000Z`) } : {}),
      ...(dateTo ? { lte: new Date(`${dateTo}T23:59:59.999Z`) } : {}),
    };
  }

  const [metrics, total, channelTotals] = await Promise.all([
    prisma.marketingMetric.findMany({
      where,
      orderBy: [{ metricDate: "desc" }, { id: "desc" }],
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.marketingMetric.count({ where }),
    prisma.marketingMetric.groupBy({
      by: ["channel"],
      where,
      _sum: { spend: true, adDrivenOrders: true, reach: true, impressions: true },
    }),
  ]);

  // The table is paginated, but this small aggregate keeps the channel
  // comparison accurate for the complete selected period.
  const channels = channelTotals.map((row) => ({
    channel: row.channel?.trim() || "Other",
    spend: row._sum.spend ?? 0,
    orders: row._sum.adDrivenOrders ?? 0,
    reach: row._sum.reach ?? row._sum.impressions ?? 0,
  }));

  return NextResponse.json({
    metrics,
    total,
    page,
    totalPages: Math.ceil(total / limit),
    channels,
  });
}

export async function POST(req: NextRequest) {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  const parsed = marketingMetricSchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ message: parsed.error.issues[0]?.message ?? "Invalid marketing metric" }, { status: 400 });
  const metric = await prisma.marketingMetric.create({ data: { userId: session.user.id, ...parsed.data } });
  return NextResponse.json({ metric }, { status: 201 });
}

export async function PATCH(req: NextRequest) {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  const body = await req.json();
  if (typeof body.id !== "string") return NextResponse.json({ message: "Marketing metric ID is required" }, { status: 400 });
  const parsed = marketingMetricSchema.partial().safeParse(body);
  if (!parsed.success) return NextResponse.json({ message: parsed.error.issues[0]?.message ?? "Invalid marketing metric" }, { status: 400 });
  const existing = await prisma.marketingMetric.findFirst({ where: { id: body.id, ...ownedByUserOrAdmin(session), ...notDeleted } });
  if (!existing) return NextResponse.json({ message: "Marketing metric not found" }, { status: 404 });
  const written = await prisma.marketingMetric.updateMany({
    where: { id: existing.id, ...ownedByUserOrAdmin(session), ...notDeleted },
    data: parsed.data,
  });
  if (!written.count) return NextResponse.json({ message: "Marketing metric not found" }, { status: 404 });
  const metric = await prisma.marketingMetric.findFirst({
    where: { id: existing.id, ...ownedByUserOrAdmin(session) },
  });
  return NextResponse.json({ metric });
}

export async function DELETE(req: NextRequest) {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ message: "Marketing metric ID is required" }, { status: 400 });
  const result = await prisma.marketingMetric.updateMany({
    where: { id, ...ownedByUserOrAdmin(session), ...notDeleted },
    data: softDeleteData(session.user.id, req.nextUrl.searchParams.get("reason")),
  });
  if (!result.count) return NextResponse.json({ message: "Marketing metric not found" }, { status: 404 });
  return NextResponse.json({ success: true });
}
