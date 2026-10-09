import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { notDeleted } from "@/lib/soft-delete";
import { ownedByUserOrAdmin } from "@/lib/tenant-scope";
import { GoogleGenAI } from "@google/genai";
import { NextRequest, NextResponse } from "next/server";

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
  const qYear = Number(req.nextUrl.searchParams.get("year"));
  const qMonth = Number(req.nextUrl.searchParams.get("month"));
  const base = Number.isFinite(qYear) && qMonth >= 1 && qMonth <= 12
    ? new Date(qYear, qMonth - 1, 1)
    : new Date(now.getFullYear(), now.getMonth(), 1);
  const cur = base;
  const prev = new Date(cur.getFullYear(), cur.getMonth() - 1, 1);
  const curLabel = `${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, "0")}`;

  const [salesCur, salesPrev, arTop, apTop, stockoutCount, overstockCount, reorderCount, expiring90Count] = await Promise.all([
    prisma.salesLine.aggregate({
      where: { ...userWhere, ...notDeleted, saleDate: { gte: cur } },
      _sum: { amount: true },
      _count: true,
    }),
    prisma.salesLine.aggregate({
      where: { ...userWhere, ...notDeleted, saleDate: { gte: prev, lt: cur } },
      _sum: { amount: true },
    }),
    prisma.receivable.findMany({
      where: { ...userWhere, ...notDeleted, paymentStatus: "overdue" },
      select: { customerName: true, netAmount: true, overdueDays: true },
      orderBy: { overdueDays: "desc" },
      take: 3,
    }),
    prisma.purchaseInvoice.findMany({
      where: { ...userWhere, ...notDeleted, status: "overdue" },
      select: { supplierName: true, netAmount: true, amount: true },
      take: 50,
    }),
    prisma.stockSnapshot.count({ where: { ...userWhere, qty: { lte: 0 } } }),
    prisma.salesLine.aggregate({
      where: { ...userWhere, ...notDeleted },
      _count: true,
    }),
    prisma.purchaseOrder.count({
      where: { ...userWhere, ...notDeleted, qtyDelivered: null },
    }),
    prisma.expiryLot.count({
      where: { ...userWhere, ...notDeleted, expDate: { gte: now, lt: new Date(now.getTime() + 90 * 86400000) } },
    }),
  ]);
  void overstockCount;
  void reorderCount;

  const salesTotal = salesCur._sum.amount ?? 0;
  const prevTotal = salesPrev._sum.amount ?? 0;
  const momPct = prevTotal > 0 ? Math.round(((salesTotal - prevTotal) / prevTotal) * 100) : 0;

  const apBySupplier = new Map<string, number>();
  for (const r of apTop) {
    const k = r.supplierName ?? "Unknown";
    apBySupplier.set(k, (apBySupplier.get(k) ?? 0) + (r.netAmount ?? r.amount ?? 0));
  }
  const worstSupplier = [...apBySupplier.entries()].sort((a, b) => b[1] - a[1])[0];

  const heuristic: PharmaRecommendation[] = [];
  if (salesCur._count === 0) {
    // Empty month (e.g. future month with no imports yet) — not a sales drop.
    heuristic.push({
      title: `${curLabel} sales records မရှိသေးပါ`,
      detail: "ဒီလအတွက် sales data မသွင်းရသေးလို့ analysis တွက်မရပါ။ Import page ကနေ data သွင်းပါ။",
      link: "/pharmacy/import",
      priority: "low",
    });
  } else if (momPct < -10) {
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
      detail: `${Math.round(t.netAmount ?? 0).toLocaleString()} — priority စာရင်းအတိုင်း ဖုန်းဆက်လိုက်ပါ။`,
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
Facts (MMK): this-month sales ${Math.round(salesTotal)}, last-month sales ${Math.round(prevTotal)} (MoM ${momPct}%), top overdue AR: ${arTop.map((r) => `${r.customerName} ${Math.round(r.netAmount ?? 0)} (${r.overdueDays}d)`).join("; ") || "none"}, top overdue supplier: ${worstSupplier ? `${worstSupplier[0]} ${Math.round(worstSupplier[1])}` : "none"}, stockout snapshot rows: ${stockoutCount}.${salesCur._count === 0 ? " IMPORTANT: this month has zero sales records (data not imported yet) — do NOT report a sales drop; instead suggest importing data (link /pharmacy/import, priority low)." : ""}`;
      const response = await genAI.models.generateContent({
        model: settings.geminiModel || "gemini-3.1-flash-lite-preview",
        contents: prompt,
        config: { responseMimeType: "application/json" },
      });
      const raw = response.text?.trim();
      if (raw) {
        const parsed = JSON.parse(raw) as PharmaRecommendation[];
        if (Array.isArray(parsed) && parsed.length > 0) {
          return NextResponse.json({ recommendations: parsed.slice(0, 5), source: "gemini", month: curLabel });
        }
      }
    }
  } catch (e) {
    console.error("Pharmacy recommendations AI failed; using heuristics:", e);
  }
  return NextResponse.json({ recommendations: heuristic, source: "heuristic", month: curLabel });
}
