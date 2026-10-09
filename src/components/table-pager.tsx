"use client";

import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { ChevronLeft, ChevronRight } from "lucide-react";

/** Shared pager: Prev/Next + page info + rows-per-page. */
export function TablePager({
  page,
  limit,
  total,
  isLoading = false,
  onPage,
  onLimit,
}: {
  page: number;
  limit: number;
  total: number;
  /** Keep the previous rows stable while only the initiated control shows progress. */
  isLoading?: boolean;
  onPage: (page: number) => void;
  onLimit: (limit: number) => void;
}) {
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const from = total === 0 ? 0 : (safePage - 1) * limit + 1;
  const to = Math.min(safePage * limit, total);
  return (
    <div className="flex flex-col gap-3 border-t border-border pt-3 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-sm text-muted-foreground">
        Showing <span className="font-medium text-foreground">{from.toLocaleString()}–{to.toLocaleString()}</span> of <span className="font-medium text-foreground">{total.toLocaleString()}</span>
      </p>
      <div className="flex flex-wrap items-center gap-1.5">
        <Select value={String(limit)} onValueChange={(v) => onLimit(Number(v))} disabled={isLoading}>
          <SelectTrigger className="h-8 w-24 text-xs font-semibold">
            {limit} / page
          </SelectTrigger>
          <SelectContent>
            {[10, 25, 50, 100].map((n) => (
              <SelectItem key={n} value={String(n)}>
                {n} / page
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          size="sm"
          variant="outline"
          disabled={isLoading || safePage <= 1}
          onClick={() => onPage(safePage - 1)}
          aria-label="Previous page"
        >
          {isLoading ? <Spinner data-icon="inline-start" /> : <ChevronLeft />}
        </Button>
        <span className="min-w-16 px-1 text-center text-xs font-medium tabular-nums text-muted-foreground">{safePage} / {totalPages}</span>
        <Button
          size="sm"
          variant="outline"
          disabled={isLoading || safePage >= totalPages}
          onClick={() => onPage(safePage + 1)}
          aria-label="Next page"
        >
          {isLoading ? <Spinner data-icon="inline-end" /> : <ChevronRight />}
        </Button>
      </div>
    </div>
  );
}
