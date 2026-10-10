"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  ArrowUpRight,
  Award,
  BarChart3,
  Bot,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  DollarSign,
  FileSpreadsheet,
  Package,
  ReceiptText,
  RotateCcw,
  Target,
  Trash2,
  TrendingUp,
  Truck,
  Upload,
  Users,
  Wallet,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { TablePager } from "@/components/table-pager";
import { VirtualTable } from "@/components/virtual-table";
import { parseAsInteger, parseAsString, parseAsStringEnum, useQueryState } from "nuqs";
import { CommerceBarChart, ExpenseBreakdownChart, FinanceTimelineChart } from "@/components/commerce-charts";
import { FinanceKpiCard, ServiceKpiCard, CARD_ACCENTS } from "@/components/commerce-cards";
import { PeriodFilterBar, filterToPeriodKey } from "@/components/period-filter-bar";
import { useDateFilter } from "@/hooks/use-date-filter";
import { useDebounce } from "@/hooks/use-debounce";
import { DestructiveConfirmDialog } from "@/components/ui/destructive-confirm-dialog";
import {
  usePharmacyAr,
  usePharmacyDeleteAll,
  usePharmacyImport,
  usePharmacyInventory,
  usePharmacyOverview,
  usePharmacyPayables,
  usePharmacyRecommendations,
  usePharmacySales,
  usePharmacyTeam,
  useSavePharmacyTargets,
  type PharmaDeleteScope,
  type PharmacyArRow,
  type PharmacyInventoryRow,
  type PharmacyPayableRow,
  type ExpiryRow,
} from "@/hooks/use-pharmacy";

export type PharmacyWorkspaceKind = "overview" | "sales" | "ar" | "inventory" | "payables" | "team" | "import";

function mmk(n: number | null | undefined): string {
  if (n == null) return "—";
  return Math.round(n).toLocaleString();
}


function Loading() {
  return (
    <div className="flex flex-col gap-6" aria-busy="true">
      <div className="grid gap-4 md:grid-cols-3">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <Card key={i} className="gap-3 py-4">
            <CardHeader className="flex flex-row items-center justify-between pb-1">
              <Skeleton className="h-3.5 w-24" />
              <Skeleton className="size-8 rounded-full" />
            </CardHeader>
            <CardContent className="flex flex-col gap-2">
              <Skeleton className="h-7 w-32" />
              <div className="flex items-center gap-2">
                <Skeleton className="h-2 flex-1 rounded-full" />
                <Skeleton className="h-2 w-10 rounded-full" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
      <Card className="p-0">
        <CardHeader className="flex flex-row items-center justify-between border-b border-border/60 pb-3">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-7 w-28 rounded-md" />
        </CardHeader>
        <CardContent className="flex flex-col gap-3 pt-4">
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="flex items-center justify-between gap-4 py-2 border-b border-border/30 last:border-0">
              <Skeleton className="h-4 w-1/4" />
              <Skeleton className="h-4 w-1/5" />
              <Skeleton className="h-4 w-1/6" />
              <Skeleton className="h-5 w-16 rounded-full" />
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

/** Subtle CSS entrance for KPI grids. Pure keyframes (globals.css `.fade-in`)
 *  — no JS runtime needed for visibility, so grids can never get stuck at
 *  opacity 0 the way a motion initial={opacity:0} can. */
function FadeIn({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={`fade-in ${className ?? ""}`}>{children}</div>;
}

function ErrorBox({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <Card className="border-red-200">
      <CardContent className="pt-6 text-sm text-red-600">
        {message}{" "}
        <Button variant="outline" size="sm" className="ml-2" onClick={onRetry}>
          Retry
        </Button>
      </CardContent>
    </Card>
  );
}

function ScopedDeleteButton({ scope, label }: { scope: Exclude<PharmaDeleteScope, "all">; label: string }) {
  const mutation = usePharmacyDeleteAll();
  const [open, setOpen] = useState(false);
  return <>
    <Button
      variant="outline"
      size="lg"
      className="px-3 text-[0.8rem] text-destructive hover:text-destructive"
      onClick={() => setOpen(true)}
    >
      <Trash2 data-icon="inline-start" />Delete {label}
    </Button>
    {open && <DestructiveConfirmDialog
      title={`Delete ${label}?`}
      description={`This removes the ${label.toLowerCase()} source data from reports. It is moved to Trash and can be restored.`}
      confirmLabel={`Delete ${label}`}
      confirmationText="DELETE"
      isPending={mutation.isPending}
      onCancel={() => setOpen(false)}
      onConfirm={() => mutation.mutate(scope, { onSuccess: () => setOpen(false) })}
    />}
  </>;
}

// ─── Overview (CEO) ──────────────────────────────────────────────────────────

export interface PharmaTargetValues {
  targetSalesAmount: number | null;
  targetCollectionAmount: number | null;
  targetExpenseAmount: number | null;
  targetArLimit: number | null;
  targetApLimit: number | null;
}

function PharmaTargetsDialog({
  open,
  onOpenChange,
  anchor,
  initial,
  saving,
  onSave,
  anchorNote,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  anchor: { period: "month" | "year"; year: number; month: number; label: string };
  initial: PharmaTargetValues;
  saving: boolean;
  onSave: (values: PharmaTargetValues) => void;
  anchorNote?: string;
}) {
  const [sales, setSales] = useState("");
  const [collection, setCollection] = useState("");
  const [expense, setExpense] = useState("");
  const [arLimit, setArLimit] = useState("");
  const [apLimit, setApLimit] = useState("");
  const [lastInitial, setLastInitial] = useState<PharmaTargetValues | null>(null);
  // Prefill from saved targets whenever a new anchor/initial loads (blank = clear).
  if (open && lastInitial !== initial) {
    setLastInitial(initial);
    setSales(initial.targetSalesAmount?.toString() ?? "");
    setCollection(initial.targetCollectionAmount?.toString() ?? "");
    setExpense(initial.targetExpenseAmount?.toString() ?? "");
    setArLimit(initial.targetArLimit?.toString() ?? "");
    setApLimit(initial.targetApLimit?.toString() ?? "");
  }
  const num = (v: string) => (v.trim() === "" ? null : Number(v));
  const fields: Array<{ label: string; hint: string; value: string; set: (v: string) => void }> = [
    { label: "Sales target (MMK)", hint: "Monthly sales goal", value: sales, set: setSales },
    { label: "Collection target (MMK)", hint: "Expected AR collection", value: collection, set: setCollection },
    { label: "Purchase limit (MMK)", hint: "Monthly purchase ceiling", value: expense, set: setExpense },
    { label: "AR overdue limit (MMK)", hint: "Overdue above this = Over Limit", value: arLimit, set: setArLimit },
    { label: "AP overdue limit (MMK)", hint: "Overdue above this = Over Limit", value: apLimit, set: setApLimit },
  ];
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Set Targets</DialogTitle>
          <DialogDescription>
            Saved for {anchor.label} · blank clears a target
            {anchorNote && <span className="block mt-1 text-amber-600 dark:text-amber-400">{anchorNote}</span>}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          {fields.map((f) => (
            <div key={f.label}>
              <label className="text-xs font-bold text-slate-600 dark:text-slate-300">
                {f.label} <span className="font-medium text-muted-foreground">— {f.hint}</span>
              </label>
              <Input
                inputMode="numeric"
                placeholder="—"
                value={f.value}
                onChange={(e) => f.set(e.target.value)}
                className="mt-1"
              />
            </div>
          ))}
          <Button
            disabled={saving}
            onClick={() =>
              onSave({
                targetSalesAmount: num(sales),
                targetCollectionAmount: num(collection),
                targetExpenseAmount: num(expense),
                targetArLimit: num(arLimit),
                targetApLimit: num(apLimit),
              })
            }
            className="w-full"
          >
            {saving ? "Saving…" : "Save targets"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function PharmaSuggestions({ periodKey, enabled = true }: { periodKey?: string; enabled?: boolean }) {
  const router = useRouter();
  const [visible, setVisible] = useState(true);
  const rec = usePharmacyRecommendations(periodKey, enabled);
  const items = rec.data?.recommendations ?? [];
  if (!rec.isPending && items.length === 0) return null;
  return (
    <section className="overflow-hidden rounded-xl border border-border bg-card">
      <div className="flex flex-col gap-4 border-b border-border p-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="flex items-center gap-2 text-sm font-bold text-foreground">
            <Bot className="h-4 w-4 text-sky-600" />
            Smart Suggestions
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Key actions for {rec.data?.month ?? "this period"}, calculated automatically. AR/AP/stock signals are as of today.
          </p>
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
        <div className="grid grid-cols-1 gap-3 p-4 md:grid-cols-2">
          {rec.isPending ? (
            <p className="text-xs text-muted-foreground animate-pulse py-2">အကြံပြုချက်များကို တွက်ချက်နေပါသည်…</p>
          ) : (
            items.slice(0, 4).map((r, index) => {
              const isAlert = r.priority === "high" || r.priority === "medium";
              const borderColor = isAlert ? 'border-amber-300 dark:border-amber-900/60' : 'border-emerald-300 dark:border-emerald-900/60';
              const borderLeftColor = isAlert ? 'border-l-amber-500' : 'border-l-emerald-500';
              const iconColor = isAlert ? 'text-amber-600 dark:text-amber-400' : 'text-emerald-600 dark:text-emerald-400';
              const Icon = isAlert ? AlertTriangle : Award;
              return (
                <div key={`${r.title}-${index}`} className={`bg-card border ${borderColor} border-l-4 ${borderLeftColor} rounded-lg p-4 flex flex-col justify-between`}>
                  <div>
                    <div className="flex items-center gap-3 mb-2">
                      <Icon className={`${iconColor} w-5 h-5 flex-shrink-0`} />
                      <h4 className="font-bold text-foreground text-sm">{r.title}</h4>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{r.detail}</p>
                  </div>
                  <div className="mt-3.5 flex justify-start">
                    <button
                      onClick={() => router.push(r.link)}
                      className={`${
                        isAlert
                          ? 'bg-amber-600 hover:bg-amber-700 text-white'
                          : 'bg-emerald-600 hover:bg-emerald-700 text-white'
                      } px-3 py-1.5 rounded-lg text-xs font-bold transition shadow-sm cursor-pointer inline-flex items-center gap-1`}
                    >
                      View details
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}
    </section>
  );
}

function OperationalAlerts({ alerts }: { alerts: NonNullable<import("@/hooks/use-pharmacy").PharmacyOverview["alerts"]> }) {
  const router = useRouter();
  const requiresAttention = alerts.some((alert) => alert.tone !== "emerald");

  return (
    <section aria-labelledby="attention-queue-title" className="overflow-hidden rounded-xl border border-border bg-card">
      <div className="flex flex-col gap-3 border-b border-border px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 id="attention-queue-title" className="text-sm font-semibold text-foreground">
            {requiresAttention ? "Attention queue" : "Operations status"}
          </h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {requiresAttention ? "Prioritised work that needs a decision today." : "No operational exceptions need action right now."}
          </p>
        </div>
        <Badge variant={requiresAttention ? "secondary" : "outline"}>
          {alerts.length} {alerts.length === 1 ? "item" : "items"}
        </Badge>
      </div>
      <div className="grid gap-3 p-3 md:grid-cols-2">
        {alerts.map((alert) => {
          const variant = alert.tone === "red" ? "destructive" : alert.tone === "amber" ? "warning" : "success";
          const label = alert.tone === "red" ? "Urgent" : alert.tone === "amber" ? "Review" : "On track";
          const action = alert.action ?? { label: "Review", href: "/pharmacy" };

          return (
            <Alert key={alert.title} variant={variant} aria-label={`${label}: ${alert.title}`}>
              <AlertTriangle aria-hidden="true" />
              <div className="min-w-0">
                <div className="flex items-start justify-between gap-3">
                  <AlertTitle>{alert.title}</AlertTitle>
                  <Badge variant={alert.tone === "red" ? "destructive" : "outline"}>{label}</Badge>
                </div>
                <AlertDescription>{alert.detail}</AlertDescription>
                <Button variant="link" size="sm" onClick={() => router.push(action.href)} className="mt-1.5 -ml-2">
                  {action.label}
                  <ArrowUpRight data-icon="inline-end" />
                </Button>
              </div>
            </Alert>
          );
        })}
      </div>
    </section>
  );
}

function OverviewView() {
  const filter = useDateFilter("pharmacy_filter:overview", { defaultPeriod: "month" });
  const periodKey = filterToPeriodKey(filter);
  const q = usePharmacyOverview(periodKey, filter.isReady);
  const saveTargets = useSavePharmacyTargets();
  const [targetsOpen, setTargetsOpen] = useState(false);
  const d = q.data;
  const showTargets = filter.period === "month" || filter.period === "year";
  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-[-0.03em] text-foreground">CEO Overview</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Pharmaceutical distribution intelligence and target pacing.</p>
        </div>
        <div className="workspace-filter flex flex-wrap items-center gap-2">
          <PeriodFilterBar
            filter={filter}
            isLoading={q.isFetching && !q.isPending}
            action={
              showTargets ? (
                <Button
                  onClick={() => setTargetsOpen(true)}
                  className="h-9 gap-1.5 rounded-lg bg-emerald-600 px-3.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-emerald-700 cursor-pointer"
                >
                  <Target className="h-4 w-4" />Set Targets
                </Button>
              ) : undefined
            }
          />
        </div>
      </div>
      {q.isPending && <Loading />}
      {q.isError && <ErrorBox message="Overview load မရပါ — previous import လုပ်ပြီးပြီလား စစ်ပါ။" onRetry={() => q.refetch()} />}
      {d && (
        <>
          <PharmaTargetsDialog
            open={targetsOpen}
            onOpenChange={setTargetsOpen}
            anchor={d.anchor}
            initial={{
              targetSalesAmount: d.targets.sales,
              targetCollectionAmount: d.targets.collection,
              targetExpenseAmount: d.targets.expense,
              targetArLimit: d.targets.arLimit,
              targetApLimit: d.targets.apLimit,
            }}
            saving={saveTargets.isPending}
            onSave={(values) => {
              saveTargets.mutate(
                { period: d.anchor.period, year: d.anchor.year, month: d.anchor.month, ...values },
                { onSuccess: () => setTargetsOpen(false) },
              );
            }}
          />
          <FadeIn className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <ServiceKpiCard
              title="Sales" value={mmk(d.sales.total)} target={d.sales.target ? `${mmk(d.sales.target)} MMK` : "No target"}
              expected={d.sales.kpi.expected != null ? `Expected: ${mmk(d.sales.kpi.expected)} · ${d.sales.lines} lines` : `${d.sales.lines} lines`}
              status={d.sales.kpi.status} statusTone={d.sales.kpi.tone === "emerald" ? "good" : d.sales.kpi.tone === "red" ? "bad" : "muted"}
              icon={TrendingUp} progressPercent={d.sales.kpi.progress} accent={CARD_ACCENTS.sky}
            />
            <ServiceKpiCard
              title="Collection" value={mmk(d.collection.total)} target={d.collection.target ? `${mmk(d.collection.target)} MMK` : "No target"}
              expected={d.collection.kpi.expected != null ? `Expected: ${mmk(d.collection.kpi.expected)} · ${d.collection.invoices} paid` : `${d.collection.invoices} invoices paid`}
              status={d.collection.kpi.status} statusTone={d.collection.kpi.tone === "emerald" ? "good" : d.collection.kpi.tone === "red" ? "bad" : "muted"}
              icon={Wallet} progressPercent={d.collection.kpi.progress} accent={CARD_ACCENTS.emerald}
            />
            <ServiceKpiCard
              title="Purchases" value={mmk(d.purchases.total)} target={d.purchases.target ? `${mmk(d.purchases.target)} MMK` : "No limit"}
              expected={`${d.purchases.invoices} invoices`} status={d.purchases.kpi.status}
              statusTone={d.purchases.kpi.tone === "emerald" ? "good" : d.purchases.kpi.tone === "red" ? "bad" : "muted"}
              icon={ReceiptText} progressPercent={d.purchases.kpi.progress} accent={CARD_ACCENTS.red}
            />
            <ServiceKpiCard
              title="AR Outstanding" value={mmk(d.ar.outstanding)} target={d.ar.limit != null ? `${mmk(d.ar.limit)} MMK` : "No limit"}
              expected={`Overdue ${mmk(d.ar.overdue)} · ${d.ar.openCount} open`} status={d.ar.kpi.status}
              statusTone={d.ar.kpi.tone === "emerald" ? "good" : d.ar.kpi.tone === "red" ? "bad" : "muted"}
              icon={Users} progressPercent={d.ar.kpi.tone === "slate" ? 0 : 100 - Math.min(100, d.ar.outstanding > 0 ? Math.round((d.ar.overdue / d.ar.outstanding) * 100) : 0)}
              accent={CARD_ACCENTS.amber}
            />
            <ServiceKpiCard
              title="AP Outstanding" value={mmk(d.ap.outstanding)} target={d.ap.limit != null ? `${mmk(d.ap.limit)} MMK` : "No limit"}
              expected={`Overdue ${mmk(d.ap.overdue)} · ${d.ap.openCount} open`} status={d.ap.kpi.status}
              statusTone={d.ap.kpi.tone === "emerald" ? "good" : d.ap.kpi.tone === "red" ? "bad" : "muted"}
              icon={Truck} progressPercent={d.ap.kpi.tone === "slate" ? 0 : 100 - Math.min(100, d.ap.outstanding > 0 ? Math.round((d.ap.overdue / d.ap.outstanding) * 100) : 0)}
              accent={CARD_ACCENTS.orange}
            />
            <ServiceKpiCard
              title="Stock Value" value={mmk(d.stock.value)} target={`${d.stock.skus} SKUs`}
              expected="latest snapshot" status={d.stock.skus > 0 ? "Tracked" : "No stock yet"}
              statusTone={d.stock.skus > 0 ? "good" : "muted"}
              icon={Package} progressPercent={d.stock.skus > 0 ? 68 : 0} accent={CARD_ACCENTS.violet}
            />
            <ServiceKpiCard
              title="Cash Net" value={mmk(d.cash.net)} target={d.cash.label}
              expected="period cashflow" status={d.cash.net >= 0 ? "Positive" : "Negative"}
              statusTone={d.cash.net >= 0 ? "good" : "bad"}
              icon={DollarSign} progressPercent={d.cash.net >= 0 ? 96 : 28} accent={CARD_ACCENTS.indigo}
            />
          </FadeIn>
          {d.alerts && d.alerts.length > 0 && <OperationalAlerts alerts={d.alerts} />}
          <PharmaSuggestions periodKey={periodKey} enabled={filter.isReady} />
          <div className="grid gap-6 xl:grid-cols-2">
          {(d.companyHealth ?? []).length > 0 && (
            <section className="bg-card border-2 border-slate-300 dark:border-slate-800 p-6 rounded-xl shadow-sm">
              <div className="flex justify-between items-center mb-4 border-b-2 border-border pb-3">
                <h3 className="font-bold text-foreground text-sm tracking-wide uppercase flex items-center gap-2">
                  <Award className="w-4 h-4 text-amber-500" />Company Health — sales MoM + AR overdue
                </h3>
              </div>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Company</TableHead>
                      <TableHead className="text-right">Sales</TableHead>
                      <TableHead className="text-right">MoM</TableHead>
                      <TableHead className="text-right">AR Overdue</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(d.companyHealth ?? []).map((c) => {
                      const weak = c.momPct < -10 || c.arOverdue > 0;
                      return (
                        <TableRow key={c.company}>
                          <TableCell className="font-bold text-sm max-w-56 truncate" title={c.company}>{c.company}</TableCell>
                          <TableCell className="text-right font-extrabold">{mmk(c.sales)}</TableCell>
                          <TableCell className={`text-right font-bold ${c.momPct < -10 ? "text-red-500" : c.momPct > 0 ? "text-emerald-500" : "text-muted-foreground"}`}>
                            {c.momPct > 0 ? "+" : ""}{c.momPct}%
                          </TableCell>
                          <TableCell className={`text-right font-bold ${c.arOverdue > 0 ? "text-amber-600" : "text-muted-foreground"}`}>
                            {c.arOverdue > 0 ? mmk(c.arOverdue) : "—"}
                          </TableCell>
                          <TableCell>
                            <Badge variant={weak ? "destructive" : "secondary"}>{weak ? "Weak" : "Strong"}</Badge>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </section>
          )}
            {(d.collectionByBank ?? []).length > 0 && (
              <section className="bg-card border-2 border-slate-300 dark:border-slate-800 p-6 rounded-xl shadow-sm">
                <div className="flex justify-between items-center mb-4 border-b-2 border-border pb-3">
                  <h3 className="font-bold text-foreground text-sm tracking-wide uppercase flex items-center gap-2">
                    <Wallet className="w-4 h-4 text-emerald-500" />Collection by Bank
                  </h3>
                </div>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Bank</TableHead>
                        <TableHead className="text-right">Amount</TableHead>
                        <TableHead className="text-right">Invoices</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(d.collectionByBank ?? []).map((b) => (
                        <TableRow key={b.bank}>
                          <TableCell className="font-bold text-sm">{b.bank}</TableCell>
                          <TableCell className="text-right font-extrabold text-emerald-600 dark:text-emerald-400">{mmk(b.amount)}</TableCell>
                          <TableCell className="text-right text-muted-foreground">{b.count}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </section>
            )}
          </div>
          <section className="bg-card border-2 border-slate-300 dark:border-slate-800 p-6 rounded-xl shadow-sm">
              <div className="flex items-center justify-between gap-3 border-b-2 border-border pb-4">
                <h3 className="flex items-center gap-2 text-sm font-bold tracking-wide text-foreground uppercase">
                  <BarChart3 className="size-4 text-sky-500" />Monthly Sales Trend (MMK)
                </h3>
                <Badge variant="outline">{periodKey}</Badge>
              </div>
              <CommerceBarChart unit="MMK" data={(d.salesTrend ?? []).map((t) => ({ label: t.month, value: t.amount }))} />
          </section>
          {(d.cashflow ?? []).length > 0 && (
            <section className="bg-card border-2 border-slate-300 dark:border-slate-800 p-6 rounded-xl shadow-sm">
                <div className="flex justify-between items-center mb-4 border-b-2 border-border pb-3">
                  <h3 className="font-bold text-foreground text-sm tracking-wide uppercase flex items-center gap-2">
                    <DollarSign className="w-4 h-4 text-indigo-500" />Cash-flow — collection vs purchases (6 mo)
                  </h3>
                </div>
                <FinanceTimelineChart monthly={(d.cashflow ?? []).map((c) => [c.month, c.collection, c.purchases] as [string, number, number])} />
            </section>
          )}
        </>
      )}
    </div>
  );
}

// ─── Sales ───────────────────────────────────────────────────────────────────

function SalesView() {
  const filter = useDateFilter("pharmacy_filter:sales", { defaultPeriod: "month" });
  const periodKey = filterToPeriodKey(filter);
  const q = usePharmacySales(periodKey, filter.isReady);
  const d = q.data;
  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-[-0.03em] text-foreground">Sales Analysis</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Company, product and customer sales performance.</p>
        </div>
        <div className="workspace-filter flex flex-wrap items-center gap-2">
          <PeriodFilterBar filter={filter} isLoading={q.isFetching && !q.isPending} action={<ScopedDeleteButton scope="sales" label="sales data" />} />
        </div>
      </div>
      {q.isPending && <Loading />}
      {q.isError && <ErrorBox message="Sales analysis load မရပါ။" onRetry={() => q.refetch()} />}
      {d && (
        <>
          <FadeIn className="grid gap-6 md:grid-cols-2 xl:grid-cols-4">
            <ServiceKpiCard title="Sales Amount" value={mmk(d.totals.amount)} target="MMK" expected={`${mmk(d.totals.lines)} transactions`} status={`${d.byChannel.length} channels`} statusTone="muted" icon={TrendingUp} progressPercent={100} accent={CARD_ACCENTS.sky} />
            <ServiceKpiCard title="Qty Sold" value={mmk(d.totals.qty)} target="units" expected={`${mmk(d.totals.lines)} lines`} status="Tracked" statusTone="good" icon={Package} progressPercent={68} accent={CARD_ACCENTS.emerald} />
            <ServiceKpiCard title="Transactions" value={mmk(d.totals.lines)} target="lines" expected={d.byCustomer.length > 0 ? `Top customer ${mmk(d.byCustomer[0].amount)}` : "No customers"} status="Tracked" statusTone="good" icon={Users} progressPercent={68} accent={CARD_ACCENTS.violet} />
            <ServiceKpiCard title="Channels" value={String(d.byChannel.length)} target={d.byChannel.map((c) => c.key).join(" · ")} expected={d.byChannel.map((c) => `${c.key} ${mmk(c.amount)}`).join(" · ")} status="Active" statusTone="good" icon={Truck} progressPercent={100} accent={CARD_ACCENTS.amber} />
          </FadeIn>
          <section className="bg-card border-2 border-slate-300 dark:border-slate-800 p-6 rounded-xl shadow-sm">
            <div className="flex justify-between items-center mb-6 border-b-2 border-border pb-4">
              <h3 className="font-bold text-foreground text-sm tracking-wide uppercase flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-sky-500" />Monthly Sales Trend (MMK)
              </h3>
              <span className="text-xs font-bold text-muted-foreground border-2 border-border bg-muted px-3 py-1 rounded-full">{periodKey}</span>
            </div>
            <CommerceBarChart unit="MMK" data={d.trend.map((t) => ({ label: t.month, value: t.amount }))} />
          </section>
          <div className="grid gap-6 lg:grid-cols-2">
            <section className="bg-card border-2 border-slate-300 dark:border-slate-800 p-6 flex flex-col rounded-xl shadow-sm hover:shadow-lg transition-all duration-200">
              <div className="flex items-center gap-3 mb-4 border-b-2 border-border pb-3">
                <div className="w-8 h-8 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center"><Truck className="text-amber-500 w-4 h-4" /></div>
                <h3 className="font-bold text-foreground">Top Companies / Principals</h3>
              </div>
              <div className="overflow-x-auto flex-1">
                <Table>
                  <TableHeader><TableRow className="uppercase text-[10px] font-extrabold tracking-wider"><TableHead>Company</TableHead><TableHead className="text-right">Amount (MMK)</TableHead><TableHead className="text-right">Qty</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {d.byCompany.slice(0, 10).map((r) => (
                      <TableRow key={r.key} className="hover:bg-muted/30 transition">
                        <TableCell className="font-bold">{r.key}</TableCell>
                        <TableCell className="text-right font-extrabold text-sky-600 dark:text-sky-400">{mmk(r.amount)}</TableCell>
                        <TableCell className="text-right text-muted-foreground font-bold">{mmk(r.qty)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </section>
            <section className="bg-card border-2 border-slate-300 dark:border-slate-800 p-6 flex flex-col rounded-xl shadow-sm hover:shadow-lg transition-all duration-200">
              <div className="flex items-center gap-3 mb-4 border-b-2 border-border pb-3">
                <div className="w-8 h-8 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center"><Package className="text-emerald-500 w-4 h-4" /></div>
                <h3 className="font-bold text-foreground">Top Products</h3>
              </div>
              <div className="overflow-x-auto flex-1">
                <Table>
                  <TableHeader><TableRow className="uppercase text-[10px] font-extrabold tracking-wider"><TableHead>Product</TableHead><TableHead className="text-right">Amount (MMK)</TableHead><TableHead className="text-right">FOC/Ret</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {d.byProduct.slice(0, 10).map((r) => (
                      <TableRow key={r.key} className="hover:bg-muted/30 transition">
                        <TableCell className="font-bold">{r.name}</TableCell>
                        <TableCell className="text-right font-extrabold text-sky-600 dark:text-sky-400">{mmk(r.amount)}</TableCell>
                        <TableCell className="text-right text-muted-foreground font-bold">{mmk(r.foc)}/{mmk(r.ret)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </section>
          </div>
          <section className="bg-card border-2 border-slate-300 dark:border-slate-800 p-6 rounded-xl shadow-sm">
            <div className="flex items-center gap-3 mb-4 border-b-2 border-border pb-3">
              <div className="w-8 h-8 rounded-full bg-sky-100 dark:bg-sky-900/30 flex items-center justify-center"><Users className="text-sky-500 w-4 h-4" /></div>
              <h3 className="font-bold text-foreground">Top Customers</h3>
            </div>
            <div>
              <Table>
                <TableHeader><TableRow className="uppercase text-[10px] font-extrabold tracking-wider"><TableHead>Customer</TableHead><TableHead className="text-right">Amount (MMK)</TableHead><TableHead className="text-right">Lines</TableHead></TableRow></TableHeader>
                <TableBody>
                  {d.byCustomer.slice(0, 12).map((r) => (
                    <TableRow key={r.key} className="hover:bg-muted/30 transition">
                      <TableCell className="font-bold">{r.key}</TableCell>
                      <TableCell className="text-right font-extrabold text-sky-600 dark:text-sky-400">{mmk(r.amount)}</TableCell>
                      <TableCell className="text-right text-muted-foreground font-bold">{r.lines}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </section>
        </>
      )}
    </div>
  );
}

// ─── AR ──────────────────────────────────────────────────────────────────────

function ArView() {
  const filter = useDateFilter("pharmacy_filter:ar", { defaultPeriod: "overall" });
  const periodKey = filterToPeriodKey(filter);
  const [page, setPage] = useQueryState("ar-page", parseAsInteger.withDefault(1));
  const [limit, setLimit] = useQueryState("ar-limit", parseAsInteger.withDefault(10));
  const [sort, setSort] = useQueryState("ar-sort", parseAsStringEnum(["priority", "overdue", "amount"]).withDefault("priority"));
  const [search, setSearch] = useQueryState("ar-q", parseAsString.withDefault(""));
  const dq = useDebounce(search);
  const q = usePharmacyAr(periodKey, page, limit, dq, filter.isReady);
  const d = q.data;
  const rows = useMemo(() => {
    const list = [...(d?.priority ?? [])];
    if (sort === "overdue") list.sort((a, b) => b.overdueDays - a.overdueDays);
    else if (sort === "amount") list.sort((a, b) => b.amount - a.amount);
    return list;
  }, [d, sort]);
  const bucketColors = ["#10b981", "#0ea5e9", "#f59e0b", "#f97316", "#ef4444", "#991b1b"];
  const donutItems = (d?.buckets ?? []).map((b, i) => [
    `${b.bucket} days`,
    d && d.total.amount > 0 ? Math.round((b.amount / d.total.amount) * 100) : 0,
    b.amount,
    bucketColors[i % bucketColors.length],
  ] as [string, number, number, string]);
  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-[-0.03em] text-foreground">AR Aging</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Open receivables and collection priority for the selected invoice period.</p>
        </div>
        <div className="workspace-filter flex flex-wrap items-center gap-2">
          <PeriodFilterBar filter={filter} isLoading={q.isFetching && !q.isPending} action={<ScopedDeleteButton scope="receivable" label="receivables" />} />
        </div>
      </div>
      {q.isPending && <Loading />}
      {q.isError && <ErrorBox message="AR aging load မရပါ။" onRetry={() => q.refetch()} />}
      {d && (
        <>
          <FadeIn className="grid gap-6 md:grid-cols-2 xl:grid-cols-4">
            <FinanceKpiCard label="Total AR" value={mmk(d.total.amount)} unit={`${d.total.count} open`} detail="All unpaid receivables" status="Tracked" icon={Wallet} accentClass="border-l-sky-500" />
            <FinanceKpiCard label="Overdue" value={mmk(d.buckets.reduce((s, b) => b.bucket !== "0-7" ? s + b.amount : s, 0))} detail="Prioritise collection activity" status="Review" icon={AlertTriangle} accentClass="border-l-red-500" />
            <FinanceKpiCard label="Current" value={mmk(d.current.amount)} unit={`${d.current.count} invoices`} detail="Within normal credit terms" status="Healthy" icon={TrendingUp} accentClass="border-l-emerald-500" />
            <FinanceKpiCard label="90+ Days" value={mmk(d.buckets.find((b) => b.bucket === "90+")?.amount ?? 0)} detail="Highest aging exposure" status="Monitor" icon={Users} accentClass="border-l-amber-500" />
          </FadeIn>
          <div className="grid gap-6 lg:grid-cols-2">
            <section className="bg-card border-2 border-slate-300 dark:border-slate-800 p-6 rounded-xl shadow-sm">
              <div className="flex items-center gap-3 mb-4 border-b-2 border-border pb-3">
                <div className="w-8 h-8 rounded-full bg-sky-100 dark:bg-sky-900/30 flex items-center justify-center"><Wallet className="text-sky-500 w-4 h-4" /></div>
                <h3 className="font-bold text-foreground">AR Aging Breakdown</h3>
              </div>
              <ExpenseBreakdownChart items={donutItems} />
            </section>
            <section className="bg-card border-2 border-slate-300 dark:border-slate-800 p-6 rounded-xl shadow-sm">
              <div className="flex items-center gap-3 mb-4 border-b-2 border-border pb-3">
                <div className="w-8 h-8 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center"><AlertTriangle className="text-amber-500 w-4 h-4" /></div>
                <h3 className="font-bold text-foreground">Aging Buckets</h3>
              </div>
              <Table>
                <TableHeader><TableRow className="uppercase text-[10px] font-extrabold tracking-wider"><TableHead>Bucket</TableHead><TableHead className="text-right">Invoices</TableHead><TableHead className="text-right">Amount (MMK)</TableHead></TableRow></TableHeader>
                <TableBody>
                  {d.buckets.map((b) => (
                    <TableRow key={b.bucket} className="hover:bg-muted/30 transition">
                      <TableCell className="font-bold">{b.bucket} days</TableCell>
                      <TableCell className="text-right text-muted-foreground font-bold">{b.count}</TableCell>
                      <TableCell className="text-right font-extrabold text-sky-600 dark:text-sky-400">{mmk(b.amount)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </section>
          </div>
          <section className="bg-card border-2 border-slate-300 dark:border-slate-800 p-6 rounded-xl shadow-sm">
            <div className="flex items-center gap-3 mb-4 border-b-2 border-border pb-3">
              <div className="w-8 h-8 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center"><Users className="text-red-500 w-4 h-4" /></div>
            <div>
              <h3 className="font-bold text-foreground">Collection Priority</h3>
              <p className="text-xs text-muted-foreground">overdue days × amount score</p>
            </div>
            <div className="ml-auto flex flex-wrap items-center gap-2">
              <Input
                placeholder="Search customer / invoice…"
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                className="h-8 w-52 text-xs"
              />
              <Select value={sort} onValueChange={(v) => { if (v === "priority" || v === "overdue" || v === "amount") { setSort(v); setPage(1); } }}>
                <SelectTrigger className="h-8 w-32 text-xs font-semibold">
                  {sort === "priority" ? "Priority" : sort === "overdue" ? "Overdue" : "Amount"}
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="priority">Priority</SelectItem>
                  <SelectItem value="overdue">Overdue</SelectItem>
                  <SelectItem value="amount">Amount</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="overflow-x-auto">
            <div className="min-h-[200px]">
              <VirtualTable<PharmacyArRow>
                rows={rows}
                rowHeight={44}
                height={480}
                keyOf={(r) => r.id}
                columns={[
                  {
                    key: "customer", header: "Customer", width: "minmax(180px, 1fr)",
                    cell: (r) => <span className="font-bold truncate" title={r.customerName ?? ""}>{r.customerName}</span>,
                  },
                  { key: "invoice", header: "Invoice", width: "130px", cell: (r) => <span className="font-mono text-xs">{r.invoiceNo}</span> },
                  {
                    key: "amount", header: "Amount (MMK)", width: "150px", align: "right",
                    cell: (r) => <span className="font-extrabold text-sky-600 dark:text-sky-400">{mmk(r.amount)}</span>,
                  },
                  {
                    key: "overdue", header: "Overdue", width: "100px", align: "right",
                    cell: (r) => <Badge variant={r.overdueDays > 30 ? "destructive" : "secondary"}>{r.overdueDays}d</Badge>,
                  },
                  {
                    key: "due", header: "Due Date", width: "120px",
                    cell: (r) => <span className="text-muted-foreground">{r.dueDate ? new Date(r.dueDate).toLocaleDateString() : "—"}</span>,
                  },
                ]}
              />
            </div>
            {d && (
              <TablePager
                page={d.page}
                limit={d.limit}
                total={d.totalPriority}
                isLoading={q.isFetching && !q.isPending}
                onPage={(p) => setPage(p)}
                onLimit={(l) => { setLimit(l); setPage(1); }}
              />
            )}
          </div>
          </section>
        </>
      )}
    </div>
  );
}

// ─── Inventory ───────────────────────────────────────────────────────────────

function InventoryView() {
  const filter = useDateFilter("pharmacy_filter:inventory", { defaultPeriod: "overall" });
  const periodKey = filterToPeriodKey(filter);
  const [tab, setTab] = useQueryState(
    "inv-tab",
    parseAsStringEnum(["reorder", "belowMin", "stockout", "overstock", "slowMoving", "expiring"]).withDefault("reorder"),
  );
  const [page, setPage] = useQueryState("inv-page", parseAsInteger.withDefault(1));
  const [limit, setLimit] = useQueryState("inv-limit", parseAsInteger.withDefault(10));
  const [sort, setSort] = useQueryState("inv-sort", parseAsStringEnum(["cover", "value", "qty"]).withDefault("cover"));
  const [search, setSearch] = useQueryState("inv-q", parseAsString.withDefault(""));
  const dq = useDebounce(search);
  const q = usePharmacyInventory(periodKey, page, limit, dq, filter.isReady);
  const isExpiryTab = tab === "expiring";
  const rows = useMemo(() => {
    if (isExpiryTab) return [];
    const list = [...(q.data ? (q.data[tab] as PharmacyInventoryRow[]) : [])];
    if (sort === "value") list.sort((a, b) => (b.amount ?? 0) - (a.amount ?? 0));
    else if (sort === "qty") list.sort((a, b) => b.qty - a.qty);
    else list.sort((a, b) => (a.coverDays ?? Number.MAX_SAFE_INTEGER) - (b.coverDays ?? Number.MAX_SAFE_INTEGER));
    return list;
  }, [q.data, tab, sort, isExpiryTab]);
  const expiryRows = useMemo(() => {
    const list = [...(q.data?.expiring ?? [])];
    return list;
  }, [q.data]);
  const d = q.data;
  const tabMeta = {
    reorder: { title: "Reorder Recommendations", desc: "below Min or cover < 14 days — Max level" },
    belowMin: { title: "Below Min Level", desc: "qty < Min — STOCK BY PRICE levels" },
    stockout: { title: "Stock-out Items", desc: "qty 0 - Out of stock items" },
    overstock: { title: "Overstock Items", desc: "cover > 90 days" },
    slowMoving: { title: "Slow-moving Items", desc: "coverDays > 60 days" },
    expiring: { title: "Near-expiry Lots", desc: "expired + 180 days (lots + store-in batches)" },
  } as const;
  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-[-0.03em] text-foreground">Inventory Control</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Stock position, sales velocity and expiry exposure as of the selected period.</p>
        </div>
        <div className="workspace-filter flex flex-wrap items-center gap-2">
          <PeriodFilterBar filter={filter} isLoading={q.isFetching && !q.isPending} action={<ScopedDeleteButton scope="stock" label="inventory data" />} />
        </div>
      </div>
      {q.isPending && <Loading />}
      {q.isError && <ErrorBox message="Inventory load မရပါ။" onRetry={() => q.refetch()} />}
      {d && (
        <>
          <FadeIn className="grid gap-6 md:grid-cols-2 xl:grid-cols-4">
            <FinanceKpiCard label="SKUs Tracked" value={mmk(d.totals.skus)} unit={`MMK ${mmk(d.totals.value)}`} detail="Current stock valuation" status="Tracked" icon={Package} accentClass="border-l-sky-500" />
            <FinanceKpiCard label="Reorder / Below Min" value={`${mmk(d.totals.reorder)} / ${mmk(d.totals.belowMin ?? 0)}`} detail="Suggested replenishment queue" status="Review" icon={Truck} accentClass="border-l-amber-500" />
            <FinanceKpiCard label="Stock-out" value={mmk(d.totals.stockout)} detail="Items unavailable to sell" status={d.totals.stockout > 0 ? "Urgent" : "Clear"} icon={AlertTriangle} accentClass="border-l-red-500" />
            <FinanceKpiCard label="Expired / ≤90d" value={`${mmk(d.totals.expired ?? 0)} / ${mmk(d.totals.expiring90 ?? 0)}`} detail="Expired and near-expiry lots" status="Monitor" icon={Wallet} accentClass="border-l-emerald-500" />
          </FadeIn>
          <div className="flex flex-wrap items-center gap-2">
            {(["reorder", "belowMin", "stockout", "overstock", "slowMoving", "expiring"] as const).map((t) => (
              <Button key={t} size="sm" variant={tab === t ? "default" : "outline"} onClick={() => { setTab(t); setPage(1); }}>
                {t === "slowMoving" ? "Slow-moving" : t === "belowMin" ? "Below Min" : t === "expiring" ? "Near-expiry" : t.charAt(0).toUpperCase() + t.slice(1)}
              </Button>
            ))}
            <div className="ml-auto flex flex-wrap items-center gap-2">
              <Input
                placeholder="Search code / name…"
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                className="h-8 w-52 text-xs"
              />
              <Select value={sort} onValueChange={(v) => { if (v === "cover" || v === "value" || v === "qty") setSort(v); }}>
                <SelectTrigger className="h-8 w-28 text-xs font-semibold">
                  {sort === "cover" ? "Cover" : sort === "value" ? "Value" : "Qty"}
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="cover">Cover</SelectItem>
                  <SelectItem value="value">Value</SelectItem>
                  <SelectItem value="qty">Qty</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <section className="bg-card border-2 border-slate-300 dark:border-slate-800 p-6 rounded-xl shadow-sm">
            <div className="flex items-center gap-3 mb-4 border-b-2 border-border pb-3">
              <div className="w-8 h-8 rounded-full bg-sky-100 dark:bg-sky-900/30 flex items-center justify-center"><Package className="text-sky-500 w-4 h-4" /></div>
              <div>
                <h3 className="font-bold text-foreground">{tabMeta[tab].title}</h3>
                <p className="text-xs text-muted-foreground">{tabMeta[tab].desc}</p>
              </div>
            </div>
            <div>
              {isExpiryTab ? (
                <VirtualTable<ExpiryRow>
                  rows={expiryRows}
                  rowHeight={44}
                  height={Math.min(520, Math.max(132, expiryRows.length * 44))}
                  keyOf={(r) => `${r.source ?? "lot"}-${r.itemCode}-${r.itemName}-${r.expDate}`}
                  columns={[
                    { key: "code", header: "Code / Batch", width: "150px", cell: (r) => <span className="font-mono text-xs">{r.source === "storein" ? (r.batchNo ?? "—") : r.itemCode}</span> },
                    {
                      key: "item", header: "Item", width: "minmax(180px, 1fr)",
                      cell: (r) => <span className="font-bold truncate" title={r.itemName ?? ""}>{r.itemName}</span>,
                    },
                    {
                      key: "src", header: "Src", width: "80px",
                      cell: (r) => <Badge variant={r.source === "storein" ? "secondary" : "outline"}>{r.source === "storein" ? "storein" : "lot"}</Badge>,
                    },
                    {
                      key: "balance", header: "Balance", width: "90px", align: "right",
                      cell: (r) => <span className="text-muted-foreground font-bold">{mmk(r.balance)}</span>,
                    },
                    {
                      key: "exp", header: "Exp Date", width: "120px",
                      cell: (r) => <span className="text-xs">{r.expDate ? new Date(r.expDate).toISOString().slice(0, 10) : "—"}</span>,
                    },
                    {
                      key: "days", header: "Status", width: "110px", align: "right",
                      cell: (r) => r.daysToExpiry == null ? "—" : (
                        <Badge variant={r.daysToExpiry < 0 ? "destructive" : r.daysToExpiry <= 90 ? "secondary" : "outline"}>
                          {r.daysToExpiry < 0 ? `expired ${-r.daysToExpiry}d` : `${r.daysToExpiry}d left`}
                        </Badge>
                      ),
                    },
                  ]}
                />
              ) : (
              <VirtualTable<PharmacyInventoryRow>
                rows={rows}
                rowHeight={44}
                height={Math.min(520, Math.max(132, rows.length * 44))}
                keyOf={(r) => r.itemCode}
                columns={[
                  { key: "code", header: "Code", width: "130px", cell: (r) => <span className="font-mono text-xs">{r.itemCode}</span> },
                  {
                    key: "item", header: "Item", width: "minmax(180px, 1fr)",
                    cell: (r) => <span className="font-bold truncate" title={r.itemName ?? ""}>{r.itemName}</span>,
                  },
                  {
                    key: "qty", header: "Qty", width: "90px", align: "right",
                    cell: (r) => <span className="text-muted-foreground font-bold">{mmk(r.qty)}</span>,
                  },
                  {
                    key: "minmax", header: "Min / Max", width: "110px", align: "right",
                    cell: (r) => (r.minQty == null && r.maxQty == null) ? <span className="text-xs text-muted-foreground">—</span> : (
                      <span className="text-xs font-bold">{mmk(r.minQty)} / {mmk(r.maxQty)}</span>
                    ),
                  },
                  {
                    key: "cover", header: "Cover (days)", width: "110px", align: "right",
                    cell: (r) => r.coverDays == null ? "—" : (
                      <Badge variant={r.coverDays < 14 ? "destructive" : r.coverDays > 90 ? "secondary" : "outline"}>
                        {r.coverDays}d
                      </Badge>
                    ),
                  },
                  {
                    key: "value", header: "Value (MMK)", width: "140px", align: "right",
                    cell: (r) => <span className="font-extrabold text-sky-600 dark:text-sky-400">{mmk(r.amount)}</span>,
                  },
                  ...(tab === "reorder"
                    ? [{
                        key: "suggest", header: "Suggest Qty", width: "110px", align: "right" as const,
                        cell: (r: PharmacyInventoryRow) => <span className="font-black">{mmk(r.suggestedQty)}</span>,
                      },
                      {
                        key: "supplier", header: "Supplier", width: "150px",
                        cell: (r: PharmacyInventoryRow) => <span className="text-xs truncate" title={r.principal ?? ""}>{r.principal ?? "—"}</span>,
                      }]
                    : []),
                ]}
              />
              )}
            </div>
            {d && !isExpiryTab && (
              <TablePager
                page={d.page}
                limit={d.limit}
                total={dq.trim() ? (tab === "reorder" ? (d.filteredTotals?.reorder ?? 0) : tab === "belowMin" ? (d.filteredTotals?.belowMin ?? 0) : tab === "stockout" ? (d.filteredTotals?.stockout ?? 0) : tab === "overstock" ? (d.filteredTotals?.overstock ?? 0) : d.filteredTotals?.slow ?? 0) : tab === "reorder" ? d.totals.reorder : tab === "belowMin" ? (d.totals.belowMin ?? 0) : tab === "stockout" ? d.totals.stockout : tab === "overstock" ? d.totals.overstock : d.totals.slow}
                isLoading={q.isFetching && !q.isPending}
                onPage={(p) => setPage(p)}
                onLimit={(l) => { setLimit(l); setPage(1); }}
              />
            )}
            {d && isExpiryTab && (
              <p className="mt-2 text-xs text-muted-foreground">Expired first — store-in batches are name-matched (no item codes).</p>
            )}
          </section>
        </>
      )}
    </div>
  );
}

// ─── Payables ────────────────────────────────────────────────────────────────

function PayablesView() {
  const filter = useDateFilter("pharmacy_filter:payables", { defaultPeriod: "overall" });
  const periodKey = filterToPeriodKey(filter);
  const [page, setPage] = useQueryState("ap-page", parseAsInteger.withDefault(1));
  const [limit, setLimit] = useQueryState("ap-limit", parseAsInteger.withDefault(10));
  const [supplierPage, setSupplierPage] = useQueryState("ap-supplier-page", parseAsInteger.withDefault(1));
  const [supplierLimit, setSupplierLimit] = useQueryState("ap-supplier-limit", parseAsInteger.withDefault(10));
  const [search, setSearch] = useQueryState("ap-q", parseAsString.withDefault(""));
  const dq = useDebounce(search);
  const q = usePharmacyPayables(periodKey, page, limit, dq, filter.isReady);
  const d = q.data;
  const suppliers = d?.bySupplier ?? [];
  const supplierTotalPages = Math.max(1, Math.ceil(suppliers.length / supplierLimit));
  const safeSupplierPage = Math.min(Math.max(1, supplierPage), supplierTotalPages);
  const pagedSuppliers = suppliers.slice((safeSupplierPage - 1) * supplierLimit, safeSupplierPage * supplierLimit);
  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-[-0.03em] text-foreground">Supplier Payables</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Open supplier invoices and payment priority for the selected invoice period.</p>
        </div>
        <div className="workspace-filter flex flex-wrap items-center gap-2">
          <PeriodFilterBar filter={filter} isLoading={q.isFetching && !q.isPending} action={<ScopedDeleteButton scope="purchase" label="purchase data" />} />
        </div>
      </div>
      {q.isPending && <Loading />}
      {q.isError && <ErrorBox message="Payables load မရပါ။" onRetry={() => q.refetch()} />}
      {d && (
        <>
          <FadeIn className="grid gap-6 md:grid-cols-2 xl:grid-cols-4">
            <FinanceKpiCard label="AP Outstanding" value={mmk(d.totals.outstanding)} unit={`${d.totals.openCount} open`} detail="Open supplier invoices" status="Tracked" icon={Truck} accentClass="border-l-sky-500" />
            <FinanceKpiCard label="Overdue" value={mmk(d.totals.overdue)} detail="Payables past due date" status="Review" icon={AlertTriangle} accentClass="border-l-red-500" />
            <FinanceKpiCard label="Discount at Risk" value={mmk(d.totals.discountAtRisk)} unit="MMK" detail="Potential early-payment loss" status="Monitor" icon={Wallet} accentClass="border-l-amber-500" />
            <FinanceKpiCard label="Suppliers" value={mmk(d.bySupplier.length)} detail="Suppliers with open balances" status="Tracked" icon={Users} accentClass="border-l-emerald-500" />
          </FadeIn>
          <section className="bg-card border-2 border-slate-300 dark:border-slate-800 p-6 rounded-xl shadow-sm">
            <div className="flex flex-wrap items-center gap-3 mb-4 border-b-2 border-border pb-3">
              <div className="w-8 h-8 rounded-full bg-sky-100 dark:bg-sky-900/30 flex items-center justify-center"><Truck className="text-sky-500 w-4 h-4" /></div>
              <div>
                <h3 className="font-bold text-foreground">Supplier Payable & Payment Priority</h3>
                <p className="text-xs text-muted-foreground">overdue + in-time discount ဆုံးရှုံးနိုင်ခြေအလိုက် အရင်ပေး</p>
              </div>
              <div className="ml-auto">
                <Input
                  placeholder="Search supplier…"
                  value={search}
                  onChange={(e) => { setSearch(e.target.value); setSupplierPage(1); }}
                  className="h-8 w-52 text-xs"
                />
              </div>
            </div>
            <div>
              <Table>
                <TableHeader><TableRow className="uppercase text-[10px] font-extrabold tracking-wider"><TableHead>Supplier</TableHead><TableHead className="text-right">Outstanding (MMK)</TableHead><TableHead className="text-right">Overdue</TableHead><TableHead className="text-right">Due Soon</TableHead><TableHead className="text-right">Disc. at Risk</TableHead><TableHead className="text-right">Invoices</TableHead></TableRow></TableHeader>
                <TableBody>
                  {pagedSuppliers.map((r) => (
                    <TableRow key={r.supplier} className="hover:bg-muted/30 transition">
                      <TableCell className="font-bold">{r.supplier}</TableCell>
                      <TableCell className="text-right font-extrabold text-sky-600 dark:text-sky-400">{mmk(r.outstanding)}</TableCell>
                      <TableCell className="text-right">
                        {r.overdue > 0 ? <Badge variant="destructive">{mmk(r.overdue)}</Badge> : <span className="text-muted-foreground">0</span>}
                      </TableCell>
                      <TableCell className="text-right text-muted-foreground font-bold">{mmk(r.dueSoon)}</TableCell>
                      <TableCell className="text-right">
                        {r.discountAtRisk > 0 ? <Badge variant="secondary">{mmk(r.discountAtRisk)}</Badge> : <span className="text-muted-foreground">0</span>}
                      </TableCell>
                      <TableCell className="text-right text-muted-foreground font-bold">{r.invoices}</TableCell>
                    </TableRow>
                  ))}
                  {suppliers.length === 0 && !q.isPending && (
                    <TableRow><TableCell colSpan={6} className="py-8 text-center text-sm text-muted-foreground">No matches - try another search.</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
            {suppliers.length > 0 && (
              <TablePager
                page={safeSupplierPage}
                limit={supplierLimit}
                total={suppliers.length}
                onPage={(p) => setSupplierPage(p)}
                onLimit={(l) => { setSupplierLimit(l); setSupplierPage(1); }}
              />
            )}
          </section>
          <section className="bg-card border-2 border-slate-300 dark:border-slate-800 p-6 rounded-xl shadow-sm">
            <div className="flex items-center gap-3 mb-4 border-b-2 border-border pb-3">
              <div className="w-8 h-8 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center"><AlertTriangle className="text-red-500 w-4 h-4" /></div>
              <div>
                <h3 className="font-bold text-foreground">Payment Priority Queue</h3>
                <p className="text-xs text-muted-foreground">overdue + discount-at-risk score</p>
              </div>
            </div>
            <div>
              <div className="min-h-[200px]">
                <Table>
                  <TableHeader><TableRow className="uppercase text-[10px] font-extrabold tracking-wider"><TableHead>Supplier</TableHead><TableHead>Invoice</TableHead><TableHead className="text-right">Amount (MMK)</TableHead><TableHead className="text-right">Status</TableHead><TableHead>Due Date</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {d.priority.map((r: PharmacyPayableRow) => (
                      <TableRow key={r.id} className="hover:bg-muted/30 transition">
                        <TableCell className="font-bold">{r.supplierName}</TableCell>
                        <TableCell className="font-mono text-xs">{r.invoiceNumber}</TableCell>
                        <TableCell className="text-right font-extrabold text-sky-600 dark:text-sky-400">{mmk(r.amount)}</TableCell>
                        <TableCell className="text-right">
                          {r.overdue ? <Badge variant="destructive">Overdue</Badge> : r.dueSoon ? <Badge variant="secondary">Due soon</Badge> : <Badge variant="outline">Open</Badge>}
                        </TableCell>
                        <TableCell className="text-muted-foreground">{r.dueDate ? new Date(r.dueDate).toLocaleDateString() : "—"}</TableCell>
                      </TableRow>
                    ))}
                    {d.priority.length === 0 && !q.isPending && (
                      <TableRow><TableCell colSpan={5} className="py-8 text-center text-sm text-muted-foreground">No open payables.</TableCell></TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
              <TablePager
                page={d.page}
                limit={d.limit}
                total={d.totalPriority}
                isLoading={q.isFetching && !q.isPending}
                onPage={(p) => setPage(p)}
                onLimit={(l) => { setLimit(l); setPage(1); }}
              />
            </div>
          </section>
        </>
      )}
    </div>
  );
}

// ─── Import ──────────────────────────────────────────────────────────────────

const PHARMA_KIND_HINTS: Array<{ kind: string; label: string; columns: string }> = [
  { kind: "po", label: "Purchase Order", columns: "PO Number | Item Code | Supplier Name | PO Date | Quantity Ordered | Quantity Delivered | Unit Price" },
  { kind: "invoice", label: "Purchase Invoice", columns: "Invoice Number | Company Name | Purchase Order | Credit Term | Invoice Date | Due Date | Amount" },
  { kind: "price_list", label: "Price List", columns: "Item Code | Item Name | Company Name | Unit Price | Old Price" },
  { kind: "stock", label: "Stock Snapshot", columns: "Item Code | Item Name | Qty | Unit Price | Amount (+ sheet/ဖိုင်နာမည်မှာ လ/နှစ်)" },
  { kind: "movement", label: "Stock Movement (iStock)", columns: "Code | Description | Unit | Opening | Purchase | Sale | Closing (+ From/To dates)" },
  { kind: "minmax", label: "Stock Min/Max (iStock)", columns: "Code | Description | Max | Min | Balance" },
  { kind: "expiry", label: "Expiry Lots (iStock)", columns: "Code | Description | Exp Date | Balance" },
  { kind: "storein", label: "Store-in Lots (EXP)", columns: "Item Name | Batch No | Packing Size | Qty On Hand | Unit Price | Storein Date | MFG Date | Exp Date | Supplier Name" },
  { kind: "returns", label: "Returns (iStock)", columns: "Code | Description | Date | Qty | Sale Price | Amount" },
  { kind: "receivable", label: "Receivable", columns: "Invoice No. | Customer Name | Payment Status | Invoice Date | Due Date | Amount | Paid Date" },
  { kind: "sales_maei", label: "MA EI Sales", columns: "Item Description | Ref No | Date | Customer Name | Sale Qty | FOC Qty | Return Qty | Amount | Principal (Supplier)" },
  { kind: "sales_mega", label: "Mega Sales", columns: "Order No | Item Code | Order Date | Customer Name | Item Name | Bonus Qty | Discount Qty | Amount" },
];

interface PharmaPreviewSheet {
  sheetName: string;
  kind: string;
  rows: number;
  note?: string;
}

interface PharmaPreview {
  fileName: string;
  sheets: PharmaPreviewSheet[];
  sheetCount: number;
  importableSheets: number;
  importableRows: number;
}

function ImportView() {
  const mutation = usePharmacyImport();
  const [kindOption, setKindOption] = useState("auto");
  const [overwrite, setOverwrite] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<PharmaPreview | null>(null);
  const [previewPending, setPreviewPending] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [showFormatGuide, setShowFormatGuide] = useState(false);
  const [result, setResult] = useState<Awaited<ReturnType<typeof mutation.mutateAsync>> | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!mutation.isPending) return;
    const started = Date.now();
    const t = setInterval(() => setElapsed(Math.floor((Date.now() - started) / 1000)), 500);
    return () => clearInterval(t);
  }, [mutation.isPending]);

  async function runPreview(nextFile: File) {
    setFile(nextFile);
    setPreview(null);
    setPreviewError(null);
    setResult(null);
    setPreviewPending(true);
    try {
      const form = new FormData();
      form.set("file", nextFile);
      const res = await fetch("/api/pharmacy/import/preview", { method: "POST", body: form });
      const body = (await res.json().catch(() => ({}))) as PharmaPreview & { message?: string };
      if (!res.ok) throw new Error(body.message ?? "Preview failed");
      setPreview(body);
    } catch (e) {
      setPreviewError(e instanceof Error ? e.message : "Preview failed");
    } finally {
      setPreviewPending(false);
    }
  }

  function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    void runPreview(files[0]);
  }

  function handleConfirm() {
    if (!file) return;
    const form = new FormData();
    form.set("file", file);
    if (kindOption !== "auto") form.set("onlyKind", kindOption);
    if (overwrite) form.set("overwrite", "true");
    setElapsed(0);
    mutation.mutate(form, {
      onSuccess: (d) => {
        setResult(d);
        setFile(null);
        setPreview(null);
        if (fileInputRef.current) fileInputRef.current.value = "";
      },
    });
  }

  function handleReset() {
    setFile(null);
    setPreview(null);
    setPreviewError(null);
    setResult(null);
    mutation.reset();
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Pharmacy Import</h1>
        </div>
        {(file || result) && (
          <Button variant="outline" size="sm" onClick={handleReset}>
            <RotateCcw className="mr-2 h-4 w-4" />
            Start over
          </Button>
        )}
      </div>

      {/* Step 1 — type + file */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">1. Choose type &amp; upload workbook</CardTitle>
          <CardDescription>
            Auto-detect (default)
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm text-muted-foreground">Type:</span>
            <Select value={kindOption} onValueChange={(v) => setKindOption(v ?? "auto")}>
              <SelectTrigger className="w-64">
                <span className="truncate">{kindOption === "auto" ? "✨ Auto-detect (all sheets)" : PHARMA_KIND_HINTS.find((h) => h.kind === kindOption)?.label ?? kindOption}</span>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="auto">✨ Auto-detect (all sheets)</SelectItem>
                {PHARMA_KIND_HINTS.map((h) => (
                  <SelectItem key={h.kind} value={h.kind}>{h.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {kindOption !== "auto" && (
            <p className="text-xs text-muted-foreground">
              Expected columns for <span className="font-semibold">{PHARMA_KIND_HINTS.find((h) => h.kind === kindOption)?.label}</span>:{" "}
              <code className="text-[11px]">{PHARMA_KIND_HINTS.find((h) => h.kind === kindOption)?.columns}</code>
            </p>
          )}
          <div
            role="button"
            tabIndex={0}
            onClick={() => fileInputRef.current?.click()}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") fileInputRef.current?.click();
            }}
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setIsDragging(false);
              handleFiles(e.dataTransfer.files);
            }}
            className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-8 text-center transition-colors ${
              isDragging ? "border-sky-500 bg-sky-500/10" : "border-border hover:border-sky-500/50"
            }`}
          >
            <Upload className="h-8 w-8 text-muted-foreground" />
            <div className="text-sm">
              <span className="font-semibold text-sky-500">Click to browse</span> or drag &amp; drop
              your workbook here
            </div>
            <div className="text-xs text-muted-foreground">.xlsx, .xls, .csv — max 10MB</div>
            {file && (
              <Badge variant="secondary" className="mt-1">
                <FileSpreadsheet className="mr-1 h-3 w-3" />
                {file.name}
              </Badge>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              className="hidden"
              disabled={mutation.isPending || previewPending}
              onChange={(e) => handleFiles(e.target.files)}
            />
          </div>
        </CardContent>
      </Card>

      <div className="flex items-center justify-between gap-3 border-b border-border pb-4">
        <p className="text-xs text-muted-foreground">Auto-detect is recommended. Preview never writes data until you confirm.</p>
        <Button variant="ghost" size="sm" onClick={() => setShowFormatGuide((open) => !open)}>
          {showFormatGuide ? "Hide format guide" : "View format guide"}
          {showFormatGuide ? <ChevronUp data-icon="inline-end" /> : <ChevronDown data-icon="inline-end" />}
        </Button>
      </div>
      {showFormatGuide && (
        <Card>
          <CardHeader><CardTitle className="text-base">Workbook format guide</CardTitle><CardDescription>Required headers by import type.</CardDescription></CardHeader>
          <CardContent className="grid gap-2 md:grid-cols-2">
            {PHARMA_KIND_HINTS.map((h) => <div key={h.kind} className="rounded-lg border border-border p-3"><Badge variant="outline">{h.label}</Badge><p className="mt-2 text-xs text-muted-foreground">{h.columns}</p></div>)}
          </CardContent>
        </Card>
      )}

      {/* Step 2 — preview */}
      {previewPending && (
        <Card>
          <CardContent className="flex items-center justify-center gap-2.5 py-10 text-sm text-muted-foreground">
            <Spinner className="size-5" />
            <span>Parsing workbook…</span>
          </CardContent>
        </Card>
      )}

      {previewError && (
        <Card className="border-amber-500/40">
          <CardContent className="flex items-center gap-2 pt-6 text-sm text-amber-600">
            <AlertTriangle className="h-5 w-5" />
            {previewError} — stock year/month စစ်ပါ။
          </CardContent>
        </Card>
      )}

      {preview && !result && (
        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <CardTitle className="text-base">
                  2. Preview — {preview.fileName}{" "}
                  <Badge variant="secondary" className="ml-1">
                    {preview.importableSheets}/{preview.sheetCount} sheets · {preview.importableRows.toLocaleString()} rows
                  </Badge>
                </CardTitle>
                <CardDescription>
                  Unknown/skip တဲ့ sheet တွေသွင်းမှာ မဟုတ်။ Confirm နှိပ်မှ DB ထဲရေးမယ်။
                  {kindOption !== "auto" && ` Type filter: ${PHARMA_KIND_HINTS.find((h) => h.kind === kindOption)?.label} only.`}
                </CardDescription>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <input
                    type="checkbox"
                    checked={overwrite}
                    onChange={(e) => setOverwrite(e.target.checked)}
                    disabled={mutation.isPending}
                    className="h-3.5 w-3.5 accent-sky-600"
                  />
                  Overwrite existing
                </label>
                <Button size="sm" onClick={handleConfirm} disabled={mutation.isPending}>
                  {mutation.isPending ? (
                    <>
                      <Spinner data-icon="inline-start" />
                      Importing… {elapsed}s
                    </>
                  ) : (
                    <>Confirm import{kindOption !== "auto" ? ` (${PHARMA_KIND_HINTS.find((h) => h.kind === kindOption)?.label})` : ""}</>
                  )}
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {mutation.isPending && (
              <p className="mb-3 text-sm text-muted-foreground">
                ပြီးသည်အထိ ဒီ page မှာနေ (refresh မလုပ်နဲ့)
              </p>
            )}
            <div className="overflow-x-auto rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Sheet</TableHead>
                    <TableHead>Kind</TableHead>
                    <TableHead className="text-right">Rows</TableHead>
                    <TableHead>Note</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {preview.sheets
                    .filter((s) => kindOption === "auto" || s.kind === kindOption)
                    .map((s) => (
                    <TableRow key={s.sheetName} className={s.kind === "unknown" ? "opacity-50" : undefined}>
                      <TableCell className="whitespace-nowrap text-sm">{s.sheetName}</TableCell>
                      <TableCell><Badge variant="outline">{s.kind}</Badge></TableCell>
                      <TableCell className="text-right">{s.rows.toLocaleString()}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{s.note ?? "—"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 3 — result */}
      {result && (
        <Card className="border-emerald-500/40">
          <CardHeader>
            <div className="flex items-center gap-2 text-emerald-600">
              <CheckCircle2 className="h-6 w-6" />
              <span className="text-lg font-semibold">
                {result.fileName} — +{result.created} new, {result.updated} updated
              </span>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <Table>
              <TableHeader><TableRow><TableHead>Sheet</TableHead><TableHead>Kind</TableHead><TableHead className="text-right">Rows</TableHead><TableHead className="text-right">Created</TableHead><TableHead className="text-right">Updated</TableHead><TableHead className="text-right">Skipped</TableHead><TableHead className="text-right">Errors</TableHead></TableRow></TableHeader>
              <TableBody>
                {result.sheets.map((s) => (
                  <TableRow key={s.sheetName}>
                    <TableCell>{s.sheetName}</TableCell>
                    <TableCell><Badge variant="outline">{s.kind}</Badge></TableCell>
                    <TableCell className="text-right">{s.total}</TableCell>
                    <TableCell className="text-right">{s.created}</TableCell>
                    <TableCell className="text-right">{s.updated}</TableCell>
                    <TableCell className="text-right">{s.skipped}</TableCell>
                    <TableCell className="text-right">
                      {s.errors.length > 0 ? (
                        <Badge variant="destructive" title={s.errors.slice(0, 5).map((e) => `row ${e.row}: ${e.reason}`).join("\n")}>
                          {s.errors.length}
                        </Badge>
                      ) : (
                        "0"
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" onClick={handleReset}>
                Import another file
              </Button>
            </div>
            {result.created === 0 && result.updated === 0 && (
              <p className="text-xs text-muted-foreground">
                Nothing new — ဒီဖိုင်သွင်းပြီးသား (importKey dedup)။ ပြင်ထားတဲ့ data ပြန်သွင်းချင်ရင် file ပြန်တင် → preview → Overwrite existing ✓ → Confirm။
              </p>
            )}
          </CardContent>
        </Card>
      )}

    </div>
  );
}

// ─── Team ────────────────────────────────────────────────────────────────────

function TeamView() {
  const filter = useDateFilter("pharmacy_filter:team", { defaultPeriod: "month" });
  const periodKey = filterToPeriodKey(filter);
  const q = usePharmacyTeam(periodKey, filter.isReady);
  const d = q.data;
  const teamTotals = useMemo(() => {
    const rows = d?.bySalesperson ?? [];
    return {
      collected: rows.reduce((sum, row) => sum + row.collected, 0),
      outstanding: rows.reduce((sum, row) => sum + row.outstanding, 0),
      overdue: rows.reduce((sum, row) => sum + row.overdue, 0),
      paid: rows.reduce((sum, row) => sum + row.paidCount, 0),
      reps: rows.length,
    };
  }, [d?.bySalesperson]);
  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-[-0.03em] text-foreground">Team KPI</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Salesperson collection + AR + area sales ({periodKey})။</p>
        </div>
        <div className="workspace-filter flex flex-wrap items-center gap-2">
          <PeriodFilterBar
            filter={filter}
            isLoading={q.isFetching && !q.isPending}
            action={<ScopedDeleteButton scope="sales" label="team sales data" />}
          />
        </div>
      </div>
      {q.isPending && <Loading />}
      {q.isError && <ErrorBox message="Team load မရပါ။" onRetry={() => q.refetch()} />}
      {d && (
        <>
          <FadeIn className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <FinanceKpiCard label="Collected" value={mmk(teamTotals.collected)} unit={`MMK · ${teamTotals.paid} paid`} detail="Team collections in selected period" status="Collected" icon={Wallet} accentClass="border-l-emerald-500" />
            <FinanceKpiCard label="Outstanding AR" value={mmk(teamTotals.outstanding)} unit="MMK" detail={`${teamTotals.reps} active salespeople`} status="Open" icon={Users} accentClass="border-l-sky-500" />
            <FinanceKpiCard label="Overdue AR" value={mmk(teamTotals.overdue)} unit="MMK" detail="Needs collection follow-up" status={teamTotals.overdue > 0 ? "Review" : "Clear"} icon={AlertTriangle} accentClass={teamTotals.overdue > 0 ? "border-l-red-500" : "border-l-emerald-500"} />
            <FinanceKpiCard label="Coverage Areas" value={mmk(d.byArea.length)} unit="areas" detail={`${teamTotals.reps} people reporting`} status="Tracked" icon={BarChart3} accentClass="border-l-violet-500" />
          </FadeIn>
          <section className="bg-card border-2 border-slate-300 dark:border-slate-800 p-6 rounded-xl shadow-sm">
            <div className="flex justify-between items-center mb-4 border-b-2 border-border pb-3">
              <h3 className="font-bold text-foreground text-sm tracking-wide uppercase flex items-center gap-2">
                <Users className="w-4 h-4 text-sky-500" />Salesperson Scoreboard
              </h3>
            </div>
            {(d.bySalesperson ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground">Receivable မှာ salesperson မရှိသေးပါ — data သွင်းပြီးမှ ပေါ်မယ်။</p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Salesperson</TableHead>
                      <TableHead className="text-right">Collected</TableHead>
                      <TableHead className="text-right">Paid</TableHead>
                      <TableHead className="text-right">Outstanding</TableHead>
                      <TableHead className="text-right">Overdue</TableHead>
                      <TableHead className="text-right">Rate</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {d.bySalesperson.map((t) => (
                      <TableRow key={t.salesperson}>
                        <TableCell className="font-bold text-sm">{t.salesperson}</TableCell>
                        <TableCell className="text-right font-extrabold text-emerald-600 dark:text-emerald-400">{mmk(t.collected)}</TableCell>
                        <TableCell className="text-right text-muted-foreground">{t.paidCount}</TableCell>
                        <TableCell className="text-right font-bold">{mmk(t.outstanding)}</TableCell>
                        <TableCell className={`text-right font-bold ${t.overdue > 0 ? "text-amber-600" : "text-muted-foreground"}`}>
                          {t.overdue > 0 ? mmk(t.overdue) : "—"}
                        </TableCell>
                        <TableCell className="text-right">
                          <Badge variant={t.collectionRate >= 80 ? "secondary" : "outline"}>{t.collectionRate}%</Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </section>
          {(d.byArea ?? []).length > 0 && (
            <section className="bg-card border-2 border-slate-300 dark:border-slate-800 p-6 rounded-xl shadow-sm">
              <div className="flex justify-between items-center mb-4 border-b-2 border-border pb-3">
                <h3 className="font-bold text-foreground text-sm tracking-wide uppercase flex items-center gap-2">
                  <BarChart3 className="w-4 h-4 text-violet-500" />Sales by TSP Area
                </h3>
              </div>
              <CommerceBarChart unit="MMK" data={d.byArea.map((a) => ({ label: a.area, value: a.amount }))} />
            </section>
          )}
        </>
      )}
    </div>
  );
}

export function PharmacyWorkspace({ workspace }: { workspace: PharmacyWorkspaceKind }) {
  const content = (() => {
    switch (workspace) {
      case "sales": return <SalesView />;
      case "ar": return <ArView />;
      case "inventory": return <InventoryView />;
      case "payables": return <PayablesView />;
      case "team": return <TeamView />;
      case "import": return <ImportView />;
      default: return <OverviewView />;
    }
  })();
  return <div className="pharmacy-workspace">{content}</div>;
}
