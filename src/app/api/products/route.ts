import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { notDeleted, softDeleteData } from "@/lib/soft-delete";
import { ownedByUserOrAdmin } from "@/lib/tenant-scope";
import { productSchema } from "@/lib/validations";
import type { Prisma } from "@/generated/prisma/client";
import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

  const search = req.nextUrl.searchParams.get("search")?.trim();
  const lowStockOnly = req.nextUrl.searchParams.get("lowStock") === "true";
  const where: Prisma.ProductWhereInput = { ...ownedByUserOrAdmin(session), ...notDeleted };

  if (search) {
    where.OR = [
      { name: { contains: search, mode: "insensitive" } },
      { sku: { contains: search, mode: "insensitive" } },
      { category: { contains: search, mode: "insensitive" } },
    ];
  }
  const allProducts = await prisma.product.findMany({ where, orderBy: { updatedAt: "desc" } });
  const products = lowStockOnly
    ? allProducts.filter((product) => product.stockQty <= product.lowStockThreshold)
    : allProducts;
  return NextResponse.json({ products });
}

export async function POST(req: NextRequest) {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

  const parsed = productSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ message: parsed.error.issues[0]?.message ?? "Invalid product" }, { status: 400 });
  }

  try {
    const product = await prisma.product.create({ data: { userId: session.user.id, ...parsed.data } });
    return NextResponse.json({ product }, { status: 201 });
  } catch (error: unknown) {
    if (error && typeof error === "object" && "code" in error && error.code === "P2002") {
      return NextResponse.json({ message: "That SKU already exists" }, { status: 409 });
    }
    throw error;
  }
}

export async function PATCH(req: NextRequest) {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  if (typeof body.id !== "string") return NextResponse.json({ message: "Product ID is required" }, { status: 400 });
  const parsed = productSchema.partial().safeParse(body);
  if (!parsed.success) return NextResponse.json({ message: parsed.error.issues[0]?.message ?? "Invalid product" }, { status: 400 });

  const product = await prisma.product.findFirst({ where: { id: body.id, ...ownedByUserOrAdmin(session), ...notDeleted } });
  if (!product) return NextResponse.json({ message: "Product not found" }, { status: 404 });

  try {
    const written = await prisma.product.updateMany({
      where: { id: product.id, ...ownedByUserOrAdmin(session), ...notDeleted },
      data: parsed.data,
    });
    if (!written.count) {
      return NextResponse.json({ message: "Product not found" }, { status: 404 });
    }
    const updated = await prisma.product.findFirst({
      where: { id: product.id, ...ownedByUserOrAdmin(session) },
    });
    return NextResponse.json({ product: updated });
  } catch (error: unknown) {
    if (error && typeof error === "object" && "code" in error && error.code === "P2002") {
      return NextResponse.json({ message: "That SKU already exists" }, { status: 409 });
    }
    throw error;
  }
}

export async function DELETE(req: NextRequest) {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ message: "Product ID is required" }, { status: 400 });
  const result = await prisma.product.updateMany({
    where: { id, ...ownedByUserOrAdmin(session), ...notDeleted },
    data: softDeleteData(session.user.id, req.nextUrl.searchParams.get("reason")),
  });
  if (!result.count) return NextResponse.json({ message: "Product not found" }, { status: 404 });
  return NextResponse.json({ success: true });
}
