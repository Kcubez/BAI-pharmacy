import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { notDeleted } from "@/lib/soft-delete";
import { ownedByUserOrAdmin } from "@/lib/tenant-scope";
import { GoogleGenAI } from "@google/genai";
import { NextRequest, NextResponse } from "next/server";
import { cached } from "@/lib/upstash";
import { withDeadline } from "@/lib/with-deadline";
import { z } from "zod";
import { parsePeriodParams, resolvePeriodRange } from "@/lib/period-range";
import { growthPercent } from "@/lib/pharmacy-calculations";
import { pharmacyStockoutCount, pharmacyOverdueSupplier } from "@/generated/prisma/sql";
import { OPEN_AR_STATUSES, OPEN_AP_STATUSES } from "@/lib/constants";

const recommendationSchema = z.array(z.object({
  title: z.string(), detail: z.string(),
  link: z.enum(["/pharmacy", "/pharmacy/sales", "/pharmacy/ar", "/pharmacy/inventory", "/pharmacy/payables", "/pharmacy/import"]),
  priority: z.enum(["high", "medium", "low"]),
})).min(1).max(5);

export interface PharmaRecommendation {
  title: string;
  detail: string;
  link: string;
  priority: "high" | "medium" | "low";
}

// GET /api/pharmacy/recommendations — filter-aware MoM sales analysis.
// Accepts ?year&month (defaults to current month). AR/AP/stockout signals
// are point-in-time balances — intentionally global, not month-scoped.
export async function GET(req: NextRequest) {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

  const userWhere = ownedByUserOrAdmin(session);
  const now = new Date();
  const params = new URLSearchParams(req.nextUrl.searchParams);
  params.set("period", "month");
  const { start: cur, end: until } = resolvePeriodRange(parsePeriodParams(params));
  const prev = new Date(Date.UTC(cur.getUTCFullYear(), cur.getUTCMonth()-1, 1));
  const curLabel = `${cur.getUTCFullYear()}-${String(cur.getUTCMonth()+1).padStart(2,"0")}`;
  const { data, hit } = await cached("pharmacy", session.user.id, `recommendations-v3:${curLabel}`, 300, async () => {

  const [salesCur, salesPrev, arTop, apTop, stockoutRows, expiring90Count] = await Promise.all([
    prisma.salesLine.aggregate({
      where: { ...userWhere, ...notDeleted, saleDate: { gte: cur, lt: until } },
      _sum: { amount: true },
      _count: true,
    }),
    prisma.salesLine.aggregate({
      where: { ...userWhere, ...notDeleted, saleDate: { gte: prev, lt: cur } },
      _sum: { amount: true },
    }),
    prisma.receivable.findMany({
      where: { ...userWhere, ...notDeleted, paymentStatus: { in: OPEN_AR_STATUSES }, OR: [{ paymentStatus: "overdue" }, { dueDate: { lt: now } }] },
      select: { customerName: true, netAmount: true, amount: true, overdueDays: true },
      orderBy: { overdueDays: "desc" },
      take: 3,
    }),
    prisma.$queryRawTyped(pharmacyOverdueSupplier(session.user.id, now, OPEN_AP_STATUSES)),
    prisma.$queryRawTyped(pharmacyStockoutCount(session.user.id, now.getUTCFullYear(), now.getUTCMonth()+1)),
    prisma.expiryLot.count({
      where: { ...userWhere, ...notDeleted, expDate: { gte: now, lt: new Date(now.getTime() + 90 * 86400000) } },
    }),
  ]);

  const salesTotal = salesCur._sum.amount ?? 0;
  const prevTotal = salesPrev._sum.amount ?? 0;
  const momPct = growthPercent(salesTotal, prevTotal);
  const stockoutCount = Number(stockoutRows[0]?.n ?? 0);

  const worstSupplier = apTop[0] ? [apTop[0].supplier ?? "Unknown", apTop[0].amount ?? 0] as const : undefined;

  const heuristic: PharmaRecommendation[] = [];
  if (salesCur._count === 0) {
    // Empty month (e.g. future month with no imports yet) — not a sales drop.
    heuristic.push({
      title: `${curLabel} sales records မရှိသေးပါ`,
      detail: "ဒီလအတွက် sales data မသွင်းရသေးလို့ analysis တွက်မရပါ။ Import page ကနေ data သွင်းပါ။",
      link: "/pharmacy/import",
      priority: "low",
    });
  } else if (momPct != null && momPct < -10) {
    heuristic.push({
      title: `Sales ကျဆင်းနေတယ် (${momPct}%)`,
      detail: `ဒီလ ${Math.round(salesTotal).toLocaleString()} vs ပြီးခဲ့တလ ${Math.round(prevTotal).toLocaleString()}။ ဘယ် company/product ကျလဲ Sales Analysis မှာစစ်ပါ။`,
      link: "/pharmacy/sales",
      priority: "high",
    });
  }
  if (arTop.length > 0) {
    const t = arTop[0];
    heuristic.push({
      title: `AR follow-up: ${t.customerName} (${t.overdueDays ?? "?"} ရက် overdue)`,
      detail: `${Math.round(t.netAmount ?? t.amount ?? 0).toLocaleString()} — priority စာရင်းအတိုင်း ဖုန်းဆက်လိုက်ပါ။`,
      link: "/pharmacy/ar",
      priority: "high",
    });
  }
  if (worstSupplier) {
    heuristic.push({
      title: `Supplier payment: ${worstSupplier[0]}`,
      detail: `Overdue ${Math.round(worstSupplier[1]).toLocaleString()} — in-time discount ဆုံးရှုံးနိုင်ခြေ စစ်ပါ။`,
      link: "/pharmacy/payables",
      priority: "medium",
    });
  }
  if (stockoutCount > 0) {
    heuristic.push({
      title: `Stock-out SKUs: ${stockoutCount}`,
      detail: "Reorder စာရင်းမှာ suggested qty နဲ့အတူ order တင်သင့်တဲ့ဆေးတွေ ကြည့်ပါ။",
      link: "/pharmacy/inventory",
      priority: "high",
    });
  }
  if (expiring90Count > 0) {
    heuristic.push({
      title: `Near-expiry lots (90d): ${expiring90Count}`,
      detail: "Inventory → Near-expiry tab မှာ lots ကြည့်ပြီး push-sale / return စဉ်းစားပါ။",
      link: "/pharmacy/inventory",
      priority: "medium",
    });
  }
  if (heuristic.length === 0) {
    heuristic.push({
      title: "အခြေအနေကောင်းမွန်နေပါတယ်",
      detail: "ထူးခြားတဲ့ alert မရှိပါ။ Data အသစ်သွင်းပြီး ပြန်စစ်ပါ။",
      link: "/pharmacy",
      priority: "low",
    });
  }

  // Try Gemini for richer Myanmar analysis; fall back to heuristics.
  try {
    const settings = await prisma.botSettings.findFirst({
      where: { userId: session.user.id, isActive: true },
      select: { geminiApiKey: true, geminiModel: true },
    });
    if (settings?.geminiApiKey) {
      const genAI = new GoogleGenAI({ apiKey: settings.geminiApiKey });
      const prompt = `You are a pharmaceutical distribution business analyst. Reply ONLY with JSON array: [{"title": string (Myanmar), "detail": string (Myanmar, 1-2 sentences: what happened, why, what next), "link": one of /pharmacy /pharmacy/sales /pharmacy/ar /pharmacy/inventory /pharmacy/payables, "priority": "high"|"medium"|"low"}]. Max 5 items.
Facts (MMK): this-month sales ${Math.round(salesTotal)}, last-month sales ${Math.round(prevTotal)} (MoM ${momPct == null ? 'not comparable: zero baseline' : `${momPct}%`}), top overdue AR: ${arTop.map((r) => `${r.customerName} ${Math.round(r.netAmount ?? r.amount ?? 0)} (${r.overdueDays}d)`).join("; ") || "none"}, top overdue supplier: ${worstSupplier ? `${worstSupplier[0]} ${Math.round(worstSupplier[1])}` : "none"}, latest stockout SKUs: ${stockoutCount}.${salesCur._count === 0 ? " IMPORTANT: this month has zero sales records (data not imported yet) — do NOT report a sales drop; instead suggest importing data (link /pharmacy/import, priority low)." : ""}`;
      const response = await withDeadline((abortSignal) => genAI.models.generateContent({
        model: settings.geminiModel || "gemini-3.1-flash-lite-preview",
        contents: prompt,
        config: { responseMimeType: "application/json", abortSignal },
      }), 2000);
      const raw = response.text?.trim();
      if (raw) {
        const parsed = recommendationSchema.safeParse(JSON.parse(raw));
        if (parsed.success) {
          return { recommendations: parsed.data, source: "gemini", month: curLabel };
        }
      }
    }
  } catch (e) {
    console.error("Pharmacy recommendations AI failed; using heuristics:", e);
  }
  return { recommendations: heuristic, source: "heuristic", month: curLabel };
  });
  return NextResponse.json(data, { headers: { "X-Cache": hit ? "HIT" : "MISS" } });
}
