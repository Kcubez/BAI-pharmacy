import { auth } from "@/lib/auth";
import { isFileTooLarge, isSpreadsheetFile } from "@/lib/demand-parser";
import {
  detectPharmaSheetKind,
  detectStockPeriod,
  parseExpirySheet,
  parseInvoiceSheet,
  parseMaEiSheet,
  parseMegaSheet,
  parseMinMaxSheet,
  parseMovementSheet,
  parsePOSheet,
  parsePriceListSheet,
  parseReceivableSheet,
  parseReturnsSheet,
  parseStockSheet,
  parseStoreInSheet,
  readPharmacyWorkbook,
} from "@/lib/pharmacy-import";
import { pharmacyImportSchema } from "@/lib/validations";
import { NextRequest, NextResponse } from "next/server";

// POST /api/pharmacy/import/preview — parse a distributor workbook WITHOUT
// writing to the DB. Returns a per-sheet summary (kind + row count) so the
// import page can show a Data-Import-style preview step before confirm.
// Body (multipart): file, stockYear?, stockMonth?
export async function POST(req: NextRequest) {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ message: "Invalid upload" }, { status: 400 });
  }
  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ message: "Upload a spreadsheet file" }, { status: 400 });
  }
  if (!isSpreadsheetFile(file.type, file.name)) {
    return NextResponse.json({ message: "Only .xlsx/.xls/.xlsm/.csv files are supported" }, { status: 422 });
  }
  if (isFileTooLarge(file.size)) {
    return NextResponse.json({ message: "File is too large (max 10MB)" }, { status: 413 });
  }
  const parsed = pharmacyImportSchema.safeParse({
    stockYear: formData.get("stockYear") ?? undefined,
    stockMonth: formData.get("stockMonth") ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json({ message: parsed.error.issues[0]?.message ?? "Invalid import options" }, { status: 400 });
  }
  const { stockYear, stockMonth } = parsed.data;
  // Omit stockYear/stockMonth (zero-input upload) → auto-detect from names.

  const buffer = Buffer.from(await file.arrayBuffer());
  try {
    const sheets = readPharmacyWorkbook(buffer).map((sheet) => {
      const kind = detectPharmaSheetKind(sheet);
      try {
        switch (kind) {
          case "po":
            return { sheetName: sheet.sheetName, kind, rows: parsePOSheet(sheet, session.user.id).length };
          case "invoice":
            return { sheetName: sheet.sheetName, kind, rows: parseInvoiceSheet(sheet, session.user.id).length };
          case "price_list":
            return { sheetName: sheet.sheetName, kind, rows: parsePriceListSheet(sheet, session.user.id).length };
          case "stock": {
            const period = detectStockPeriod(sheet.sheetName, file.name, { stockYear, stockMonth });
            if (!period) {
              return { sheetName: sheet.sheetName, kind: "unknown" as const, rows: 0, note: "Stock year/month မသိ — preview အထက်မှာ ဖြည့်ပါ" };
            }
            return { sheetName: sheet.sheetName, kind, rows: parseStockSheet(sheet, session.user.id, period.year, period.month).length, note: `${period.year}-${String(period.month).padStart(2, "0")}` };
          }
          case "movement": {
            const period = detectStockPeriod(sheet.sheetName, file.name, { stockYear, stockMonth });
            if (!period) {
              return { sheetName: sheet.sheetName, kind: "unknown" as const, rows: 0, note: "Period မသိ — ဖိုင်နာမည်မှာ လ/နှစ်ပါရမယ်" };
            }
            return { sheetName: sheet.sheetName, kind, rows: parseMovementSheet(sheet, session.user.id, period.year, period.month).length, note: `${period.year}-${String(period.month).padStart(2, "0")}` };
          }
          case "minmax":
            return { sheetName: sheet.sheetName, kind, rows: parseMinMaxSheet(sheet, session.user.id).length, note: "Product Min/Max levels" };
          case "expiry":
            return { sheetName: sheet.sheetName, kind, rows: parseExpirySheet(sheet, session.user.id).length, note: "Expiry lots" };
          case "storein":
            return { sheetName: sheet.sheetName, kind, rows: parseStoreInSheet(sheet, session.user.id).length, note: "Store-in lots (name + batch)" };
          case "returns":
            return { sheetName: sheet.sheetName, kind, rows: parseReturnsSheet(sheet, session.user.id).length, note: "Return-in lines" };
          case "receivable":
            return { sheetName: sheet.sheetName, kind, rows: parseReceivableSheet(sheet, session.user.id).length };
          case "sales_maei":
            return { sheetName: sheet.sheetName, kind, rows: parseMaEiSheet(sheet, session.user.id).length };
          case "sales_mega":
            return { sheetName: sheet.sheetName, kind, rows: parseMegaSheet(sheet, session.user.id).length };
          default:
            return { sheetName: sheet.sheetName, kind: "unknown" as const, rows: sheet.rows.length, note: "Skip မယ် (Weekly splits / Ledger / Aging summary)" };
        }
      } catch {
        return { sheetName: sheet.sheetName, kind: "unknown" as const, rows: 0, note: "Parse မရပါ — skip မယ်" };
      }
    });
    const importable = sheets.filter((s) => s.kind !== "unknown");
    return NextResponse.json({
      fileName: file.name,
      sheets,
      sheetCount: sheets.length,
      importableSheets: importable.length,
      importableRows: importable.reduce((sum, s) => sum + s.rows, 0),
    });
  } catch (e) {
    return NextResponse.json(
      { message: `Preview failed: ${(e as Error).message}` },
      { status: 500 },
    );
  }
}
