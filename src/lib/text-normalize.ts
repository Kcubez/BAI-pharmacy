/**
 * Shared Myanmar-text + spreadsheet helpers for all parsers.
 * Single source of truth for Burmese-digit conversion — previously
 * copy-pasted (with three spellings) across every parser module.
 */

const BURMESE_DIGIT_MAP: Record<string, string> = {
  "၀": "0",
  "၁": "1",
  "၂": "2",
  "၃": "3",
  "၄": "4",
  "၅": "5",
  "၆": "6",
  "၇": "7",
  "၈": "8",
  "၉": "9",
};

/** Replace Myanmar digits (၀-၉) with ASCII digits. Pure — no other changes. */
export function convertBurmeseDigits(text: string): string {
  return text.replace(/[၀-၉]/g, (d) => BURMESE_DIGIT_MAP[d] || d);
}

/** Normalize a spreadsheet header for fuzzy matching:
 *  Myanmar digits → ASCII, trim, lowercase, `_`/`-` → space, collapse spaces. */
export function normalizeHeaderKey(value: unknown): string {
  return convertBurmeseDigits(String(value ?? ""))
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ");
}

/** Normalize an item/supplier code: uppercase, strip all whitespace. */
export function normalizeCode(value: unknown): string | null {
  const s = convertBurmeseDigits(String(value ?? ""))
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "");
  return s || null;
}

/** Normalize a display name for dedup keys: lowercase, collapse spaces. */
export function normalizeName(value: unknown): string | null {
  const s = convertBurmeseDigits(String(value ?? "")).trim().toLowerCase().replace(/\s+/g, " ");
  return s || null;
}

/** Parse a possibly-formatted number (commas, %, Myanmar digits, currency).
 *  Returns null when unparseable — never NaN, never throws. */
export function toNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const cleaned = convertBurmeseDigits(String(value)).replace(/,/g, "");
  const n = Number(cleaned.replace(/[^\d.-]/g, ""));
  return Number.isFinite(n) ? n : null;
}

/**
 * Parse a rate stored either as a fraction (0.06) or whole percent (6).
 * Sheets in this project store 6% as 0.06 — values are kept as fractions;
 * whole numbers (>1) are converted to fractions so both forms work.
 */
export function toRate(value: unknown): number | null {
  const n = toNumber(value);
  if (n === null) return null;
  return Math.abs(n) > 1 ? n / 100 : n;
}

export type RowAccessor = (...keys: string[]) => unknown;

/** Case/format-insensitive row accessor over a sheet_to_json record.
 *  Usage: `const get = makeRowAccessor(row); get("po number", "po no")`. */
export function makeRowAccessor(row: Record<string, unknown>): RowAccessor {
  const map = new Map<string, unknown>();
  for (const key of Object.keys(row)) {
    map.set(normalizeHeaderKey(key), row[key]);
  }
  return (...keys: string[]) => {
    for (const raw of keys) {
      const value = map.get(normalizeHeaderKey(raw));
      if (value !== undefined && value !== null && value !== "") return value;
    }
    return null;
  };
}
