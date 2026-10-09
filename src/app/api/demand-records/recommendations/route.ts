import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { notDeleted } from "@/lib/soft-delete";
import { ownedByUserOrAdmin, senderOwnedByUserOrAdmin } from "@/lib/tenant-scope";
import { GoogleGenAI } from "@google/genai";
import { NextRequest, NextResponse } from "next/server";

// Helper for Gemini retry
async function generateContentWithRetry(
  genAI: GoogleGenAI,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  options: { model: string; contents: string | any[] },
  maxRetries = 3,
  delayMs = 1500
): Promise<{ text?: string }> {
  let lastError: unknown = null;
  for (let i = 0; i < maxRetries; i++) {
    try {
      const response = await (genAI.models.generateContent(options) as Promise<{ text?: string }>);
      return response;
    } catch (err) {
      lastError = err;
      const errStr = typeof err === 'object' && err !== null ? JSON.stringify(err) : String(err);
      if (
        errStr.includes('503') ||
        errStr.includes('429') ||
        errStr.toLowerCase().includes('unavailable') ||
        errStr.toLowerCase().includes('high demand') ||
        errStr.toLowerCase().includes('overloaded') ||
        errStr.toLowerCase().includes('fetch failed')
      ) {
        await new Promise((resolve) => setTimeout(resolve, delayMs * Math.pow(2, i)));
        continue;
      }
      throw err;
    }
  }
  throw lastError;
}

export async function GET(req: NextRequest) {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  try {
    const settings = await prisma.botSettings.findFirst({
      where: { isActive: true, ...ownedByUserOrAdmin(session) },
      select: { geminiApiKey: true, geminiModel: true },
    });

    // Fetch up to 15 pending records that need follow-up
    const pendingRecords = await prisma.demandRecord.findMany({
      where: {
        status: { notIn: ['closed', 'completed'] },
        customerName: { not: null },
        ...senderOwnedByUserOrAdmin(session),
        ...notDeleted,
      },
      orderBy: { createdAt: 'desc' },
      take: 15,
    });

    if (pendingRecords.length === 0) {
      return NextResponse.json({ recommendations: [] });
    }

    // Heuristic Fallback in case no Gemini key is active or it fails
    const buildHeuristicRecommendations = () => {
      return pendingRecords.slice(0, 5).map(r => {
        const serviceText = r.serviceName ? `${r.serviceName} ကို စိတ်ဝင်စားနေပါသည်။` : 'ဝန်ဆောင်မှုများအကြောင်း စုံစမ်းမေးမြန်းထားပါသည်။';
        const dateText = r.followUpDate 
          ? `ဖုန်းပြန်ဆက်ရမည့်ရက်- ${r.followUpDate.toISOString().slice(0, 10)}` 
          : 'ဆက်သွယ်ရန်ရက် မသတ်မှတ်ရသေးပါ';
        return {
          customerName: r.customerName || 'အမည်မသိ သုံးစွဲသူ',
          insight: `${serviceText} လုပ်ဆောင်ရန်- အသေးစိတ် ဆွေးနွေးရန် ဆက်သွယ်ပါ။ (${dateText})`,
        };
      });
    };

    if (!settings?.geminiApiKey) {
      return NextResponse.json({ recommendations: buildHeuristicRecommendations() });
    }

    // Format records for prompt
    const dataSummary = pendingRecords.map((r, i) => {
      return `${i + 1}. Customer: "${r.customerName}" | Service: "${r.serviceName || 'N/A'}" | Date: ${r.createdAt.toISOString().slice(0, 10)} | Notes: "${r.note || 'N/A'}" | FU Date: ${r.followUpDate ? r.followUpDate.toISOString().slice(0, 10) : 'N/A'}`;
    }).join('\n');

    const prompt = `You are a smart sales pipeline analyzer. Below is a list of recent pending customer inquiries/demands. Compile a "Smart Hotlist" of actionable follow-up priorities.
Group by customer name. Highlight what they want and recommend a single, brief, 1-sentence action. 
CRITICAL: The "insight" field must be written in Burmese (Myanmar language) so it is easy for local staff to read.
Output exactly a JSON array of objects with fields "customerName" and "insight". Do not output markdown, explainers, or any text other than the JSON block.

Pending Inquiries:
"""
${dataSummary}
"""

Example Output:
[
  {
    "customerName": "Thura",
    "insight": "Telegram Sale Bot ကို စိတ်ဝင်စားနေသည်။ လုပ်ဆောင်ရန်- ဈေးနှုန်းအသေးစိတ် ပေးပို့ပြီး demo စမ်းသပ်ရန် ရက်ချိန်းယူပါ။"
  }
]`;

    const genAI = new GoogleGenAI({ apiKey: settings.geminiApiKey });
    const modelName = settings.geminiModel || 'gemini-3.1-flash-lite-preview';

    const response = await generateContentWithRetry(genAI, {
      model: modelName,
      contents: prompt,
    });

    const responseText = response?.text;
    if (!responseText) {
      return NextResponse.json({ recommendations: buildHeuristicRecommendations() });
    }

    const cleanedJson = responseText
      .replace(/```json\n?/g, '')
      .replace(/```\n?/g, '')
      .trim();

    const recommendations = JSON.parse(cleanedJson);
    if (!Array.isArray(recommendations)) {
      throw new Error("Result is not an array");
    }

    return NextResponse.json({ recommendations });
  } catch (err) {
    console.error("Failed to generate AI recommendations:", err);
    // In case of any error, we return the heuristic fallback so the dashboard card never crashes
    try {
      const pendingRecords = await prisma.demandRecord.findMany({
        where: {
          status: { notIn: ['closed', 'completed'] },
          customerName: { not: null },
          ...senderOwnedByUserOrAdmin(session),
          ...notDeleted,
        },
        orderBy: { createdAt: 'desc' },
        take: 5,
      });
      const fallbackRecs = pendingRecords.map(r => {
        const serviceText = r.serviceName ? `${r.serviceName} ကို စိတ်ဝင်စားနေပါသည်။` : 'ဝန်ဆောင်မှုများအကြောင်း စုံစမ်းမေးမြန်းထားပါသည်။';
        const dateText = r.followUpDate 
          ? `ရက်စွဲ- ${r.followUpDate.toISOString().slice(0, 10)}` 
          : 'ရက်စွဲ မသတ်မှတ်ရသေးပါ';
        return {
          customerName: r.customerName || 'အမည်မသိ သုံးစွဲသူ',
          insight: `${serviceText} လုပ်ဆောင်ရန်- လိုအပ်ချက်များ ဆွေးနွေးရန် ဆက်သွယ်ပါ။ (${dateText})`,
        };
      });
      return NextResponse.json({ recommendations: fallbackRecs });
    } catch {
      return NextResponse.json({ recommendations: [] });
    }
  }
}
