"use client";

import { useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Skeleton } from "@/components/ui/skeleton";

export interface VirtualColumn<T> {
  key: string;
  header: React.ReactNode;
  /** CSS grid column width, e.g. "1fr", "140px", "minmax(120px,1fr)". */
  width: string;
  align?: "left" | "right" | "center";
  cell: (row: T) => React.ReactNode;
}

/**
 * Virtualized table (fixed row height) for long lists — renders only the
 * visible window (~20 rows) instead of the full array. Header stays sticky.
 * Use for 100+ row lists; keep plain shadcn Table for short ones.
 */
export function VirtualTable<T>({
  rows,
  columns,
  rowHeight = 44,
  height = 560,
  emptyText = "No matches - try another search.",
  isLoading = false,
  keyOf,
}: {
  rows: T[];
  columns: Array<VirtualColumn<T>>;
  rowHeight?: number;
  height?: number;
  emptyText?: string;
  isLoading?: boolean;
  keyOf: (row: T, index: number) => string | number;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  // NOTE: React Compiler skips memoizing useVirtualizer output by design
  // (incompatible-library bailout, per TanStack docs) — benign warning.
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => rowHeight,
    overscan: 8,
    scrollMargin: 36,
    useFlushSync: false,
  });
  const template = columns.map((c) => c.width).join(" ");
  const alignClass = (a?: "left" | "right" | "center") =>
    a === "right" ? "justify-end text-right" : a === "center" ? "justify-center text-center" : "justify-start text-left";

  return (
    <div ref={scrollRef} className="max-w-full overflow-auto" style={{ height: height + 36 }}>
      {/* One viewport owns both axes, including space used by native scrollbars.
          The shared grid also grows to fit the minimum widths of all columns. */}
      <div
        className="grid gap-x-2 px-2"
        style={{ gridTemplateColumns: template, width: "max-content", minWidth: "max(720px, 100%)" }}
      >
        <div
          className="sticky top-0 z-10 col-span-full grid grid-cols-subgrid items-center gap-2 bg-card text-[10px] font-extrabold uppercase tracking-wider text-muted-foreground"
          style={{ height: 36 }}
        >
          {columns.map((c) => (
            <div key={c.key} className={`flex ${alignClass(c.align)}`}>{c.header}</div>
          ))}
        </div>
        <div className="col-span-full min-w-0 border-t border-border" style={{ minHeight: height }}>
          {isLoading ? (
            <div className="flex flex-col">
              {Array.from({ length: Math.min(10, Math.max(3, Math.floor(height / rowHeight))) }).map((_, idx) => (
                <div
                  key={`skeleton-row-${idx}`}
                  className="grid w-full items-center gap-2 border-b border-border/40"
                  style={{ gridTemplateColumns: template, height: rowHeight }}
                >
                  {columns.map((c) => (
                    <div key={c.key} className={`flex items-center ${alignClass(c.align)}`}>
                      <Skeleton className="h-4 w-3/4 max-w-[80%]" />
                    </div>
                  ))}
                </div>
              ))}
            </div>
          ) : rows.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">{emptyText}</p>
          ) : (
            <div className="relative w-full" style={{ height: virtualizer.getTotalSize() }}>
              {virtualizer.getVirtualItems().map((v) => {
                const row = rows[v.index];
                return (
                  <div
                    key={keyOf(row, v.index)}
                    className="absolute left-0 top-0 grid w-full items-center gap-2 border-b border-border/50 transition hover:bg-muted/30"
                    style={{
                      gridTemplateColumns: template,
                      height: rowHeight,
                      transform: `translateY(${v.start - virtualizer.options.scrollMargin}px)`,
                    }}
                  >
                    {columns.map((c) => (
                      <div key={c.key} className={`flex min-w-0 items-center ${alignClass(c.align)} text-sm`}>
                        {c.cell(row)}
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
