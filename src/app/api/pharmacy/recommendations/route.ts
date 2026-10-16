import { getPharmacyOverviewResponse } from "@/lib/pharmacy-overview";
import type { PharmacyOverview } from "@/hooks/use-pharmacy";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { GoogleGenAI } from "@google/genai";
import { NextRequest, NextResponse } from "next/server";
import { cached } from "@/lib/upstash";
import { withDeadline } from "@/lib/with-deadline";
import { z } from "zod";

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

// Recommendations use exactly the same period-scoped facts as the overview.
export async function GET(req: NextRequest) {
  const response = await getPharmacyOverviewResponse(req);
  if (!response.ok) return response;
  const overview: PharmacyOverview = await response.json();
  const curLabel = req.nextUrl.searchParams.get("period") === "overall" ? "Overall" : overview.anchor.label;
  if (!overview.hasData) {
    return NextResponse.json({ recommendations: [], source: "heuristic", month: curLabel });
  }
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  const { data, hit } = await cached("pharmacy", session.user.id, `recommendations-v5:${req.nextUrl.searchParams.toString()}`, 60, async () => {
  const heuristic: PharmaRecommendation[] = (overview.alerts ?? []).map(alert => ({
    title: alert.title, detail: alert.detail, link: alert.action?.href ?? "/pharmacy",
    priority: alert.tone === "red" ? "high" : alert.tone === "amber" ? "medium" : "low",
  }));
  // Try Gemini for richer Myanmar analysis; fall back to heuristics.
  try {
    const settings = await prisma.botSettings.findFirst({
      where: { userId: session.user.id, isActive: true },
      select: { geminiApiKey: true, geminiModel: true },
    });
    if (settings?.geminiApiKey) {
      const genAI = new GoogleGenAI({ apiKey: settings.geminiApiKey });
      const prompt = `You are a pharmaceutical distribution business analyst. Reply ONLY with a JSON array of up to 5 items: [{"title": string (Myanmar), "detail": string (Myanmar), "link": one of /pharmacy /pharmacy/sales /pharmacy/ar /pharmacy/inventory /pharmacy/payables /pharmacy/import, "priority": "high"|"medium"|"low"}].
Use only these selected-period facts. Do not infer current balances or missing payment history. AR balance cutoff: ${overview.ar.asOf}. AP is currently open invoices issued in the selected period, matching Supplier Payables.
Sales: ${overview.sales.total}; collection: ${overview.collection.total}; purchases: ${overview.purchases.total}.
AR: ${overview.ar.available ? overview.ar.outstanding : "historical balance unavailable"}; AP: ${overview.ap.available ? overview.ap.outstanding : "historical balance unavailable"}.
Verified signals: ${JSON.stringify(heuristic)}.`;
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
