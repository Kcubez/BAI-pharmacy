import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { notDeleted } from "@/lib/soft-delete";
import { customerOwnedByUserOrAdmin, ownedByUserOrAdmin } from "@/lib/tenant-scope";
import { elapsedRatio, parsePeriodParams, resolvePeriodRange } from "@/lib/period-range";
import { NextRequest, NextResponse } from "next/server";

export type CommerceActionRecommendation = {
  area: "sales" | "finance" | "inventory" | "marketing" | "general";
  severity: "urgent" | "warning" | "info";
  title: string;
  insight: string;
  action: string;
  actionType:
    | "view_sales"
    | "view_finance"
    | "view_inventory"
    | "view_marketing"
    | "set_target_modal"
    | "general_dashboard";
};

function formatMmk(value: number) {
  return Math.round(value).toLocaleString();
}

// Pure code-based heuristics (no Gemini) — Burmese output, same philosophy as
// BAI-service's buildHeuristicRecommendations but over Commerce data.
function buildRecommendations(data: {
  revenue: number;
  salesTarget: number;
  expense: number;
  expenseTarget: number;
  ordersReceived: number;
  ordersFulfilled: number;
  outOfStockCount: number;
  outOfStockNames: string[];
  lowStockCount: number;
  overdueFollowUps: number;
  dueTodayFollowUps: number;
  stuckDeals: number;
  missingPhoneCustomers: number;
  adSpend: number;
  adOrders: number;
  targetConfigured: boolean;
  periodStart: Date;
  periodEnd: Date;
}): CommerceActionRecommendation[] {
  const recs: CommerceActionRecommendation[] = [];
  const ratio = elapsedRatio(data.periodStart, data.periodEnd);

  // ─── Revenue pacing vs target ──────────────────────────────────────────────
  if (data.targetConfigured && data.salesTarget > 0 && ratio > 0.15) {
    const expectedRevenue = data.salesTarget * ratio;
    const gap = expectedRevenue - data.revenue;
    if (gap > 0) {
      const pct = Math.round((data.revenue / expectedRevenue) * 100);
      recs.push({
        area: "sales",
        severity: pct < 60 ? "urgent" : "warning",
        title: "အရောင်းဝင်ငွေ ပစ်မှတ်နဲ့အထိ မရောက်သေးပါ",
        insight: `ဒီကာလရဲ့ မျှော်မှန်းဝင်ငွေထက် ${pct}% သာ ရရှိထားပါသည်။ ${formatMmk(gap)} MMK ကွာဟချက် ဖြည့်ရန် လိုအပ်နေပါသည်။`,
        action: "Deals စစ်ရန်",
        actionType: "view_sales",
      });
    }
  }

  // ─── Expense overrun ───────────────────────────────────────────────────────
  if (data.expenseTarget > 0 && data.expense > data.expenseTarget * Math.max(ratio, 0.5)) {
    const overPct = Math.round(((data.expense - data.expenseTarget * ratio) / (data.expenseTarget * ratio || 1)) * 100);
    recs.push({
      area: "finance",
      severity: data.expense > data.expenseTarget ? "urgent" : "warning",
      title: "အသုံးစရိတ် မြန်မြန်ဆန်ဆန် တိုးလာနေပါသည်",
      insight: `ကာလအတွင်း အသုံးစရိတ်သည် ဘတ်ဂျက်နှုန်းထက် ${overPct > 0 ? `${overPct}% ပို` : "မျှတ"}နေပါသည်။ စုစုပေါင်း ${formatMmk(data.expense)} MMK ထွက်နေပြီး ဘတ်ဂျက် ${formatMmk(data.expenseTarget)} MMK ဖြစ်သည်။`,
      action: "အသုံးစရိတ် စစ်ရန်",
      actionType: "view_finance",
    });
  }

  // ─── Out of stock products ────────────────────────────────────────────────
  if (data.outOfStockCount > 0) {
    recs.push({
      area: "inventory",
      severity: "urgent",
      title: `ပစ္စည်း ${data.outOfStockCount} မျိုး ပြတ်သွင်းနေရခြင်း`,
      insight: `${data.outOfStockNames.slice(0, 3).join("၊ ")}${data.outOfStockNames.length > 3 ? " အစရှိသည့်" : ""} ပစ္စည်းများ လုံးဝပြတ်နေပြီး ရောင်းလို့မရနိုင်တော့ပါ။`,
      action: "ပစ္စည်းစာရင်း စစ်ရန်",
      actionType: "view_inventory",
    });
  } else if (data.lowStockCount > 0) {
    recs.push({
      area: "inventory",
      severity: "warning",
      title: `Low Stock ပစ္စည်း ${data.lowStockCount} မျိုး ရှိနေပါသည်`,
      insight: "အနည်းဆုံး ပမာဏထက် နိမ့်နေသော ပစ္စည်းများ ရှိနေသဖြင့် နောက်မှာယူမှုများ ပြတ်လပ်မစေရန် ကြိုတင်စီစဉ်သင့်ပါသည်။",
      action: "Low Stock ကြည့်ရန်",
      actionType: "view_inventory",
    });
  }

  // ─── Overdue follow-ups ───────────────────────────────────────────────────
  if (data.overdueFollowUps > 0) {
    recs.push({
      area: "sales",
      severity: "urgent",
      title: `Follow-up ${data.overdueFollowUps} ခု သက်တမ်းကျော်နေပြီ`,
      insight: "သက်တမ်းကျော် Follow-up များ ရှိနေခြင်းသည် Customer ဆုံးရှုံးမှုသို့ ဦးတည်နေကြောင်း ညွှန်ပြပါသည်။",
      action: "Follow-up လုပ်ရန်",
      actionType: "view_sales",
    });
  } else if (data.dueTodayFollowUps > 0) {
    recs.push({
      area: "sales",
      severity: "warning",
      title: `ယနေ့ Follow-up လုပ်ရမည့် Customer ${data.dueTodayFollowUps} ဦး ရှိသည်`,
      insight: "ယနေ့လုပ်ရမည့် Follow-up များကို ညနေမရောက်မီ ဆောင်ရွက်ပြီးပါက Conversion ပိုမြင့်ပါလိမ့်မည်။",
      action: "ယနေ့စာရင်း စစ်ရန်",
      actionType: "view_sales",
    });
  }

  // ─── Deals stuck too long in pipeline ─────────────────────────────────────
  if (data.stuckDeals > 0) {
    recs.push({
      area: "sales",
      severity: "warning",
      title: `Deal ${data.stuckDeals} ခု ရက်ပေါင်းများစွာ ရပ်တည်နေပါသည်`,
      insight: "၇ ရက်ထက် ကြာနေသော Open Deal များသည် ဆက်လက်စောင့်ဆိုင်းပါက Close ဖြစ်နိုင်ခြေ နိမ့်လာပါသည်။",
      action: "Deals စစ်ဆေးရန်",
      actionType: "view_sales",
    });
  }

  // ─── Orders fulfilled lagging received ────────────────────────────────────
  if (data.ordersReceived > 0 && data.ordersFulfilled < data.ordersReceived) {
    const pending = data.ordersReceived - data.ordersFulfilled;
    recs.push({
      area: "general",
      severity: pending > 10 ? "urgent" : "warning",
      title: `Order ${pending} ခု ပို့ဆောင်ရေး စောင့်နေပါသည်`,
      insight: `Order လက်ခံရရှိမှု ${data.ordersReceived} ခုထဲမှ ${data.ordersFulfilled} ခုသာ Fulfilled ဖြစ်ပါသည်။ Delivery နှောင့်နှေးပါက Review Request များ ကျဆင်းနိုင်ပါသည်။`,
      action: "ပို့ဆောင်ရေး စစ်ရန်",
      actionType: "view_sales",
    });
  }

  // ─── Ad spend without measurable orders ───────────────────────────────────
  if (data.adSpend > 0 && data.adOrders === 0) {
    recs.push({
      area: "marketing",
      severity: "warning",
      title: "ကြော်ငြာစရိတ် အသုံးဝင်မှု မတိုင်းတာနိုင်ပါ",
      insight: `${formatMmk(data.adSpend)} MMK အသုံးစရိတ် ထွက်နေချိန်တွင် Ad-driven Order မျှတမှတ်တမ်းတင်ထားခြင်း မရှိပါ။`,
      action: "ကြော်ငြာစာရင်း ပြင်ရန်",
      actionType: "view_marketing",
    });
  }

  // ─── Missing phone numbers on customers ───────────────────────────────────
  if (data.missingPhoneCustomers > 3) {
    recs.push({
      area: "marketing",
      severity: "info",
      title: "Customer Data အရည်အသွေး တိုးတက်ရန် လိုသည်",
      insight: `ဖုန်းနံပါတ် မပါသော Customer ${data.missingPhoneCustomers} ဦး ရှိနေသဖြင့် ဆက်သွယ်မှုနှင့် Follow-up လုပ်ရန် ခက်ခဲနိုင်ပါသည်။`,
      action: "ဖောက်သည်များ စစ်ရန်",
      actionType: "view_marketing",
    });
  }

  // ─── Healthy fallback ─────────────────────────────────────────────────────
  if (recs.length === 0) {
    recs.push({
      area: "general",
      severity: "info",
      title: "လုပ်ငန်းလည်ပတ်မှု ကောင်းမွန်နေပါသည်",
      insight: "လက်ရှိ Data များအရ အရေးပေါ် Bottleneck မတွေ့ရပါ။ ရောင်းအား၊ ကုန်ပစ္စည်းနှင့် ကြော်ငြာတို့ ဟန်ချက်ညီနေပါသည်။",
      action: "အချက်အလက် စစ်ဆေးရန်",
      actionType: "general_dashboard",
    });
  }

  // ─── Defaults for specific areas so every workspace always has at least 2 relevant recommendations ───
  const defaults: CommerceActionRecommendation[] = [
    {
      area: "sales",
      severity: "info",
      title: "အရောင်း Pipeline နှင့် Deals များကို စစ်ဆေးပါ",
      insight: data.ordersReceived > 0
        ? `ယခုကာလအတွင်း စုစုပေါင်း Order/Deal ${data.ordersReceived} ခုရှိပြီး ${data.ordersFulfilled} ခု ပို့ဆောင်ပြီးပါပြီ။`
        : "အရောင်းမှတ်တမ်းအသစ်များနှင့် Deal အသစ်များကို ထည့်သွင်း၍ အရောင်းလမ်းကြောင်း စတင်စောင့်ကြည့်ပါ။",
      action: "Deals ကြည့်ရန်",
      actionType: "view_sales",
    },
    {
      area: "sales",
      severity: data.stuckDeals > 0 ? "warning" : "info",
      title: "Follow-up နှင့် Deal Status များ မွမ်းမံရန်",
      insight: data.dueTodayFollowUps > 0
        ? `ယနေ့အတွက် Follow-up လုပ်ဆောင်ရန် Customer ${data.dueTodayFollowUps} ဦး ကျန်ရှိနေပါသည်။`
        : "Quoted ဖြစ်နေသော Customer များကို ဆက်သွယ်ပြီး Deal ပိတ်နိုင်ရန် အာရုံစိုက်ပါ။",
      action: "Pipeline စစ်ရန်",
      actionType: "view_sales",
    },
    {
      area: "marketing",
      severity: data.adSpend > 0 ? "info" : "info",
      title: "ကြော်ငြာရလဒ်နှင့် အသုံးစရိတ် ချိန်ညှိမှု",
      insight: data.adSpend > 0
        ? `စုစုပေါင်း ကြော်ငြာစရိတ် ${formatMmk(data.adSpend)} MMK သုံးစွဲထားပြီး Ad-driven Order ${data.adOrders} ခု ရရှိထားပါသည်။`
        : "Marketing Campaign အသစ်များနှင့် ကြော်ငြာစရိတ်များကို မှတ်တမ်းတင်၍ ROI စစ်ဆေးပါ။",
      action: "Marketing ကြည့်ရန်",
      actionType: "view_marketing",
    },
    {
      area: "marketing",
      severity: "info",
      title: "ဖောက်သည်ဆွဲဆောင်မှု Channel များကို သုံးသပ်ပါ",
      insight: "Facebook, TikTok သို့မဟုတ် အခြား Channel များမှ ရရှိလာသော Lead အရည်အသွေးကို နှိုင်းယှဉ်လေ့လာပါ။",
      action: "Ad Metrics စစ်ရန်",
      actionType: "view_marketing",
    },
    {
      area: "finance",
      severity: data.targetConfigured ? "info" : "warning",
      title: data.targetConfigured ? "ဝင်ငွေ/အသုံးစရိတ် ပစ်မှတ်ကို နေ့စဉ်စောင့်ကြည့်ပါ" : "ပစ်မှတ် သတ်မှတ်ရန် လိုအပ်နေပါသည်",
      insight: data.targetConfigured
        ? `လက်ရှိဝင်ငွေ ${formatMmk(data.revenue)} MMK ကို ပစ်မှတ်နှင့် နှိုင်းယှဉ်ကြည့်ပြီး Sales လုပ်ဆောင်ချက်ကို ချိန်ညှိပါ။`
        : "ဝင်ငွေနှင့် အသုံးစရိတ် ပစ်မှတ်များ သတ်မှတ်ထားမှ လုပ်ငန်းစွမ်းဆောင်ရည်ကို တိုင်းတာနိုင်မည်ဖြစ်သည်။",
      action: data.targetConfigured ? "Finance စစ်ရန်" : "ပစ်မှတ် သတ်မှတ်ရန်",
      actionType: data.targetConfigured ? "view_finance" : "set_target_modal",
    },
    {
      area: "finance",
      severity: data.expense > data.revenue ? "warning" : "info",
      title: "အသုံးစရိတ် Category များကို ပုံမှန်ပြန်စစ်ပါ",
      insight: data.expense > 0
        ? `လက်ရှိကာလတွင် အသုံးစရိတ် ${formatMmk(data.expense)} MMK ရှိနေပါသည်။ အကြီးဆုံး Category များကို စစ်ဆေးပြီး မလိုအပ်သောကုန်ကျစရိတ် လျှော့ချပါ။`
        : "အသုံးစရိတ်များ မှတ်တမ်းတင်လာပါက Category အလိုက် ပြန်လည်သုံးသပ်နိုင်မည်ဖြစ်သည်။",
      action: "စာရင်း စစ်ဆေးရန်",
      actionType: "view_finance",
    },
    {
      area: "inventory",
      severity: data.outOfStockCount > 0 ? "urgent" : data.lowStockCount > 0 ? "warning" : "info",
      title: "ကုန်ပစ္စည်း အခြေအနေကို ဆက်လက်စောင့်ကြည့်ပါ",
      insight: data.outOfStockCount === 0 && data.lowStockCount === 0
        ? "Stock အခြေအနေ ကောင်းမွန်နေပါသည်။ ရောင်းအားကောင်းသော ပစ္စည်းများကို ကြိုတင်ဖြည့်ထားပါ။"
        : "ပြတ်သွင်းနေသော ပစ္စည်းများကို ဦးစားပေး ပြန်သွင်းပါ။",
      action: "Inventory စစ်ရန်",
      actionType: "view_inventory",
    },
    {
      area: "inventory",
      severity: "info",
      title: "ပစ္စည်းလက်ကျန်နှင့် Restock အစီအစဉ်",
      insight: "ရောင်းအားအကောင်းဆုံး ပစ္စည်းများ၏ လက်ကျန်စာရင်းကို အပတ်စဉ် စစ်ဆေးပြီး ပစ္စည်းပြတ်လပ်မှု မဖြစ်အောင် ထိန်းသိမ်းပါ။",
      action: "Catalog ကြည့်ရန်",
      actionType: "view_inventory",
    },
  ];

  for (const fallback of defaults) {
    if (!recs.some((rec) => rec.title === fallback.title)) {
      recs.push(fallback);
    }
  }

  return recs;
}

type HeuristicInput = Parameters<typeof buildRecommendations>[0];

// GET /api/dashboard/action-recommendations?period=...&year=...&month=...&day=...&from=...&to=...
export async function GET(req: NextRequest) {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const resolved = parsePeriodParams(req.nextUrl.searchParams);
  const periodRange = resolvePeriodRange(resolved);
  const { start, end } = periodRange;
  const userWhere = ownedByUserOrAdmin(session);
  const dateRange = { gte: start, lt: end };
  const startOfTodayMyanmar = new Date(Date.UTC(
    new Date(Date.now() + 6.5 * 60 * 60 * 1000).getUTCFullYear(),
    new Date(Date.now() + 6.5 * 60 * 60 * 1000).getUTCMonth(),
    new Date(Date.now() + 6.5 * 60 * 60 * 1000).getUTCDate(),
  ));
  const endOfToday = new Date(startOfTodayMyanmar.getTime() + 24 * 60 * 60 * 1000);
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  try {
    const [
      monthTarget,
      yearTarget,
      wonDeals,
      expenses,
      periodDeals,
      fulfilledOrders,
      outOfStockProducts,
      lowStockCount,
      overdueFollowUps,
      dueTodayFollowUps,
      stuckDealCount,
      missingPhoneCustomers,
      marketingAgg,
    ] = await Promise.all([
      prisma.periodTarget.findFirst({
        where: { userId: session.user.id, period: "month", year: start.getUTCFullYear(), month: start.getUTCMonth() + 1 },
      }),
      prisma.periodTarget.findFirst({
        where: { userId: session.user.id, period: "year", year: resolved.year, month: 0 },
      }),
      prisma.deal.findMany({
        where: { ...userWhere, ...notDeleted, stage: "WON", OR: [{ wonAt: dateRange }, { wonAt: null, createdAt: dateRange }] },
        include: { items: true },
      }),
      prisma.expense.aggregate({
        where: { ...userWhere, ...notDeleted, expenseDate: dateRange },
        _sum: { amount: true },
      }),
      prisma.deal.count({
        where: { ...userWhere, ...notDeleted, createdAt: dateRange },
      }),
      prisma.deal.count({
        where: {
          ...userWhere,
          ...notDeleted,
          fulfillmentStatus: "FULFILLED",
          OR: [{ wonAt: dateRange }, { wonAt: null, createdAt: dateRange }],
        },
      }),
      prisma.product.findMany({
        where: { ...userWhere, ...notDeleted, stockQty: { lte: 0 } },
        select: { name: true },
        take: 10,
      }),
      prisma.product.count({
        where: { ...userWhere, ...notDeleted, stockQty: { gt: 0 } },
      }),
      prisma.followUpNote.count({
        where: {
          status: "DRAFT",
          suggestedFollowUpDate: { lt: startOfTodayMyanmar },
          deal: { ...userWhere, ...notDeleted },
        },
      }),
      prisma.followUpNote.count({
        where: {
          status: "DRAFT",
          suggestedFollowUpDate: { gte: startOfTodayMyanmar, lt: endOfToday },
          deal: { ...userWhere, ...notDeleted },
        },
      }),
      prisma.deal.count({
        where: {
          ...userWhere,
          ...notDeleted,
          stage: { in: ["NEW_LEAD", "QUOTED", "FOLLOW_UP_NEEDED", "PENDING"] },
          createdAt: { lt: sevenDaysAgo },
        },
      }),
      prisma.customer.count({
        where: {
          ...customerOwnedByUserOrAdmin(session),
          ...notDeleted,
          phone: null,
          createdAt: dateRange,
        },
      }),
      prisma.marketingMetric.aggregate({
        where: { ...userWhere, ...notDeleted, metricDate: dateRange },
        _sum: { spend: true, adDrivenOrders: true },
      }),
    ]);

    const targets = monthTarget ?? yearTarget ?? undefined;
    const dealRevenue = (deal: { quotedAmount: number | null; items: { quantity: number; unitPrice: number }[] }) => {
      const itemTotal = deal.items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
      return itemTotal || deal.quotedAmount || 0;
    };

    const inputData: HeuristicInput = {
      revenue: wonDeals.reduce((sum, deal) => sum + dealRevenue(deal), 0),
      salesTarget: targets?.targetSalesAmount ?? 0,
      expense: expenses._sum.amount ?? 0,
      expenseTarget: targets?.targetExpenseAmount ?? 0,
      ordersReceived: periodDeals,
      ordersFulfilled: fulfilledOrders,
      outOfStockCount: outOfStockProducts.length,
      outOfStockNames: outOfStockProducts.map((product) => product.name),
      lowStockCount,
      overdueFollowUps,
      dueTodayFollowUps,
      stuckDeals: stuckDealCount,
      missingPhoneCustomers,
      adSpend: marketingAgg._sum.spend ?? 0,
      adOrders: marketingAgg._sum.adDrivenOrders ?? 0,
      // Only pace against a target the owner actually saved (non-zero sales target).
      targetConfigured: (monthTarget?.targetSalesAmount ?? yearTarget?.targetSalesAmount ?? 0) > 0,
      periodStart: start,
      periodEnd: end,
    };

    const recommendations = buildRecommendations(inputData);
    return NextResponse.json({ recommendations, source: "local" });
  } catch (error) {
    console.error("Commerce recommendations failed:", error);
    return NextResponse.json({ message: "Unable to build recommendations" }, { status: 500 });
  }
}
