"use client";

import { useState } from "react";
import Link from "next/link";
import { useDateFilter, type PeriodMode } from "@/hooks/use-date-filter";
import { usePlanningInsights } from "@/hooks/use-planning";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";
import {
  AlertTriangle,
  ArrowRight,
  Banknote,
  BrainCircuit,
  CalendarDays,
  CheckCircle2,
  CircleDollarSign,
  Inbox,
  RefreshCw,
  TrendingDown,
  TrendingUp,
  UsersRound,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

function formatAmount(value: number) {
  return `${Math.round(value / 100_000) * 100_000}`.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

function impactBadgeClass(impact: "high" | "medium" | "low") {
  if (impact === "high") {
    return "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-300 font-semibold";
  }
  if (impact === "medium") {
    return "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-300 font-semibold";
  }
  return "border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-900/60 dark:bg-sky-950/40 dark:text-sky-300 font-semibold";
}

function PlanningEmptyState({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-slate-300 bg-slate-50/60 px-6 py-10 text-center dark:border-slate-700 dark:bg-slate-900/40">
      <span className="flex h-11 w-11 items-center justify-center rounded-full bg-slate-200/70 text-slate-500 dark:bg-slate-800 dark:text-slate-400">
        <Inbox className="h-5 w-5" />
      </span>
      <div>
        <p className="text-sm font-bold text-foreground">{title}</p>
        <p className="mx-auto mt-1.5 max-w-md text-xs leading-relaxed text-muted-foreground">
          {description}
        </p>
      </div>
      <Link
        href="/pharmacy/import"
        className="inline-flex items-center gap-1 text-xs font-semibold text-violet-600 hover:text-violet-700 dark:text-violet-400 dark:hover:text-violet-300"
      >
        <span>Go to Pharmacy Import</span>
        <ArrowRight className="h-3.5 w-3.5" />
      </Link>
    </div>
  );
}

export default function PlanningPage() {
  const {
    month, day, year, customFrom, customTo, dateFrom, dateTo,
    localPeriod, localMonth, localYear, setLocalPeriod, setLocalMonth, setLocalYear, updatePeriod, years,
  } = useDateFilter("planning_filter");

  // Set requested to true by default so insights auto-load on initial view
  const [requested, setRequested] = useState(true);

  // When period === "overall", dateFrom & dateTo are empty strings, fetching all-time data
  const { data, isFetching, isError, refetch } = usePlanningInsights(
    { dateFrom: localPeriod === "overall" ? undefined : dateFrom, dateTo: localPeriod === "overall" ? undefined : dateTo },
    requested
  );

  const selectPeriod = (value: string | null) => {
    if (value && ["overall", "day", "month", "year", "custom"].includes(value)) {
      setLocalPeriod(value as PeriodMode);
      updatePeriod({ period: value as PeriodMode });
    }
  };

  const analyze = () => {
    if (requested) void refetch();
    else setRequested(true);
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Top Header & Controls Bar */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between border-b border-border/60 pb-6">
        <div>
          <h1 className="font-heading text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
            Brainstorm &amp; Planning
          </h1>
          <p className="mt-1 text-xs text-muted-foreground sm:text-sm">
            Turn current approved operations into future scenarios, priorities, and a focused plan.
          </p>
        </div>

        {/* Date Filter & Action */}
        <div className="flex w-full flex-wrap items-center gap-2 rounded-xl border border-slate-200/80 bg-white/80 p-2 shadow-sm backdrop-blur-sm dark:border-slate-800 dark:bg-slate-900/80 lg:w-auto">
          <Select value={localPeriod} onValueChange={selectPeriod}>
            <SelectTrigger className="h-9 w-36 rounded-lg border border-slate-200 bg-background text-xs font-semibold text-slate-800 shadow-sm hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800">
              {localPeriod === "overall"
                ? "Overall"
                : localPeriod === "year"
                ? "Yearly"
                : localPeriod === "day"
                ? "Daily"
                : localPeriod === "custom"
                ? "Custom range"
                : "Monthly"}
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="overall">Overall</SelectItem>
              <SelectItem value="month">Monthly</SelectItem>
              <SelectItem value="year">Yearly</SelectItem>
              <SelectItem value="day">Daily</SelectItem>
              <SelectItem value="custom">Custom range</SelectItem>
            </SelectContent>
          </Select>

          {localPeriod === "custom" ? (
            <div className="flex items-center gap-1.5">
              <Input
                type="date"
                value={customFrom}
                onChange={(e) => updatePeriod({ customFrom: e.target.value })}
                className="h-9 w-36 rounded-lg border-slate-200 bg-background text-xs font-medium dark:border-slate-700"
                aria-label="Start date"
              />
              <span className="text-xs text-muted-foreground">to</span>
              <Input
                type="date"
                value={customTo}
                min={customFrom}
                onChange={(e) => updatePeriod({ customTo: e.target.value })}
                className="h-9 w-36 rounded-lg border-slate-200 bg-background text-xs font-medium dark:border-slate-700"
                aria-label="End date"
              />
            </div>
          ) : localPeriod === "day" ? (
            <Input
              type="date"
              value={`${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`}
              onChange={(e) => {
                const next = new Date(`${e.target.value}T00:00:00`);
                if (!Number.isNaN(next.getTime())) {
                  updatePeriod({ year: next.getFullYear(), month: next.getMonth() + 1, day: next.getDate() });
                }
              }}
              className="h-9 w-36 rounded-lg border-slate-200 bg-background text-xs font-medium dark:border-slate-700"
              aria-label="Select day"
            />
          ) : localPeriod === "month" ? (
            <Select
              value={localMonth}
              onValueChange={(val) => {
                if (val) {
                  setLocalMonth(val);
                  updatePeriod({ month: Number(val) });
                }
              }}
            >
              <SelectTrigger className="h-9 w-32 rounded-lg border border-slate-200 bg-background text-xs font-semibold text-slate-800 shadow-sm hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800">
                {new Date(Number(localYear), Number(localMonth) - 1, 1).toLocaleString("en", { month: "long" })}
              </SelectTrigger>
              <SelectContent>
                {Array.from({ length: 12 }).map((_, index) => (
                  <SelectItem key={index} value={String(index + 1)}>
                    {new Date(Number(localYear), index, 1).toLocaleString("en", { month: "long" })}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : null}

          {localPeriod !== "day" && localPeriod !== "custom" && localPeriod !== "overall" && (
            <Select
              value={localYear}
              onValueChange={(val) => {
                if (val) {
                  setLocalYear(val);
                  updatePeriod({ year: Number(val) });
                }
              }}
            >
              <SelectTrigger className="h-9 w-24 rounded-lg border border-slate-200 bg-background text-xs font-semibold text-slate-800 shadow-sm hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800">
                {localYear}
              </SelectTrigger>
              <SelectContent>
                {years.map((y) => (
                  <SelectItem key={y} value={String(y)}>
                    {y}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          <Button
            onClick={analyze}
            disabled={isFetching}
            className="h-9 gap-1.5 rounded-lg bg-violet-600 px-4 text-xs font-semibold text-white shadow-md transition-all hover:bg-violet-700 active:scale-95"
          >
            {isFetching ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <BrainCircuit className="h-3.5 w-3.5" />}
            Refresh analysis
          </Button>
        </div>
      </div>

      {/* Banner Intro Card */}
      <Card className="overflow-hidden border-violet-200/80 bg-gradient-to-r from-violet-600/10 via-sky-500/5 to-transparent shadow-sm dark:border-violet-900/50">
        <CardContent className="flex flex-col gap-4 p-5 md:flex-row md:items-center md:justify-between">
          <div className="flex max-w-3xl items-start gap-3.5">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-violet-600 text-white shadow-md shadow-violet-600/30">
              <BrainCircuit className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-foreground">Smart Operational Intelligence</h2>
              <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                Synthesizing approved sales, inventory, financial, and pipeline data into forward-looking scenarios and Burmese-language priority plans.
              </p>
            </div>
          </div>

        </CardContent>
      </Card>

      {/* Skeleton Loading State */}
      {isFetching && (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, index) => (
              <Skeleton key={index} className="h-28 rounded-xl" />
            ))}
          </div>
          <div className="grid gap-6 lg:grid-cols-5">
            <Skeleton className="h-80 rounded-xl lg:col-span-3" />
            <Skeleton className="h-80 rounded-xl lg:col-span-2" />
          </div>
        </div>
      )}

      {/* Error State */}
      {isError && !isFetching && (
        <Card className="border-rose-200 bg-rose-50/50 dark:border-rose-900/50 dark:bg-rose-950/20">
          <CardContent className="flex items-center gap-3 p-6 text-xs text-rose-700 dark:text-rose-300">
            <AlertTriangle className="h-5 w-5 shrink-0" />
            <p>Could not load the planning analysis. Please check your data connection and click Refresh analysis.</p>
          </CardContent>
        </Card>
      )}

      {/* Main Content */}
      {data && !isFetching && (
        <>
          {/* Top 4 KPI Metrics */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <MetricCard
              icon={Banknote}
              label="Selected Revenue"
              value={`${formatAmount(data.snapshot.revenue)} MMK`}
              detail={localPeriod === "overall" ? "All-Time cumulative" : `${data.snapshot.periodDays}-day window`}
              tone="sky"
            />
            <MetricCard
              icon={CircleDollarSign}
              label="Projected 30-Day Profit"
              value={`${formatAmount(data.snapshot.projectedProfit30)} MMK`}
              detail={`Base case • ${data.snapshot.margin}% current margin`}
              tone={data.snapshot.projectedProfit30 >= 0 ? "emerald" : "rose"}
            />
            <MetricCard
              icon={UsersRound}
              label="Open Pipeline"
              value={`${data.snapshot.pendingDeals}`}
              detail={`${data.snapshot.highPriorityLeads} high-priority lead(s)`}
              tone="amber"

            />
            <MetricCard
              icon={AlertTriangle}
              label="Stock & Cash Risks"
              value={`${data.snapshot.lowStockCount}`}
              detail={
                data.snapshot.lowStockTop
                  ? `${data.snapshot.lowStockTop} needs restock`
                  : `${formatAmount(data.snapshot.receivables)} MMK receivables`
              }
              tone="violet"

            />
          </div>

          {/* Main Grid: Outlook + Priorities */}
          <div className="grid gap-6 lg:grid-cols-5">
            {/* Left 3 Columns: Outlook & Scenarios */}
            <Card className="shadow-sm lg:col-span-3">
              <CardHeader className="border-b border-border/40 pb-4">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-base font-bold">Future Condition Outlook</CardTitle>
                    <CardDescription className="text-xs">
                      {data.source === "ai"
                        ? "Generated from current operational snapshot"
                        : "Data-driven fallback model"}
                    </CardDescription>
                  </div>
                  <Badge variant="outline" className="border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-900 dark:bg-violet-950/40 dark:text-violet-300">
                    Next 30 days
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-5">
                {!data.hasData ? (
                  <PlanningEmptyState
                    title="No outlook available for this period"
                    description="There is no operational data in the selected period, so a 30-day projection can't be generated. Import sales, expense, or pipeline records — or switch to a period with activity — to see your future condition outlook."
                  />
                ) : (
                  <>
                {/* Executive Summary Box with Proper Burmese Line Height */}
                <div className="rounded-xl border border-violet-100 bg-violet-50/60 p-4 leading-relaxed dark:border-violet-900/40 dark:bg-violet-950/20">
                  <p className="text-sm font-semibold text-foreground">{data.executiveSummary}</p>
                  <p className="mt-2.5 text-xs text-muted-foreground">{data.futureOutlook}</p>
                </div>

                {/* Scenarios Grid */}
                <div>
                  <h4 className="mb-3 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                    30-Day Scenario Projections
                  </h4>
                  <div className="grid gap-3 sm:grid-cols-3">
                    {data.scenarios.map((sc) => {
                      const isDownside = sc.name === "Downside";
                      const isUpside = sc.name === "Upside";
                      return (
                        <div
                          key={sc.name}
                          className={`flex flex-col justify-between rounded-xl border p-3.5 transition-all ${
                            isDownside
                              ? "border-rose-200 bg-rose-50/50 dark:border-rose-900/40 dark:bg-rose-950/20"
                              : isUpside
                              ? "border-emerald-200 bg-emerald-50/50 dark:border-emerald-900/40 dark:bg-emerald-950/20"
                              : "border-slate-200 bg-slate-50/60 dark:border-slate-800 dark:bg-slate-900/40"
                          }`}
                        >
                          <div>
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-bold text-foreground">{sc.name}</span>
                              {isDownside ? (
                                <TrendingDown className="h-4 w-4 text-rose-500" />
                              ) : (
                                <TrendingUp className="h-4 w-4 text-emerald-500" />
                              )}
                            </div>
                            <p className="mt-2 text-base font-bold text-foreground">
                              {formatAmount(sc.profit)} <span className="text-xs font-normal text-muted-foreground">MMK</span>
                            </p>
                          </div>
                          <p className="mt-2 text-[11px] leading-snug text-muted-foreground">
                            {sc.description}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                </div>
                  </>
                )}
              </CardContent>
            </Card>

            {/* Right 2 Columns: Decision Priorities */}
            <Card className="shadow-sm lg:col-span-2">
              <CardHeader className="border-b border-border/40 pb-4">
                <CardTitle className="text-base font-bold">Decision Priorities</CardTitle>
                <CardDescription className="text-xs">Highest-leverage operational actions</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3.5">
                {!data.hasData || data.priorities.length === 0 ? (
                  <PlanningEmptyState
                    title="No decision priorities yet"
                    description="Priorities are generated from receivables, stock levels, open deals, and margins. This period has no signals to act on — add operational data or review another period."
                  />
                ) : (
                  data.priorities.map((item, idx) => (
                  <div
                    key={`${item.title}-${idx}`}
                    className="group rounded-xl border border-border/80 bg-background p-4 shadow-2xs transition-all hover:border-violet-300 dark:hover:border-violet-800"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="text-xs font-bold leading-snug text-foreground">{item.title}</h3>
                      <Badge className={impactBadgeClass(item.impact)} variant="outline">
                        {item.impact}
                      </Badge>
                    </div>
                    <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{item.rationale}</p>

                    {/* Native Next.js Link instead of Button primitive with render prop to avoid warnings */}
                    <Link
                      href={item.actionHref}
                      className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-violet-600 hover:text-violet-700 dark:text-violet-400 dark:hover:text-violet-300 group-hover:translate-x-0.5 transition-all"
                    >
                      <span>{item.action}</span>
                      <ArrowRight className="h-3.5 w-3.5" />
                    </Link>
                  </div>
                ))
                )}
              </CardContent>
            </Card>
          </div>

          {/* 90-Day Execution Plan */}
          <Card className="shadow-sm">
            <CardHeader className="border-b border-border/40 pb-4">
              <div className="flex items-center gap-2">
                <CalendarDays className="h-5 w-5 text-violet-600 dark:text-violet-400" />
                <div>
                  <CardTitle className="text-base font-bold">90-Day Execution Plan</CardTitle>
                  <CardDescription className="text-xs">
                    Structured roadmap based on operational velocity
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {!data.hasData || data.plan.length === 0 ? (
                <PlanningEmptyState
                  title="No execution plan for this period"
                  description="The 90-day roadmap is built from your current operational velocity. Once this period has sales, pipeline, or expense activity, your staged plan will appear here."
                />
              ) : (
              <div className="grid gap-4 md:grid-cols-3">
                {data.plan.map((step, idx) => (
                  <div
                    key={step.horizon}
                    className="relative flex flex-col justify-between rounded-xl border border-border bg-card p-4.5 shadow-2xs"
                  >
                    <div>
                      <div className="flex items-center justify-between">
                        <Badge
                          variant="outline"
                          className="border-violet-200 bg-violet-50 text-[11px] font-bold text-violet-700 dark:border-violet-900 dark:bg-violet-950/40 dark:text-violet-300"
                        >
                          Stage {idx + 1} • {step.horizon}
                        </Badge>
                      </div>
                      <h3 className="mt-3 text-sm font-bold text-foreground">{step.goal}</h3>
                      <ul className="mt-3 space-y-2.5">
                        {step.actions.map((act, actIdx) => (
                          <li key={actIdx} className="flex items-start gap-2 text-xs leading-relaxed text-muted-foreground">
                            <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-500" />
                            <span>{act}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                ))}
              </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

function MetricCard({
  icon: Icon,
  label,
  value,
  detail,
  tone,
  valueClassName,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  detail: string;
  tone: "sky" | "emerald" | "amber" | "rose" | "violet";
  valueClassName?: string;
}) {
  const tones = {
    sky: "bg-sky-50 text-sky-600 dark:bg-sky-950/40 dark:text-sky-300",
    emerald: "bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-300",
    amber: "bg-amber-50 text-amber-600 dark:bg-amber-950/40 dark:text-amber-300",
    rose: "bg-rose-50 text-rose-600 dark:bg-rose-950/40 dark:text-rose-300",
    violet: "bg-violet-50 text-violet-600 dark:bg-violet-950/40 dark:text-violet-300",
  };

  return (
    <Card className="shadow-sm">
      <CardContent className="p-4.5">
        <div className="flex items-start justify-between">
          <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">{label}</p>
          <span className={`flex h-8 w-8 items-center justify-center rounded-lg ${tones[tone]}`}>
            <Icon className="h-4 w-4" />
          </span>
        </div>
        <p className={cn("mt-3 min-h-10 text-xl font-bold tabular-nums tracking-tight text-foreground", valueClassName)}>{value}</p>
        <p className="mt-1.5 text-[11px] text-muted-foreground">{detail}</p>
      </CardContent>
    </Card>
  );
}
