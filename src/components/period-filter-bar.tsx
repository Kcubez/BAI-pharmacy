"use client";

import type { ReactNode } from "react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";
import { useDateFilter } from "@/hooks/use-date-filter";

export type DateFilter = ReturnType<typeof useDateFilter>;

/** Commerce-style period filter bar (period Select + month/year/day/custom
 *  inputs). `action` renders in the trailing slot (e.g. Set Targets button). */
export function PeriodFilterBar({ filter, action, isLoading = false }: { filter: DateFilter; action?: ReactNode; isLoading?: boolean }) {
  const { period, month, year, day, customFrom, customTo, updatePeriod, years, isPending, isReady } = filter;
  const busy = !isReady || isPending || isLoading;
  return (
    <fieldset disabled={busy} aria-busy={busy} className="relative flex min-w-0 flex-wrap items-center gap-2 border-0 p-0 disabled:cursor-wait">
      <Select
        value={period}
        disabled={busy}
        onValueChange={(value) => {
          if (value === 'overall' || value === 'day' || value === 'month' || value === 'year' || value === 'custom') {
            updatePeriod({ period: value });
          }
        }}
      >
          <SelectTrigger className="h-9 w-36 rounded-lg border-border bg-background px-3 text-[0.8rem] font-medium transition-colors hover:bg-muted data-[size=default]:h-9">
          {period === 'overall' ? 'Overall' : period === 'year' ? 'Yearly' : period === 'day' ? 'Daily' : period === 'custom' ? 'Custom range' : 'Monthly'}
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="overall">Overall</SelectItem>
          <SelectItem value="day">Daily</SelectItem>
          <SelectItem value="month">Monthly</SelectItem>
          <SelectItem value="year">Yearly</SelectItem>
          <SelectItem value="custom">Custom range</SelectItem>
        </SelectContent>
      </Select>
      {period === 'custom' ? (
        <div className="flex items-center gap-1.5">
          <Input disabled={busy} type="date" value={customFrom} onChange={(event) => updatePeriod({ customFrom: event.target.value })} className="h-9 w-40 rounded-lg border-border bg-background px-3 text-[0.8rem] font-medium" aria-label="Start date" />
          <span className="px-1 text-xs font-medium text-muted-foreground">to</span>
          <Input disabled={busy} type="date" value={customTo} min={customFrom} onChange={(event) => updatePeriod({ customTo: event.target.value })} className="h-9 w-40 rounded-lg border-border bg-background px-3 text-[0.8rem] font-medium" aria-label="End date" />
        </div>
      ) : period === 'day' ? (
        <Input
          type="date"
          disabled={busy}
          value={`${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`}
          onChange={(event) => {
            const next = new Date(`${event.target.value}T00:00:00`);
            if (!Number.isNaN(next.getTime())) updatePeriod({ year: next.getFullYear(), month: next.getMonth() + 1, day: next.getDate() });
          }}
          className="h-9 w-40 rounded-lg border-border bg-background px-3 text-[0.8rem] font-medium"
          aria-label="Select day"
        />
      ) : period === 'month' ? (
        <Select value={String(month)} disabled={busy} onValueChange={(value) => {
          if (value) updatePeriod({ month: Number(value) });
        }}>
          <SelectTrigger className="h-9 w-32 rounded-lg border-border bg-background px-3 text-[0.8rem] font-medium transition-colors hover:bg-muted data-[size=default]:h-9">
            {new Date(Number(year), Number(month) - 1, 1).toLocaleString('en', { month: 'long' })}
          </SelectTrigger>
          <SelectContent>
            {Array.from({ length: 12 }).map((_, index) => (
              <SelectItem key={index + 1} value={String(index + 1)}>
                {new Date(Number(year), index, 1).toLocaleString('en', { month: 'long' })}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : null}
      {period !== 'day' && period !== 'overall' && period !== 'custom' && (
        <Select value={String(year)} disabled={busy} onValueChange={(value) => {
          if (value) updatePeriod({ year: Number(value) });
        }}>
          <SelectTrigger className="h-9 w-24 rounded-lg border-border bg-background px-3 text-[0.8rem] font-medium transition-colors hover:bg-muted data-[size=default]:h-9">
            {year}
          </SelectTrigger>
          <SelectContent>
            {years.map((itemYear) => (
              <SelectItem key={itemYear} value={String(itemYear)}>
                {itemYear}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
      {action}
    </fieldset>
  );
}

/** Convert a date filter to the period key consumed by pharma query hooks
 *  ("overall" | "YYYY-MM" | "YYYY" | "YYYY-MM-DD" | "custom:from:to"). */
export function filterToPeriodKey(f: DateFilter): string {
  if (f.period === "overall") return "overall";
  if (f.period === "custom") return `custom:${f.customFrom}:${f.customTo}`;
  if (f.period === "day") {
    return `${f.year}-${String(f.month).padStart(2, "0")}-${String(f.day).padStart(2, "0")}`;
  }
  if (f.period === "year") return `${f.year}`;
  return `${f.year}-${String(f.month).padStart(2, "0")}`;
}
