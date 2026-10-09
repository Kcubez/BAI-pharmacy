import { auth } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";

/**
 * Shared admin guard for API routes.
 * Returns `{ session }` on success or `{ error: <401|403 response> }` to return directly.
 */
export async function requireAdmin(req: NextRequest) {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session) {
    return { error: NextResponse.json({ message: "Unauthorized" }, { status: 401 }) };
  }
  if (session.user.role !== "admin") {
    return { error: NextResponse.json({ message: "Forbidden" }, { status: 403 }) };
  }
  return { session };
}
