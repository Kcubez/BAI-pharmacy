import * as XLSX from "xlsx";
import { analyzeDemandRecord, type DemandAnalysis } from "@/lib/demand-analysis";
import type { ParsedDemandRecord } from "@/lib/demand-parser";

export type ImportedDemandRow = {
  rawData: Record<string, string>;
  normalized: ParsedDemandRecord;
  analysis: DemandAnalysis;
};

export type DemandColumnMapping = Partial<Record<keyof ParsedDemandRecord, string>>;

const FIELD_ALIASES: Array<{ field: keyof ParsedDemandRecord; aliases: string[] }> = [
  {
    field: "customerName",
    aliases: ["customer", "client", "name", "fb account", "fb account name", "lead name", "contact name", "သုံးစွဲသူ", "နာမည်"],
  },
  {
    field: "customerPhone",
    aliases: ["phone", "ph", "phone no", "ph no", "tel", "mobile", "contact", "ဖုန်း", "ဖုန်းနံပါတ်"],
  },
  {
    field: "customerCompany",
    aliases: ["company", "business", "shop", "organization", "industry", "business name", "လုပ်ငန်း", "ကုမ္ပဏီ"],
  },
  {
    field: "serviceName",
    aliases: ["service", "service name", "purchased service", "package", "product", "plan", "interest", "requirement", "လိုချင်", "ဝန်ဆောင်မှု"],
  },
  {
    field: "serviceAmount",
    aliases: ["amount", "price", "revenue", "income", "budget", "service amount", "purchase amount", "purchase amount mmk", "total", "ငွေပမာဏ", "စျေး"],
  },
  {
    field: "serviceQty",
    aliases: ["qty", "quantity", "count", "service qty", "အရေအတွက်"],
  },
  {
    field: "followUpDate",
    aliases: ["follow up", "follow-up", "follow up date", "next follow up", "next fu", "next fu date", "fu date", "next action date"],
  },
  {
    field: "status",
    aliases: ["status", "stage", "pipeline", "အခြေအနေ"],
  },
  {
    field: "note",
    aliases: ["note", "notes", "last contact note", "remark", "remarks", "call notes", "chat notes", "summary", "description", "မှတ်စု"],
  },
  {
    field: "createdAt",
    aliases: ["date", "created", "created at", "report date", "lead date", "ရက်စွဲ"],
  },
  {
    field: "sourceChannel",
    aliases: ["source channel", "source_channel", "channel", "platform", "source"],
  },
];

const NUMBER_PATTERN = /[^\d.-]/g;

function normalizeHeader(value: unknown) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ");
}

function cleanCell(value: unknown) {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).trim();
}

function parseNumber(value: string): number | null {
  const cleaned = value.replace(NUMBER_PATTERN, "");
  if (!cleaned) return null;
  const num = Number(cleaned);
  return Number.isFinite(num) ? num : null;
}

function parseDate(value: string): Date | null {
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : new Date(parsed);
}

function normalizeStatus(value: string) {
  const lower = value.toLowerCase();
  if (lower.includes("close") || lower.includes("complete") || lower.includes("done")) return "closed";
  if (lower.includes("contact") || lower.includes("call")) return "contacted";
  if (lower.includes("quote")) return "quoted";
  if (lower.includes("pending") || lower.includes("wait")) return "pending";
  return "new";
}

export function detectDemandColumnMapping(headers: unknown[]): DemandColumnMapping {
  const normalizedHeaders = headers.map((header) => ({
    original: cleanCell(header),
    normalized: normalizeHeader(header),
  }));
  const mapping: DemandColumnMapping = {};

  for (const { field, aliases } of FIELD_ALIASES) {
    const match = normalizedHeaders.find(({ normalized }) =>
      aliases.some((alias) => normalized === alias || normalized.includes(alias)),
    );
    if (match?.original) mapping[field] = match.original;
  }

  return mapping;
}

function pickByMapping(row: Record<string, string>, mapping: DemandColumnMapping, field: keyof ParsedDemandRecord) {
  const header = mapping[field];
  return header ? row[header] || "" : "";
}

export function parseDemandRowsFromWorkbook(fileBuffer: Buffer): {
  rows: ImportedDemandRow[];
  detectedColumns: string[];
  columnMapping: DemandColumnMapping;
} {
  const workbook = XLSX.read(fileBuffer, { type: "buffer", cellDates: true });
  const allRows: ImportedDemandRow[] = [];
  const detectedColumns = new Set<string>();
  let firstMapping: DemandColumnMapping = {};

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    const grid = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: false, defval: "" });
    if (grid.length < 2) continue;

    const headers = grid[0].map(cleanCell);
    headers.forEach((header) => {
      if (header) detectedColumns.add(header);
    });
    const mapping = detectDemandColumnMapping(headers);
    if (Object.keys(firstMapping).length === 0) firstMapping = mapping;

    for (const values of grid.slice(1)) {
      const rawData: Record<string, string> = {};
      headers.forEach((header, index) => {
        if (header) rawData[header] = cleanCell(values[index]);
      });

      if (!Object.values(rawData).some((value) => value.trim())) continue;

      const noteParts = [
        pickByMapping(rawData, mapping, "note"),
        Object.entries(rawData)
          .filter(([header]) => !Object.values(mapping).includes(header))
          .map(([header, value]) => `${header}: ${value}`)
          .join(" | "),
      ].filter(Boolean);

      const serviceQty = parseNumber(pickByMapping(rawData, mapping, "serviceQty"));
      const serviceAmount = parseNumber(pickByMapping(rawData, mapping, "serviceAmount"));
      const followUpDate = parseDate(pickByMapping(rawData, mapping, "followUpDate"));
      const createdAt = parseDate(pickByMapping(rawData, mapping, "createdAt"));
      const normalized: ParsedDemandRecord = {
        customerName: pickByMapping(rawData, mapping, "customerName") || null,
        customerPhone: pickByMapping(rawData, mapping, "customerPhone") || null,
        customerCompany: pickByMapping(rawData, mapping, "customerCompany") || null,
        category: "demand",
        status: normalizeStatus(pickByMapping(rawData, mapping, "status")),
        note: noteParts.join("\n") || Object.values(rawData).join(" | "),
        confidence: Object.keys(mapping).length >= 4 ? 0.78 : 0.52,
        aiProvider: "column_mapper",
        aiModel: null,
        followUpDate,
        serviceName: pickByMapping(rawData, mapping, "serviceName") || null,
        serviceAmount,
        serviceQty: serviceQty ? Math.round(serviceQty) : null,
        createdAt,
        sourceChannel: pickByMapping(rawData, mapping, "sourceChannel") || null,
      };

      allRows.push({
        rawData,
        normalized,
        analysis: analyzeDemandRecord(normalized),
      });
    }
  }

  return {
    rows: allRows,
    detectedColumns: Array.from(detectedColumns),
    columnMapping: firstMapping,
  };
}
