'use client';

// Extracted from product-sales-workspace.tsx (export-only move — zero visual change).
// KPI cards + AI suggestion panels shared by commerce + pharmacy workspaces.

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AlertTriangle, Award, Bot, ChevronDown, ChevronUp } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import type { CommerceActionRecommendation } from '@/lib/api';

import { useCountUp } from "@/hooks/use-count-up";
import { convertBurmeseDigits } from '@/lib/text-normalize';

// Values can include grouping separators, units, percentages, or compact suffixes.
// Check the final metric, not the count-up animation's initial zero.
function hasNonZeroKpiValue(value: string): boolean {
  return /[1-9]/.test(convertBurmeseDigits(value));
}

export type CardTone = 'emerald' | 'red' | 'sky' | 'amber' | 'slate';

/** Accent palette for service-style KPI cards (left border + tinted icon). */
export interface CardAccent {
  border: string;
  iconBg: string;
  iconText: string;
  fill: string;
}

export const CARD_ACCENTS: Record<string, CardAccent> = {
  sky: { border: 'border-l-sky-500', iconBg: 'bg-sky-50 dark:bg-sky-900/30', iconText: 'text-sky-500', fill: 'bg-sky-500' },
  red: { border: 'border-l-red-500', iconBg: 'bg-red-50 dark:bg-red-900/30', iconText: 'text-red-500', fill: 'bg-red-500' },
  emerald: { border: 'border-l-emerald-500', iconBg: 'bg-emerald-50 dark:bg-emerald-900/30', iconText: 'text-emerald-500', fill: 'bg-emerald-500' },
  amber: { border: 'border-l-amber-500', iconBg: 'bg-amber-50 dark:bg-amber-900/30', iconText: 'text-amber-500', fill: 'bg-amber-500' },
  cyan: { border: 'border-l-cyan-500', iconBg: 'bg-cyan-50 dark:bg-cyan-900/30', iconText: 'text-cyan-500', fill: 'bg-cyan-500' },
  violet: { border: 'border-l-violet-500', iconBg: 'bg-violet-50 dark:bg-violet-900/30', iconText: 'text-violet-500', fill: 'bg-violet-500' },
  indigo: { border: 'border-l-indigo-500', iconBg: 'bg-indigo-50 dark:bg-indigo-900/30', iconText: 'text-indigo-500', fill: 'bg-indigo-500' },
  orange: { border: 'border-l-orange-500', iconBg: 'bg-orange-50 dark:bg-orange-900/30', iconText: 'text-orange-500', fill: 'bg-orange-500' },
  slate: { border: 'border-l-slate-300 dark:border-l-slate-700', iconBg: 'bg-slate-100 dark:bg-slate-800', iconText: 'text-slate-400', fill: 'bg-slate-300' },
};

/**
 * Service-style KPI card (BAI service Business Overview look): colored left
 * accent border, tinted icon circle top-right, big value + gray target,
 * slim progress bar with end tick, expected left + status right.
 */
export function ServiceKpiCard({
  title,
  value,
  target,
  expected,
  status,
  statusTone,
  icon: Icon,
  progressPercent,
  markerPercent = 100,
  emptyState,
  accent,
}: {
  title: string;
  value: string;
  target: string;
  expected: string;
  status: string;
  statusTone: 'good' | 'bad' | 'muted';
  icon: LucideIcon;
  progressPercent?: number;
  markerPercent?: number;
  emptyState?: { asOf: string; description: string; href: string; actionLabel: string };
  accent: CardAccent;
}) {
  const progress = Number.isFinite(progressPercent) ? Math.max(0, Math.min(100, progressPercent ?? 0)) : 0;
  // Count-up for pure numeric values ("2,268,169,348", "-1,020"); static otherwise.
  const numeric = /^[−\d,.\s-]+$/.test(value) ? Number(value.replace(/[^0-9.-]/g, "")) : NaN;
  const animated = useCountUp(Number.isFinite(numeric) ? numeric : 0);
  const display = Number.isFinite(numeric) ? Math.round(animated).toLocaleString() : value;
  const statusClass =
    statusTone === 'good'
      ? 'text-emerald-600 dark:text-emerald-400'
      : statusTone === 'bad'
        ? 'text-red-600 dark:text-red-400'
        : 'text-slate-500 dark:text-slate-400';
  const hasTarget = target.trim().length > 0 && !/^(No target|No limit|—)$/i.test(target.trim());
  const hasProgressTarget = hasTarget && Number.isFinite(progressPercent);
  const progressFill = hasProgressTarget && hasNonZeroKpiValue(value) ? progress : 0;
  // Uniform size on every card — length-based scaling made "0" look
  // giant next to smaller long numbers. text-2xl fits 13-digit MMK.
  const valueSize = 'text-2xl';
  const targetSize = 'text-xs';
  return (
    <section className={`rounded-xl border border-border border-l-4 ${accent.border} bg-card p-5 shadow-[0_1px_2px_rgb(15_23_42/0.04)] transition-[box-shadow,border-color] duration-200 hover:shadow-md`}>
      <div className="flex items-start justify-between gap-3">
        <p className="text-[11px] font-semibold tracking-[0.01em] text-muted-foreground">{title}</p>
        <div className={`flex size-9 shrink-0 items-center justify-center rounded-lg ${accent.iconBg}`}>
          <Icon className={`size-4 ${accent.iconText}`} aria-hidden="true" />
        </div>
      </div>
      {emptyState ? (
        <div className="mt-3 flex min-h-32 flex-col items-start">
          <p className="text-xs text-muted-foreground">As of {emptyState.asOf}</p>
          <p className="mt-2 text-lg font-semibold leading-snug text-foreground">Payment history needed</p>
          <p className="mt-2 text-xs leading-5 text-muted-foreground">{emptyState.description}</p>
          <Link href={emptyState.href} className="mt-auto inline-flex min-h-9 items-center pt-2 text-xs font-semibold text-primary underline-offset-4 hover:underline focus-visible:rounded focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
            {emptyState.actionLabel} →
          </Link>
        </div>
      ) : (
        <>
      <p className={`${valueSize} mt-3 break-words leading-tight font-bold tracking-[-0.025em] text-foreground tabular-nums`}>
        {display}
        {hasTarget && <span className={`${targetSize} ml-1 font-medium text-muted-foreground whitespace-nowrap`}>/ {target}</span>}
      </p>
      <div role="progressbar" aria-label={`${title} progress`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={progressFill} aria-valuetext={hasProgressTarget ? `${progressFill}% of target or limit` : "No target set"} className="relative mt-4 h-1.5 w-full overflow-visible rounded-full bg-muted">
        <div className={`h-full rounded-full ${accent.fill}`} style={{ width: `${progressFill}%` }} />
        {hasProgressTarget && <span className="absolute top-[-3px] bottom-[-3px] w-px rounded bg-foreground/70" style={{ left: `${Number.isFinite(markerPercent) ? Math.max(0, Math.min(100, markerPercent)) : 0}%` }} />}
      </div>
      <div className="mt-3 flex min-h-10 items-start justify-between gap-3 text-xs leading-5">
        <span className="min-w-0 whitespace-pre-line break-words text-muted-foreground">{expected}</span>
        <span className={`${statusClass} shrink-0 whitespace-nowrap`}>{status}</span>
      </div>
        </>
      )}
    </section>
  );
}

export function ProgressCard({
  title,
  value,
  target,
  expected,
  status,
  tone,
  icon: Icon,
  progressPercent,
}: {
  title: string;
  value: string;
  target: string;
  expected: string;
  status: string;
  tone: CardTone;
  icon: LucideIcon;
  progressPercent?: number;
}) {
  const colors = {
    emerald: 'bg-emerald-500 text-emerald-600',
    red: 'bg-red-500 text-red-500',
    sky: 'bg-sky-500 text-sky-600',
    amber: 'bg-amber-500 text-amber-600',
    slate: 'bg-slate-400 text-slate-500',
  }[tone];
  const progress = Math.max(0, Math.min(100, progressPercent ?? 0));
  const showProgress = hasNonZeroKpiValue(value) && Number.isFinite(progressPercent) && progress > 0;

  // Uniform size (commerce original text-3xl callers pass short values).
  const valueSize = 'text-3xl';
  return (
    <section className="flex h-48 flex-col justify-between rounded-xl border border-border bg-card p-5 shadow-[0_1px_2px_rgb(15_23_42/0.04)] transition-[box-shadow,border-color] duration-200 hover:shadow-md">
      <div className="flex items-center justify-between">
        <p className="text-[11px] font-semibold tracking-[0.01em] text-muted-foreground">{title}</p>
        <div className="flex size-8 items-center justify-center rounded-lg bg-muted text-muted-foreground">
          <Icon className="size-4" aria-hidden="true" />
        </div>
      </div>
      <div>
        <p className={`${valueSize} break-words leading-tight font-bold tracking-[-0.025em] text-foreground`}>
          {value} <span className="text-sm font-medium text-muted-foreground">/ {target}</span>
        </p>
        {showProgress && <div className="relative mt-5 h-2 w-full overflow-visible rounded-full bg-muted">
          <div className={`h-full rounded-full ${colors.split(' ')[0]}`} style={{ width: `${progress}%` }} />
          <span className="absolute top-[-4px] right-0 bottom-[-4px] w-px rounded bg-foreground/70" />
        </div>}
        <div className="mt-4 flex items-center justify-between gap-3 text-xs">
          <span className="text-muted-foreground">{expected}</span>
          <span className={colors.split(' ')[1]}>{status}</span>
        </div>
      </div>
    </section>
  );
}

const recommendationActionLink: Record<CommerceActionRecommendation['actionType'], string> = {
  view_sales: '/sales',
  view_finance: '/finance',
  view_inventory: '/inventory',
  view_marketing: '/marketing',
  set_target_modal: '',
  general_dashboard: '/pharmacy',
};

export function SmartSuggestions({
  recommendations,
  isLoading,
  onSetTargets,
  areaFilter,
  limit,
}: {
  recommendations?: CommerceActionRecommendation[];
  isLoading: boolean;
  onSetTargets?: () => void;
  areaFilter?: 'sales' | 'marketing' | 'inventory' | 'finance' | 'general';
  limit?: number;
}) {
  const router = useRouter();
  const [visible, setVisible] = useState(true);
  
  const filtered = areaFilter && areaFilter !== 'general'
    ? (recommendations?.filter((rec) => rec.area === areaFilter || (areaFilter === 'sales' && rec.area === 'general')) ?? [])
    : (recommendations ?? []);

  const maxCount = limit ?? (areaFilter === 'general' || !areaFilter ? 4 : 2);
  const displayRecs = filtered.slice(0, maxCount);

  if (!isLoading && displayRecs.length === 0) return null;

  return (
    <section className="overflow-hidden rounded-xl border-2 border-sky-200 bg-sky-50/30 shadow-sm dark:border-sky-900/60 dark:bg-sky-950/15">
      <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="flex items-center gap-2 text-sm font-bold text-foreground">
            <Bot className="h-4 w-4 text-sky-600" />
            Smart Suggestions
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">ဒီကာလအတွက် အဓိကဆောင်ရွက်ရန် လိုအပ်ချက်များကို တွက်ချက်ဖော်ပြထားပါသည်။</p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setVisible((open) => !open)}
          className="shrink-0 border-border bg-card text-foreground hover:bg-muted/50"
        >
          {visible ? 'Hide suggestions' : 'View suggestions'}
          {visible ? <ChevronUp className="ml-1.5 h-4 w-4" /> : <ChevronDown className="ml-1.5 h-4 w-4" />}
        </Button>
      </div>
      {visible && (
        <div className="grid grid-cols-1 gap-4 border-t border-sky-200 p-5 md:grid-cols-2 dark:border-sky-900/60">
          {isLoading ? (
            <>
              {[0, 1].map((idx) => (
                <div key={idx} className="bg-card border-2 border-border/80 rounded-xl p-5 flex flex-col justify-between shadow-xs">
                  <div className="flex flex-col gap-2.5">
                    <div className="flex items-center gap-3">
                      <Skeleton className="size-5 rounded-full" />
                      <Skeleton className="h-4 w-40" />
                    </div>
                    <Skeleton className="h-3.5 w-full" />
                    <Skeleton className="h-3.5 w-4/5" />
                  </div>
                  <div className="mt-4 flex justify-start">
                    <Skeleton className="h-7 w-28 rounded-lg" />
                  </div>
                </div>
              ))}
            </>
          ) : (
            displayRecs.map((rec, index) => {
              const isAlert = rec.severity === 'urgent' || rec.severity === 'warning';
              const borderColor = isAlert ? 'border-amber-300 dark:border-amber-900/60' : 'border-emerald-300 dark:border-emerald-900/60';
              const borderLeftColor = isAlert ? 'border-l-amber-500' : 'border-l-emerald-500';
              const iconColor = isAlert ? 'text-amber-600 dark:text-amber-400' : 'text-emerald-600 dark:text-emerald-400';
              const Icon = isAlert ? AlertTriangle : Award;
              return (
                <div key={`${rec.actionType}-${index}`} className={`bg-card border-2 ${borderColor} border-l-8 ${borderLeftColor} rounded-xl p-5 flex flex-col justify-between shadow-sm`}>
                  <div>
                    <div className="flex items-center gap-3 mb-2">
                      <Icon className={`${iconColor} w-5 h-5 flex-shrink-0`} />
                      <h4 className="font-bold text-foreground text-sm">{rec.title}</h4>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{rec.insight}</p>
                  </div>
                  {rec.action && (
                    <div className="mt-3.5 flex justify-start">
                      <button
                        onClick={() => {
                          if (rec.actionType === 'set_target_modal' && onSetTargets) onSetTargets();
                          else if (recommendationActionLink[rec.actionType]) router.push(recommendationActionLink[rec.actionType]);
                        }}
                        className={`${
                          isAlert
                            ? 'bg-amber-600 hover:bg-amber-700 text-white'
                            : 'bg-emerald-600 hover:bg-emerald-700 text-white'
                        } px-3 py-1.5 rounded-lg text-xs font-bold transition shadow-sm cursor-pointer inline-flex items-center gap-1`}
                      >
                        {rec.action}
                      </button>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}
    </section>
  );
}

export function FinanceKpiCard({ label, value, icon: Icon, accentClass, unit, detail, status = "Tracked" }: { label: string; value: string; icon: LucideIcon; accentClass: string; unit?: string; detail?: string; status?: string }) {
  const numeric = /^[−\d,.\s-]+$/.test(value) ? Number(value.replace(/[^0-9.-]/g, "")) : NaN;
  const animated = useCountUp(Number.isFinite(numeric) ? numeric : 0);
  const display = Number.isFinite(numeric) ? Math.round(animated).toLocaleString() : value;
  const tone = accentClass.includes("red") ? "red" : accentClass.includes("amber") ? "amber" : accentClass.includes("emerald") ? "emerald" : accentClass.includes("violet") ? "violet" : "sky";
  const iconTone = {
    red: "bg-red-50 text-red-500 dark:bg-red-900/30",
    amber: "bg-amber-50 text-amber-500 dark:bg-amber-900/30",
    emerald: "bg-emerald-50 text-emerald-500 dark:bg-emerald-900/30",
    violet: "bg-violet-50 text-violet-500 dark:bg-violet-900/30",
    sky: "bg-sky-50 text-sky-500 dark:bg-sky-900/30",
  }[tone];
  const statusTone = {
    red: "text-red-600 dark:text-red-400",
    amber: "text-amber-600 dark:text-amber-400",
    emerald: "text-emerald-600 dark:text-emerald-400",
    violet: "text-violet-600 dark:text-violet-400",
    sky: "text-sky-600 dark:text-sky-400",
  }[tone];
  return (
    <section className={`rounded-xl border border-border border-l-4 bg-card p-5 shadow-[0_1px_2px_rgb(15_23_42/0.04)] transition-[box-shadow,border-color] duration-200 hover:shadow-md ${accentClass}`}>
      <div className="flex items-start justify-between gap-3">
        <p className="text-[11px] font-semibold tracking-[0.01em] text-muted-foreground">{label}</p>
        <div className={`flex size-9 shrink-0 items-center justify-center rounded-lg ${iconTone}`}><Icon className="size-4" aria-hidden="true" /></div>
      </div>
      <h3 className="mt-3 flex min-h-7 items-baseline gap-1.5 break-words text-2xl font-bold tracking-[-0.025em] text-foreground tabular-nums"><span>{display}</span>{unit && <span className="text-xs font-medium text-muted-foreground">{unit}</span>}</h3>
      <div className="mt-4 flex items-center justify-between gap-3 border-t border-border pt-3 text-xs"><span className="truncate text-muted-foreground">{detail ?? "Operational metric"}</span><span className={`shrink-0 ${statusTone}`}>{status}</span></div>
    </section>
  );
}
