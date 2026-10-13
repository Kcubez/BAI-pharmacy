import { NextRequest, NextResponse } from "next/server";
import { getSessionCookie } from "better-auth/cookies";
import { checkRateLimit } from "@/lib/upstash";

const PUBLIC_PATHS = ["/login", "/admin/login", "/api/auth", "/api/telegram"];

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Retired setup links should never become post-login destinations.
  if (pathname === "/setup" || pathname.startsWith("/setup/")) {
    return NextResponse.redirect(new URL("/pharmacy", req.url));
  }
  if (pathname === "/api/setup" || pathname.startsWith("/api/setup/")) {
    return NextResponse.json({ message: "Not found" }, { status: 404 });
  }

  // Brute-force guard on credential sign-in (edge-compatible, Upstash-backed).
  if (pathname.startsWith("/api/auth/sign-in")) {
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
    const rl = await checkRateLimit("login", ip);
    if (!rl.ok) {
      return NextResponse.json({ message: "Too many attempts — please wait a minute." }, { status: 429 });
    }
  }

  // Allow public paths through
  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  // Check session cookie (lightweight — no DB call)
  const sessionCookie = getSessionCookie(req);

  if (!sessionCookie) {
    const loginUrl = new URL("/login", req.url);
    loginUrl.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths EXCEPT:
     * - _next/static (static files)
     * - _next/image  (image optimization)
     * - favicon.ico, sitemap.xml, robots.txt
     * - public folder files
     */
    "/((?!_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
