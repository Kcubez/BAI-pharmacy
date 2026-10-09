import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { name, email, password } = body;

    if (!name || !email || !password) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    // Use Better Auth's internal API to create the user properly
    // (This automatically hashes the password and creates the Account link)
    const newAdminResponse = await auth.api.signUpEmail({
      body: {
        email,
        password,
        name,
      },
      asResponse: true,
    });

    if (!newAdminResponse.ok) {
      throw new Error("Failed to create admin user account.");
    }

    // Atomically elevate ONLY if this is still the only user. The re-count
    // inside the transaction closes the race where two concurrent setup calls
    // could both pass a non-transactional userCount === 0 check.
    const elevated = await prisma.$transaction(async (tx) => {
      const total = await tx.user.count();
      if (total !== 1) {
        await tx.user.delete({ where: { email } });
        return false;
      }
      await tx.user.update({
        where: { email },
        data: { role: "admin" },
      });
      return true;
    });

    if (!elevated) {
      return NextResponse.json(
        { error: "Setup is already locked. Admin already exists." },
        { status: 403 }
      );
    }

    return NextResponse.json({ success: true, message: "Initial Admin created!" });
  } catch (error: unknown) {
    console.error("Setup Admin Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to create initial admin" },
      { status: 500 }
    );
  }
}
