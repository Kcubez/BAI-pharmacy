import { requireAdmin } from "@/lib/require-admin";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { updateUserSchema } from "@/lib/validations";

type Params = { params: Promise<{ id: string }> };


// GET /api/admin/users/[id]
export async function GET(req: NextRequest, { params }: Params) {
  const guard = await requireAdmin(req);
  if (guard.error) return guard.error;

  const { id } = await params;

  const user = await prisma.user.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      banned: true,
      banReason: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  if (!user) return NextResponse.json({ message: "User not found" }, { status: 404 });

  return NextResponse.json(user);
}

// PUT /api/admin/users/[id]
export async function PUT(req: NextRequest, { params }: Params) {
  const guard = await requireAdmin(req);
  if (guard.error) return guard.error;

  const { id } = await params;
  const body = await req.json();
  const parsed = updateUserSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { message: "Invalid payload", errors: parsed.error.issues },
      { status: 400 }
    );
  }
  const { name, email, role } = parsed.data;

  try {
    const user = await prisma.user.update({
      where: { id },
      data: {
        name,
        email,
        role,
        updatedAt: new Date(),
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        banned: true,
        banReason: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return NextResponse.json(user);
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return NextResponse.json(
        { message: "An account with that email already exists" },
        { status: 409 }
      );
    }
    throw err;
  }
}

// DELETE /api/admin/users/[id]
export async function DELETE(req: NextRequest, { params }: Params) {
  const guard = await requireAdmin(req);
  if (guard.error) return guard.error;

  const { id } = await params;
  const { session } = guard;

  if (session.user.id === id) {
    return NextResponse.json({ message: "Cannot delete yourself" }, { status: 400 });
  }

  await prisma.user.delete({ where: { id } });

  return NextResponse.json({ success: true });
}
