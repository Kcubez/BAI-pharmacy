export type PageRequest = { page: number; limit: number };

/** Parses bounded, one-based API pagination without allowing NaN/Infinity. */
export function parsePageRequest(
  params: URLSearchParams,
  { defaultLimit = 20, maxLimit = 100 }: { defaultLimit?: number; maxLimit?: number } = {},
): PageRequest {
  const read = (key: string, fallback: number) => {
    const value = Number.parseInt(params.get(key) ?? "", 10);
    return Number.isSafeInteger(value) && value > 0 ? value : fallback;
  };

  return {
    page: read("page", 1),
    limit: Math.min(maxLimit, read("limit", defaultLimit)),
  };
}
