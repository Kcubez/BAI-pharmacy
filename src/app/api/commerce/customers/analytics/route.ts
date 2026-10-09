import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { notDeleted } from "@/lib/soft-delete";
import { customerOwnedByUserOrAdmin } from "@/lib/tenant-scope";
import { parsePeriodParams, resolvePeriodRange } from "@/lib/period-range";
import { NextRequest, NextResponse } from "next/server";

type CustomerMetric = {
  id: string;
  name: string;
  company: string | null;
  totalSpend: number;
  lifetimeValue: number;
  purchaseFrequency: number;
  averageOrderValue: number;
  lastPurchaseAt: string | null;
  segment: "vip" | "frequent" | "at_risk" | "new" | "standard";
};

function dealTotal(deal: { quotedAmount: number | null; items: { quantity: number; unitPrice: number }[] }) {
  const itemTotal = deal.items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
  return itemTotal || deal.quotedAmount || 0;
}

/**
 * BAI-service "Customer Value & Frequency" analytics ported onto commerce
 * purchases: per-customer spend in the selected period vs lifetime value
 * across all WON deals.
 */
export async function GET(req: NextRequest) {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

  const resolved = parsePeriodParams(req.nextUrl.searchParams);
  const { start, end } = resolvePeriodRange(resolved);

  const customers = await prisma.customer.findMany({
    where: { ...customerOwnedByUserOrAdmin(session), ...notDeleted },
    select: {
      id: true,
      name: true,
      company: true,
      deals: {
        where: notDeleted,
        select: {
          stage: true,
          wonAt: true,
          createdAt: true,
          quotedAmount: true,
          items: { select: { quantity: true, unitPrice: true } },
        },
        orderBy: [{ wonAt: "desc" }, { createdAt: "desc" }],
      },
    },
  });

  const now = new Date();
  const metrics: CustomerMetric[] = customers.map((customer) => {
    // Purchases only count WON deals; the money date matches Finance semantics.
    const purchases = customer.deals
      .filter((deal) => deal.stage === "WON")
      .map((deal) => ({ amount: dealTotal(deal), date: deal.wonAt ?? deal.createdAt }));
    const selected = purchases.filter((purchase) => purchase.date >= start && purchase.date < end);
    const totalSpend = selected.reduce((sum, purchase) => sum + purchase.amount, 0);
    const lifetimeValue = purchases.reduce((sum, purchase) => sum + purchase.amount, 0);
    const lastPurchaseDate = purchases[0]?.date ?? null;
    const daysSincePurchase = lastPurchaseDate
      ? Math.floor((now.getTime() - lastPurchaseDate.getTime()) / 86_400_000)
      : Infinity;
    const purchaseFrequency = selected.length;
    const averageOrderValue = purchaseFrequency ? totalSpend / purchaseFrequency : 0;
    const segment: CustomerMetric["segment"] = lifetimeValue > 0 && purchaseFrequency >= 3
      ? "vip"
      : purchaseFrequency >= 2
        ? "frequent"
        : lifetimeValue > 0 && daysSincePurchase > 90
          ? "at_risk"
          : purchaseFrequency === 1
            ? "new"
            : "standard";
    return {
      id: customer.id,
      name: customer.name,
      company: customer.company,
      totalSpend,
      lifetimeValue,
      purchaseFrequency,
      averageOrderValue,
      lastPurchaseAt: lastPurchaseDate?.toISOString() ?? null,
      segment,
    };
  });

  const active = metrics.filter((customer) => customer.purchaseFrequency > 0 || customer.lifetimeValue > 0);
  const topSorted = [...active].sort((a, b) => b.totalSpend - a.totalSpend || b.lifetimeValue - a.lifetimeValue);
  const bottomSorted = [...active].sort((a, b) => a.totalSpend - b.totalSpend || a.lifetimeValue - b.lifetimeValue);
  const top20 = topSorted.slice(0, 20);
  const bottom20 = bottomSorted.slice(0, 20);
  const comparisonSize = Math.min(20, Math.ceil(active.length / 2));
  const topComparison = topSorted.slice(0, comparisonSize);
  const bottomComparison = bottomSorted.slice(0, comparisonSize);
  const average = (items: CustomerMetric[]) =>
    items.length ? items.reduce((sum, customer) => sum + customer.totalSpend, 0) / items.length : 0;
  const vipCount = active.filter((customer) => customer.segment === "vip").length;
  const atRisk = active.filter((customer) => customer.segment === "at_risk");
  const newCustomers = active.filter((customer) => customer.segment === "new").length;

  const recommendations = [
    ...(vipCount > 0 ? [{ tone: "success", title: "VIP သုံးစွဲသူများကို ဆက်လက်ထိန်းသိမ်းပါ", message: `ယခုကာလအတွင်း ${vipCount} ဦးသည် (၃) ကြိမ်နှင့်အထက် ဝယ်ယူထားပါသည်။ ထပ်မံဝယ်ယူမှုရရှိစေရန် သက်တမ်းတိုးခြင်း၊ Loyalty အကျိုးခံစားခွင့် သို့မဟုတ် ဦးစားပေးဝန်ဆောင်မှု ပေးပါ။`, action: "Top 20 စာရင်းကို စစ်ဆေးရန်" }] : []),
    ...(atRisk.length > 0 ? [{ tone: "warning", title: "ဝယ်ယူမှုရပ်ထားသော သုံးစွဲသူများကို ပြန်လည်ဆက်သွယ်ပါ", message: `${atRisk.length} ဦးတွင် ဝယ်ယူမှုမှတ်တမ်းရှိသော်လည်း ရက် (၉၀) ကျော် လှုပ်ရှားမှုမရှိသေးပါ။`, action: "အန္တရာယ်ရှိသည့် သုံးစွဲသူများကို စစ်ဆေးရန်" }] : []),
    ...(newCustomers > 0 ? [{ tone: "info", title: "အသစ်ဝယ်ယူသူများကို ထပ်မံဝယ်ယူသူအဖြစ် ပြောင်းလဲပါ", message: `ယခုကာလအတွင်း ${newCustomers} ဦးက ပထမဆုံး ဝယ်ယူမှု ပြုလုပ်ထားပါသည်။ ဝယ်ယူပြီးနောက် follow-up ဆက်သွယ်ပြီး သင့်တော်သော နောက်ထပ် offer ကို အကြံပြုပါ။`, action: "အသစ်ဝယ်ယူသူများကို စစ်ဆေးရန်" }] : []),
    ...(active.length > 0 ? [{ tone: "info", title: "ဝယ်ယူမှုအကြိမ်ရေ တိုးတက်အောင် လုပ်ဆောင်ပါ", message: `လက်ရှိ သုံးစွဲသူတစ်ဦးလျှင် ပျမ်းမျှ ${(active.reduce((sum, customer) => sum + customer.purchaseFrequency, 0) / active.length).toFixed(1)} ကြိမ် ဝယ်ယူထားပါသည်။ သက်ဆိုင်ရာ product များကို အစုလိုက် offer ဖြင့် အကြံပြုပေးပါ။`, action: "သုံးစွဲသူအချက်အလက်ကို စစ်ဆေးရန်" }] : []),
  ].slice(0, 2);

  return NextResponse.json({
    top20,
    bottom20,
    summary: {
      totalCustomers: active.length,
      top20AverageSpend: average(topComparison),
      bottom20AverageSpend: average(bottomComparison),
      averageLifetimeValue: active.length ? active.reduce((sum, customer) => sum + customer.lifetimeValue, 0) / active.length : 0,
      averagePurchaseFrequency: active.length ? active.reduce((sum, customer) => sum + customer.purchaseFrequency, 0) / active.length : 0,
      atRiskCustomers: atRisk.length,
    },
    recommendations,
  });
}
