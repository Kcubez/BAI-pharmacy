import { GoogleGenAI } from "@google/genai";
import { convertBurmeseDigits } from "@/lib/text-normalize";

export type CommerceIntent = "price_inquiry" | "order" | "delivery" | "complaint" | "interested" | "general";

export type ParsedCommerceItem = {
  name: string;
  sku: string | null;
  quantity: number;
  unitPrice: number | null;
};

export type ParsedCommerceMessage = {
  customerName: string | null;
  customerPhone: string | null;
  intent: CommerceIntent;
  items: ParsedCommerceItem[];
  note: string;
  suggestedFollowUpText: string;
  suggestedNextAction: string;
  suggestedFollowUpDate: Date | null;
  confidence: number;
  aiProvider: "gemini" | "heuristic";
  aiModel: string | null;
};

function normalized(text: string) {
  return convertBurmeseDigits(text).replace(/,/g, "");
}

function firstMatch(text: string, patterns: RegExp[]) {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]?.trim()) return match[1].trim();
  }
  return null;
}

function numberMatch(text: string, patterns: RegExp[]) {
  const value = firstMatch(normalized(text), patterns);
  if (!value) return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
}

function parseDate(value: unknown) {
  if (typeof value !== "string") return null;
  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? null : new Date(timestamp);
}

function fallback(text: string): ParsedCommerceMessage {
  const value = normalized(text);
  const customerName = firstMatch(text, [/customer\s*name\s*[:：]\s*([^\n]+)/i, /နာမည်\s*[:：]\s*([^\n]+)/i]);
  const customerPhone = firstMatch(value, [/phone\s*[:：]\s*([+\d\-\s]{6,})/i, /(09\d{7,10})/]);
  const itemName = firstMatch(text, [/product\s*(?:name)?\s*[:：]\s*([^\n]+)/i, /item\s*[:：]\s*([^\n]+)/i]);
  const quantity = numberMatch(value, [/qty\s*[:：]\s*(\d+)/i, /quantity\s*[:：]\s*(\d+)/i, /x\s*(\d+)/i]) ?? 1;
  const unitPrice = numberMatch(value, [/price\s*[:：]\s*(\d+(?:\.\d+)?)/i, /amount\s*[:：]\s*(\d+(?:\.\d+)?)/i]);
  const lower = text.toLowerCase();
  const intent: CommerceIntent = /complaint|မကျေနပ်|ပြဿနာ/.test(lower)
    ? "complaint"
    : /order|မှာ|ဝယ်/.test(lower)
      ? "order"
      : /delivery|deliver|ပို့/.test(lower)
        ? "delivery"
        : /price|ဈေး|စျေး/.test(lower)
          ? "price_inquiry"
          : /interested|စိတ်ဝင်စား/.test(lower)
            ? "interested"
            : "general";

  const action = intent === "complaint"
    ? "Review the complaint and respond with a resolution."
    : intent === "order"
      ? "Confirm stock, payment, and delivery details."
      : intent === "price_inquiry"
        ? "Send price, available options, and delivery information."
        : "Review the message and follow up with the customer.";

  return {
    customerName,
    customerPhone,
    intent,
    items: itemName ? [{ name: itemName, sku: null, quantity, unitPrice }] : [],
    note: text.trim(),
    suggestedFollowUpText: action,
    suggestedNextAction: action,
    suggestedFollowUpDate: null,
    confidence: 0.35,
    aiProvider: "heuristic",
    aiModel: null,
  };
}

function prompt(text: string) {
  return `Extract a product-sales lead or order from this Telegram message. Return JSON only.

Message:
${text}

Schema:
{
  "customerName": string | null,
  "customerPhone": string | null,
  "intent": "price_inquiry" | "order" | "delivery" | "complaint" | "interested" | "general",
  "items": [{"name": string, "sku": string | null, "quantity": number, "unitPrice": number | null}],
  "note": string,
  "suggestedFollowUpText": string,
  "suggestedNextAction": string,
  "suggestedFollowUpDate": "YYYY-MM-DD" | null
}

This is an internal owner note, never a message that will be sent automatically. Preserve Burmese/English product names. Use an empty array when no product is known.`;
}

export async function parseCommerceMessageWithGemini({
  text,
  apiKey,
  model,
}: {
  text: string;
  apiKey?: string | null;
  model?: string | null;
}): Promise<ParsedCommerceMessage> {
  const heuristic = fallback(text);
  if (!apiKey) return heuristic;

  try {
    const genAI = new GoogleGenAI({ apiKey });
    const response = await genAI.models.generateContent({
      model: model || "gemini-3.1-flash-lite-preview",
      contents: prompt(text),
      config: { responseMimeType: "application/json" },
    });
    const raw = response.text?.trim();
    if (!raw) return heuristic;
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const intents: CommerceIntent[] = ["price_inquiry", "order", "delivery", "complaint", "interested", "general"];
    const items = Array.isArray(parsed.items)
      ? parsed.items.flatMap((item) => {
          if (!item || typeof item !== "object") return [];
          const record = item as Record<string, unknown>;
          if (typeof record.name !== "string" || !record.name.trim()) return [];
          const quantity = typeof record.quantity === "number" && record.quantity > 0 ? Math.round(record.quantity) : 1;
          return [{
            name: record.name.trim(),
            sku: typeof record.sku === "string" ? record.sku : null,
            quantity,
            unitPrice: typeof record.unitPrice === "number" && record.unitPrice >= 0 ? record.unitPrice : null,
          }];
        })
      : heuristic.items;

    return {
      customerName: typeof parsed.customerName === "string" ? parsed.customerName : heuristic.customerName,
      customerPhone: typeof parsed.customerPhone === "string" ? parsed.customerPhone : heuristic.customerPhone,
      intent: typeof parsed.intent === "string" && intents.includes(parsed.intent as CommerceIntent) ? parsed.intent as CommerceIntent : heuristic.intent,
      items,
      note: typeof parsed.note === "string" ? parsed.note : heuristic.note,
      suggestedFollowUpText: typeof parsed.suggestedFollowUpText === "string" ? parsed.suggestedFollowUpText : heuristic.suggestedFollowUpText,
      suggestedNextAction: typeof parsed.suggestedNextAction === "string" ? parsed.suggestedNextAction : heuristic.suggestedNextAction,
      suggestedFollowUpDate: parseDate(parsed.suggestedFollowUpDate),
      confidence: 0.8,
      aiProvider: "gemini",
      aiModel: model || "gemini-3.1-flash-lite-preview",
    };
  } catch (error) {
    console.error("Commerce message parsing failed; using heuristic fallback:", error);
    return heuristic;
  }
}
