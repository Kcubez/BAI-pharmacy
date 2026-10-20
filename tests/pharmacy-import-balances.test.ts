// @vitest-environment node
import { beforeEach, expect, it, vi } from "vitest";
import { existsSync, readFileSync } from "node:fs";
const mocks = vi.hoisted(() => ({ findMany: vi.fn(), createMany: vi.fn(), update: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ prisma: { receivable: mocks } }));
vi.mock("@/lib/demand-parser", () => ({ parseExcelDate: (v: unknown) => v ? new Date(String(v)) : null }));
import { parseStockSheet, readPharmacyWorkbook, importReceivableSheet } from "@/lib/pharmacy-import";
const arSheet = (sheetName: string) => ({ sheetName, titleHint: "", rows: [{ "Invoice No.": "1", "Customer Name": "Customer", "Payment Status": "Paid", "Net Amount": 100, "Paid Date": "2026-08-01" }] });
beforeEach(() => {
  mocks.findMany.mockResolvedValue([]);
  mocks.createMany.mockResolvedValue({ count: 0 });
  mocks.update.mockResolvedValue({});
});
it.skipIf(!existsSync("data-files/04-stock/June,July ,August 2026 Stock.xlsx"))("retains every price row in the actual August stock workbook", () => {
  const sheet = readPharmacyWorkbook(readFileSync("data-files/04-stock/June,July ,August 2026 Stock.xlsx")).find(s => s.sheetName === "August")!;
  const rows = parseStockSheet(sheet, "user", 2026, 8);
  expect(rows).toHaveLength(782);
  expect(rows.reduce((sum, row) => sum + (row.amount ?? 0), 0)).toBeCloseTo(3340919598.074168, 2);
  expect(rows.find(row => row.itemCode === "B208")).toMatchObject({ qty: 1162, amount: 2547900 });
});
it("combines normalized codes and calculates a weighted price", () => {
  const rows = parseStockSheet({ sheetName: "August", titleHint: "", rows: [
    { "Item Code": " a 1 ", Qty: 2, "Unit Price": 10 },
    { "Item Code": "A1", Qty: 3, "Unit Price": 20, Amount: 60 },
  ] }, "user", 2026, 8);
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({ itemCode: "A1", qty: 5, amount: 80, unitPrice: 16 });
});
it("updates an older invoice from a newer monthly source without requiring overwrite", async () => {
  mocks.findMany.mockResolvedValue([{ id: "id", importKey: "ph:ar:user:Customer:1", sourceSheet: "June", sourceFileName: "AR 2026.xlsx", deletedAt: null }]);
  const result = await importReceivableSheet("user", arSheet("August"), "AR 2026.xlsx");
  expect(result.updated).toBe(1);
  expect(mocks.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ paymentStatus: "paid", sourceSheet: "August" }) }));
});
it("does not replace newer invoice status with an older file even with overwrite", async () => {
  mocks.findMany.mockResolvedValue([{ id: "id", importKey: "ph:ar:user:Customer:1", sourceSheet: "August", sourceFileName: "AR 2026.xlsx", deletedAt: null }]);
  const result = await importReceivableSheet("user", arSheet("June"), "AR 2026.xlsx", new Date(), { overwrite: true });
  expect(result.skipped).toBe(1);
  expect(mocks.update).not.toHaveBeenCalled();
});
it("does not restore trashed invoices during reconciliation", async () => {
  mocks.findMany.mockResolvedValue([{ id: "id", importKey: "ph:ar:user:Customer:1", sourceSheet: "June", sourceFileName: "AR 2026.xlsx", deletedAt: new Date() }]);
  const result = await importReceivableSheet("user", arSheet("August"), "AR 2026.xlsx", new Date(), { overwrite: true });
  expect(result.skipped).toBe(1);
  expect(mocks.update).not.toHaveBeenCalled();
});
