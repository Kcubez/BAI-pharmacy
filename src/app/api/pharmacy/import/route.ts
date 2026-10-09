import { auth } from "@/lib/auth";
import { isFileTooLarge, isSpreadsheetFile } from "@/lib/demand-parser";
import { importPharmacyWorkbook } from "@/lib/pharmacy-import";
import { pharmacyImportSchema } from "@/lib/validations";
import { bumpCacheVersion, checkRateLimit, publishEvent } from "@/lib/upstash";
import { NextRequest, NextResponse } from "next/server";

// POST /api/pharmacy/import — upload a distributor workbook (PO/Invoice,
// Stock, Receivable, Sales-detail, iStock movement/min-max/expiry/returns).
// Writes via idempotent importKeys.
// Body (multipart): file, stockYear?, stockMonth?, overwrite?, onlyKind?
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
    overwrite: formData.get("overwrite") ?? undefined,
    onlyKind: formData.get("onlyKind") ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json({ message: parsed.error.issues[0]?.message ?? "Invalid import options" }, { status: 400 });
  }
  const { stockYear, stockMonth, overwrite, onlyKind } = parsed.data;

  const buffer = Buffer.from(await file.arrayBuffer());
  const rl = await checkRateLimit("import", session.user.id);
  if (!rl.ok) {
    return NextResponse.json({ message: "Too many imports — please wait a minute and retry." }, { status: 429 });
  }
  try {
    const summaries = await importPharmacyWorkbook(session.user.id, buffer, file.name, {
      stockYear,
      stockMonth,
      overwrite,
      onlyKind,
      asOf: new Date(),
    });
    const created = summaries.reduce((s, x) => s + x.created, 0);
    const updated = summaries.reduce((s, x) => s + x.updated, 0);
    // Fresh data: bust the API cache and notify live dashboards.
    await bumpCacheVersion("pharmacy", session.user.id);
    await publishEvent(session.user.id, "pharmacy");
    return NextResponse.json({ fileName: file.name, created, updated, sheets: summaries });
  } catch (e) {
    return NextResponse.json(
      { message: `Import failed: ${(e as Error).message}` },
      { status: 500 },
    );
  }
}
