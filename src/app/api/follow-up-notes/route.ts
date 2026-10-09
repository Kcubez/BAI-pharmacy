import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { notDeleted } from "@/lib/soft-delete";
import { ownedByUserOrAdmin } from "@/lib/tenant-scope";
import { followUpNoteSchema } from "@/lib/validations";
import { NextRequest, NextResponse } from "next/server";

async function ownedDeal(id: string, session: NonNullable<Awaited<ReturnType<typeof auth.api.getSession>>>) {
  return prisma.deal.findFirst({ where: { id, ...ownedByUserOrAdmin(session), ...notDeleted } });
}

export async function GET(req: NextRequest) {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  const status = req.nextUrl.searchParams.get("status");
  const notes = await prisma.followUpNote.findMany({
    where: {
      deal: { ...ownedByUserOrAdmin(session), ...notDeleted },
      ...(status ? { status: status as "DRAFT" | "ACCEPTED" | "EDITED" | "DISMISSED" } : {}),
    },
    include: { deal: { include: { customer: { select: { id: true, name: true, phone: true } } } }, message: true },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json({ notes });
}

export async function POST(req: NextRequest) {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  const parsed = followUpNoteSchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ message: parsed.error.issues[0]?.message ?? "Invalid follow-up note" }, { status: 400 });
  if (!(await ownedDeal(parsed.data.dealId, session))) return NextResponse.json({ message: "Deal not found" }, { status: 404 });
  const { status, ...data } = parsed.data;
  const note = await prisma.followUpNote.create({
    data: {
      ...data,
      status,
      ...(status === "DRAFT" ? {} : { reviewedByUserId: session.user.id, reviewedAt: new Date() }),
    },
  });
  return NextResponse.json({ note }, { status: 201 });
}

export async function PATCH(req: NextRequest) {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  const body = await req.json();
  if (typeof body.id !== "string") return NextResponse.json({ message: "Follow-up note ID is required" }, { status: 400 });
  const parsed = followUpNoteSchema.partial().safeParse(body);
  if (!parsed.success) return NextResponse.json({ message: parsed.error.issues[0]?.message ?? "Invalid follow-up note" }, { status: 400 });
  const existing = await prisma.followUpNote.findFirst({ where: { id: body.id, deal: { ...ownedByUserOrAdmin(session), ...notDeleted } } });
  if (!existing) return NextResponse.json({ message: "Follow-up note not found" }, { status: 404 });
  if (parsed.data.dealId && !(await ownedDeal(parsed.data.dealId, session))) return NextResponse.json({ message: "Deal not found" }, { status: 404 });
  const written = await prisma.followUpNote.updateMany({
    where: { id: existing.id, deal: { ...ownedByUserOrAdmin(session), ...notDeleted } },
    data: { ...parsed.data, reviewedByUserId: session.user.id, reviewedAt: new Date() },
  });
  if (!written.count) return NextResponse.json({ message: "Follow-up note not found" }, { status: 404 });
  const note = await prisma.followUpNote.findFirst({ where: { id: existing.id } });
  return NextResponse.json({ note });
}
