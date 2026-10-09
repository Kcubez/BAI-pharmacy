import { requireAdmin } from "@/lib/require-admin";
import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";

type Params = { params: Promise<{ id: string }> };


// POST /api/admin/users/[id]/ban
export async function POST(req: NextRequest, { params }: Params) {
  const guard = await requireAdmin(req);
  if (guard.error) return guard.error;

  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const reason: string | undefined = body.reason;

  const user = await prisma.user.update({
    where: { id },
    data: { banned: true, banReason: reason ?? "Banned by admin", updatedAt: new Date() },
    select: { id: true, name: true, email: true, role: true, banned: true, banReason: true, createdAt: true, updatedAt: true },
  });

  return NextResponse.json(user);
}
