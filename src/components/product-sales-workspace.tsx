'use client';

import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';

import {
  AlertTriangle,
  BarChart3,
  Bot,
  CalendarCheck,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  DollarSign,
  LineChart,
  Megaphone,
  Package,
  Percent,
  Pencil,
  Phone,
  Plus,
  ReceiptText,
  Server,
  Target,
  Trophy,
  Trash2,
  TrendingUp,
  Users,
  Wallet,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import {
  useCommerceDashboard,
  useCommerceRecommendations,
  useCommerceWorkspaces,
  useSaveCommerceTargets,
} from '@/hooks/use-commerce-dashboard';
import type {
  CommerceActionRecommendation,
  CommerceDashboard,
  CommerceDashboardParams,
  CommerceWorkspaceData,
  DealRecord,
  MarketingMetricRecord,
  ProductRecord,
} from '@/lib/api';
import { commerceDashboardKeys } from '@/hooks/use-commerce-dashboard';
import { dealsKeys, useDeals } from '@/hooks/use-deals';
import { marketingMetricKeys, useMarketingMetrics } from '@/hooks/use-marketing-metrics';
import { trashKeys } from '@/hooks/use-trash';
import { useDateFilter } from '@/hooks/use-date-filter';
import { CustomerServiceView } from '@/components/customer-service-view';
import { commerceCustomersKeys } from '@/hooks/use-commerce-customers';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { toast } from 'sonner';

import {
  CommerceBarChart,
  CommerceLineChart,
  ExpenseBreakdownChart,
  FinanceTimelineChart,
  MarketingPerformanceChart,
  amount,
} from '@/components/commerce-charts';
import {
  FinanceKpiCard,
  ProgressCard,
  SmartSuggestions,
} from '@/components/commerce-cards';

type Workspace = 'overview' | 'finance' | 'sales' | 'marketing' | 'customers' | 'inventory';

function periodRangeLabel(
  period: string,
  year: number,
  month: number,
  day: number,
  customFrom: string,
  customTo: string,
): string {
  if (period === 'overall') return 'Overall';
  if (period === 'year') return `Year ${year}`;
  if (period === 'day') return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  if (period === 'custom') return `${customFrom} → ${customTo}`;
  return new Date(year, month - 1).toLocaleString('en', { month: 'long', year: 'numeric' });
}





function BusinessOverviewAnalytics({ periodLabel, dashboard }: { periodLabel: string; dashboard?: CommerceDashboard }) {
  const products = dashboard?.analytics.topProducts ?? [];
  const intelligence = dashboard?.analytics.liveIntelligence ?? [
    { area: 'Finance', text: 'Revenue data will appear after Commerce sales are recorded.' },
    { area: 'Sales', text: 'Order fulfillment signals will appear after deals are recorded.' },
    { area: 'Inventory', text: 'Inventory signals will appear after products are added.' },
    { area: 'System', text: 'Telegram Bot status will appear after Commerce messages are processed.' },
  ];
  const icons = [DollarSign, Phone, Server, Bot];
  const iconClasses = [
    'bg-emerald-900/50 border-emerald-500/30 text-emerald-400',
    'bg-sky-900/50 border-sky-500/30 text-sky-400',
    'bg-amber-900/50 border-amber-500/30 text-amber-400',
    'bg-blue-900/50 border-blue-500/30 text-blue-400',
  ];
  return (
    <>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <section className="bg-card border-2 border-slate-300 dark:border-slate-800 p-6 flex flex-col h-full rounded-xl shadow-sm hover:shadow-lg transition-all duration-200">
          <div className="flex items-center gap-3 mb-4 border-b-2 border-border pb-3">
            <div className="w-8 h-8 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center"><Trophy className="text-amber-500 w-4 h-4" /></div>
            <h3 className="font-bold text-foreground">Top Performing Products</h3>
          </div>
          <div className="overflow-x-auto flex-1"><table className="w-full text-left text-sm"><thead><tr className="text-muted-foreground uppercase text-[10px] font-extrabold tracking-wider border-b-2 border-border"><th className="pb-3 pt-2">Product</th><th className="pb-3 pt-2 text-center">Qty</th><th className="pb-3 pt-2 text-right">Income (MMK)</th></tr></thead><tbody className="divide-y-2 divide-border/50">{products.length ? products.map((product, idx) => <tr key={`${product.sku ?? product.name}-${idx}`} className="hover:bg-muted/30 transition"><td className="py-3.5 font-bold text-foreground">{product.name}</td><td className="py-3.5 text-center text-muted-foreground font-bold">{product.quantity}</td><td className="py-3.5 text-right font-extrabold text-sky-600 dark:text-sky-400">{amount(product.income)}</td></tr>) : <tr><td colSpan={3} className="py-8 text-center text-sm font-semibold text-muted-foreground">No product sales yet for this period.</td></tr>}</tbody></table></div>
        </section>
        <section className="p-6 flex-1 flex flex-col bg-slate-800 dark:bg-slate-900 border-none text-slate-300 shadow-xl relative overflow-hidden rounded-xl">
          <h3 className="text-sm font-bold text-white mb-6 flex items-center gap-3 border-b border-slate-700 pb-4 z-10 relative"><span className="w-2.5 h-2.5 bg-emerald-500 rounded-full animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.8)]" />Live Intelligence Data</h3>
          <div className="space-y-5 text-sm z-10 relative">
            {intelligence.map((item, index) => {
              const Icon = icons[index] ?? Bot;
              return <div key={`${item.area}-${index}`} className="flex items-start gap-4"><div className={`w-8 h-8 rounded-lg border flex items-center justify-center flex-shrink-0 ${iconClasses[index] ?? iconClasses[3]}`}><Icon className="w-4 h-4" /></div><p className="mt-1"><span className="font-bold text-white">{item.area}:</span> {item.text}</p></div>;
            })}
          </div>
        </section>
      </div>
      <div className="space-y-6">
        <section className="bg-card border-2 border-slate-300 dark:border-slate-800 p-6 rounded-xl shadow-sm"><div className="flex justify-between items-center mb-6 border-b-2 border-border pb-4"><h3 className="font-bold text-foreground text-sm tracking-wide uppercase flex items-center gap-2"><LineChart className="w-4 h-4 text-sky-500" />Daily Income Trend (MMK)</h3><span className="text-xs font-bold text-muted-foreground border-2 border-border bg-muted px-3 py-1 rounded-full">{periodLabel}</span></div><CommerceLineChart data={dashboard?.analytics.incomeTrend ?? []} /></section>
        <section className="bg-card border-2 border-slate-300 dark:border-slate-800 p-6 rounded-xl shadow-sm"><div className="flex justify-between items-center mb-6 border-b-2 border-border pb-4"><h3 className="font-bold text-foreground text-sm tracking-wide uppercase flex items-center gap-2"><BarChart3 className="w-4 h-4 text-sky-500" />Daily Order Volume</h3><span className="text-xs font-bold text-muted-foreground border-2 border-border bg-muted px-3 py-1 rounded-full">{periodLabel}</span></div><CommerceBarChart data={dashboard?.analytics.orderTrend ?? []} /></section>
      </div>
    </>
  );
}





type FinanceEntryView = CommerceWorkspaceData['finance']['accounting']['entries'][number];
type FinanceEntryForm = {
  entryDate: string;
  title: string;
  amount: string;
  cashType: string;
  accountingType: string;
  status: string;
  counterparty: string;
  dueDate: string;
  voucherNumber: string;
  notes: string;
};

const financeEntryTypes = [
  ['salary', 'Salary', 'Payroll costs', Wallet, 'border-l-sky-500'],
  ['cogs', 'COGS', 'Cost of goods sold', Package, 'border-l-violet-500'],
  ['operating_expense', 'Operating Expenses', 'Running costs', ReceiptText, 'border-l-amber-500'],
  ['payment', 'Payments', 'Payment records', DollarSign, 'border-l-emerald-500'],
  ['receivable', 'Receivables', 'Outstanding income', Users, 'border-l-cyan-500'],
  ['debt', 'Debt', 'Outstanding liabilities', Wallet, 'border-l-rose-500'],
  ['voucher', 'Vouchers', 'Supporting records', ReceiptText, 'border-l-slate-500'],
  ['owner_capital', 'Owner Capital', 'Business investment', Wallet, 'border-l-indigo-500'],
] as const;

const financeStatuses = ['recorded', 'pending', 'paid', 'settled', 'overdue'];

function financeTypeLabel(value: string) {
  return financeEntryTypes.find(([key]) => key === value)?.[1] ?? value.replaceAll('_', ' ');
}

function defaultCashType(accountingType: string) {
  if (accountingType === 'owner_capital') return 'Capital';
  if (['payment', 'receivable', 'voucher'].includes(accountingType)) return 'Income';
  return 'Expense';
}

function FinanceWorkspace({ data, recommendations, isRecommendationsLoading, defaultDate }: { data?: CommerceWorkspaceData['finance']; recommendations?: CommerceActionRecommendation[]; isRecommendationsLoading: boolean; defaultDate?: string }) {
  const queryClient = useQueryClient();
  const today = new Date().toISOString().slice(0, 10);
  const getEmptyForm = (): FinanceEntryForm => ({
    entryDate: defaultDate || data?.accounting.entries[0]?.date || today,
    title: '',
    amount: '',
    cashType: 'Expense',
    accountingType: 'operating_expense',
    status: 'recorded',
    counterparty: '',
    dueDate: '',
    voucherNumber: '',
    notes: '',
  });
  const monthly: [string, number, number][] = data?.timeline.length ? data.timeline.map((item) => [item.label, item.revenue, item.expense]) : [['Feb', 0, 0], ['Mar', 0, 0], ['Apr', 0, 0], ['May', 0, 0], ['Jun', 0, 0], ['Jul', 0, 0]];
  const breakdown: [string, number, number, string][] = data?.expenseBreakdown.length ? data.expenseBreakdown.map((item, index) => [item.category, item.percent, item.value, ['#0ea5e9', '#94a3b8', '#f59e0b', '#64748b', '#8b5cf6'][index] ?? '#64748b']) : [];
  const [typeFilter, setTypeFilter] = useState('All');
  const [statusFilter, setStatusFilter] = useState('All');
  const [page, setPage] = useState(1);
  const [recordDialogOpen, setRecordDialogOpen] = useState(false);
  const [editingRecord, setEditingRecord] = useState<FinanceEntryView | null>(null);
  const [deleteRecord, setDeleteRecord] = useState<FinanceEntryView | null>(null);
  const [recordForm, setRecordForm] = useState<FinanceEntryForm>(getEmptyForm);
  const [isSavingRecord, setIsSavingRecord] = useState(false);
  const [isDeletingRecord, setIsDeletingRecord] = useState(false);
  const accountingEntries = data?.accounting.entries ?? [];
  const filteredRecords = accountingEntries.filter((record) => {
    const cashLabel = record.cashType === 'Income' || record.cashType === 'Capital' ? record.cashType : 'Expense';
    return (typeFilter === 'All' || cashLabel === typeFilter || record.accountingType === typeFilter) && (statusFilter === 'All' || record.status === statusFilter);
  });
  const pageSize = 10;
  const totalPages = Math.max(1, Math.ceil(filteredRecords.length / pageSize));
  const pagedRecords = filteredRecords.slice((page - 1) * pageSize, page * pageSize);
  const accountingTotals = data?.accounting.totals ?? {};
  const accountingExpenseTotal = (accountingTotals.salary ?? 0) + (accountingTotals.cogs ?? 0) + (accountingTotals.operating_expense ?? 0);

  const updateForm = (key: keyof FinanceEntryForm, value: string) => {
    setRecordForm((current) => ({
      ...current,
      [key]: value,
      ...(key === 'accountingType' ? { cashType: defaultCashType(value) } : {}),
    }));
  };
  const refreshFinance = async () => {
    await queryClient.invalidateQueries({ queryKey: commerceDashboardKeys.all });
  };
  const openAddRecord = () => {
    setEditingRecord(null);
    setRecordForm(getEmptyForm());
    setRecordDialogOpen(true);
  };
  const openEditRecord = (record: FinanceEntryView) => {
    setEditingRecord(record);
    setRecordForm({
      entryDate: record.date,
      title: record.title,
      amount: String(record.amount),
      cashType: record.cashType || defaultCashType(record.accountingType),
      accountingType: record.accountingType,
      status: record.status || 'recorded',
      counterparty: record.counterparty ?? '',
      dueDate: record.dueDate ?? '',
      voucherNumber: record.voucherNumber ?? '',
      notes: record.notes ?? '',
    });
    setRecordDialogOpen(true);
  };
  const saveRecord = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const numericAmount = Number(recordForm.amount);
    if (!recordForm.title.trim() || !Number.isFinite(numericAmount) || numericAmount <= 0) {
      toast.error('Enter a description and a positive amount');
      return;
    }
    setIsSavingRecord(true);
    const payload = {
      entryDate: recordForm.entryDate,
      title: recordForm.title.trim(),
      amount: numericAmount,
      cashType: recordForm.cashType,
      accountingType: recordForm.accountingType,
      status: recordForm.status,
      counterparty: recordForm.counterparty.trim() || null,
      dueDate: recordForm.dueDate || null,
      voucherNumber: recordForm.voucherNumber.trim() || null,
      notes: recordForm.notes.trim() || null,
    };
    const response = await fetch(editingRecord ? `/api/commerce/finance/entries/${editingRecord.id}` : '/api/commerce/finance/entries', {
      method: editingRecord ? 'PATCH' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    setIsSavingRecord(false);
    if (!response.ok) {
      toast.error(editingRecord ? 'Could not update finance record' : 'Could not add finance record');
      return;
    }
    toast.success(editingRecord ? 'Finance record updated' : 'Finance record added');
    setRecordDialogOpen(false);
    await refreshFinance();
  };
  const confirmDeleteRecord = async () => {
    if (!deleteRecord) return;
    setIsDeletingRecord(true);
    const response = await fetch(`/api/commerce/finance/entries/${deleteRecord.id}`, { method: 'DELETE' });
    setIsDeletingRecord(false);
    if (!response.ok) {
      toast.error('Could not delete finance record');
      return;
    }
    toast.success('Finance record moved to Trash');
    setDeleteRecord(null);
    await refreshFinance();
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <FinanceKpiCard label="Total Revenue" value={amount(data?.kpis.revenue ?? 0)} unit="MMK" icon={DollarSign} accentClass="border-l-4 border-l-sky-500" />
        <FinanceKpiCard label="Total Expense" value={amount(data?.kpis.expense ?? 0)} unit="MMK" icon={ReceiptText} accentClass="border-l-4 border-l-red-500" />
        <FinanceKpiCard label="Profit / Loss" value={amount(data?.kpis.profit ?? 0)} unit="MMK" icon={TrendingUp} accentClass="border-l-4 border-l-emerald-500" />
        <FinanceKpiCard label="Profit Margin" value={`${(data?.kpis.profitMargin ?? 0).toFixed(1)}%`} icon={Percent} accentClass="border-l-4 border-l-emerald-500" />
      </div>

      <SmartSuggestions recommendations={recommendations} isLoading={isRecommendationsLoading} areaFilter="finance" />

      <div className="space-y-6">
        <section className="rounded-xl border-2 border-slate-200 bg-card shadow-sm dark:border-slate-800"><div className="p-6"><h2 className="border-b-2 border-slate-100 pb-3 text-sm font-bold uppercase tracking-wide text-slate-900 dark:border-slate-800 dark:text-slate-100">Revenue vs Expense Timeline</h2></div><div className="px-4 pb-5 sm:px-6">{monthly.every(([, revenue, expense]) => revenue === 0 && expense === 0) ? <p className="py-12 text-center text-sm text-slate-500">No timeline data yet.</p> : <FinanceTimelineChart monthly={monthly} />}</div></section>
        <section className="rounded-xl border-2 border-slate-200 bg-card shadow-sm dark:border-slate-800"><div className="p-6"><h2 className="border-b-2 border-slate-100 pb-3 text-sm font-bold uppercase tracking-wide text-slate-900 dark:border-slate-800 dark:text-slate-100">Expense Breakdown</h2></div><div className="p-5 sm:p-6">{breakdown.length === 0 ? <p className="py-12 text-center text-sm text-slate-500">No expense breakdown yet.</p> : <ExpenseBreakdownChart items={breakdown} />}</div></section>
      </div>

      <section id="finance-records-table" className="overflow-hidden rounded-xl border-2 border-slate-200 bg-card shadow-sm dark:border-slate-800">
        <div className="border-b-2 border-slate-200 bg-slate-50/70 p-5 dark:border-slate-800 dark:bg-slate-950/40">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="flex items-center gap-2 text-lg font-black text-slate-900 dark:text-slate-100"><ClipboardList className="h-5 w-5 text-sky-600" />Finance Records</h2>
              <p className="mt-1 text-sm text-muted-foreground">Income, expenses, accounting category, status, counterparty, due date, voucher, and payment context in one table.</p>
            </div>
            <Button size="sm" className="h-10 w-fit cursor-pointer bg-sky-600 px-4 hover:bg-sky-700 text-white font-bold" onClick={openAddRecord}><Plus className="mr-1.5 h-4 w-4" />Add record</Button>
          </div>
        </div>
        <div className="space-y-5 p-5">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <FinanceKpiCard label="Accounting Expenses" value={amount(accountingExpenseTotal)} unit="MMK" icon={ReceiptText} accentClass="border-l-4 border-l-red-500" />
            <FinanceKpiCard label="Open Receivables" value={amount(accountingTotals.receivable ?? 0)} unit="MMK" icon={Users} accentClass="border-l-4 border-l-cyan-500" />
            <FinanceKpiCard label="Open Debt" value={amount(accountingTotals.debt ?? 0)} unit="MMK" icon={Wallet} accentClass="border-l-4 border-l-rose-500" />
            <FinanceKpiCard label="Vouchers" value={String(accountingEntries.filter((entry) => entry.accountingType === 'voucher').length)} unit="records" icon={ReceiptText} accentClass="border-l-4 border-l-slate-500" />
          </div>
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <p className="text-sm font-bold text-slate-700 dark:text-slate-300">Showing {Math.min(pageSize, pagedRecords.length)} of {filteredRecords.length} records</p>
            <div className="flex flex-wrap gap-2">
              <Select value={typeFilter} onValueChange={(value) => { if (value) { setTypeFilter(value); setPage(1); } }}><SelectTrigger className="h-10 w-56 rounded-lg border-2 border-slate-200 bg-card text-sm font-bold text-slate-800 dark:border-slate-800 dark:text-slate-200">{typeFilter === 'All' ? 'All' : financeTypeLabel(typeFilter)}</SelectTrigger><SelectContent><SelectItem value="All">All</SelectItem><SelectItem value="Income">Income</SelectItem><SelectItem value="Expense">Expense</SelectItem><SelectItem value="Capital">Capital</SelectItem>{financeEntryTypes.map(([key, label]) => <SelectItem key={key} value={key}>{label}</SelectItem>)}</SelectContent></Select>
              <Select value={statusFilter} onValueChange={(value) => { if (value) { setStatusFilter(value); setPage(1); } }}><SelectTrigger className="h-10 w-44 rounded-lg border-2 border-slate-200 bg-card text-sm font-bold capitalize text-slate-800 dark:border-slate-800 dark:text-slate-200">{statusFilter}</SelectTrigger><SelectContent><SelectItem value="All">All</SelectItem>{financeStatuses.map((status) => <SelectItem key={status} value={status}>{status}</SelectItem>)}</SelectContent></Select>
            </div>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-[1280px] w-full text-left text-sm">
            <thead className="border-y-2 border-slate-200 bg-slate-50/60 text-[10px] font-extrabold uppercase tracking-wider text-slate-500 dark:border-slate-800 dark:bg-slate-950/40">
              <tr>{['Date', 'Description', 'Type', 'Amount (MMK)', 'Accounting Type', 'Status', 'Counterparty', 'Due Date', 'Voucher / Ref', 'Payment / Notes', 'Actions'].map((heading) => <th key={heading} className={`px-5 py-4 ${heading === 'Amount (MMK)' ? 'text-right' : heading === 'Actions' ? 'text-center' : ''}`}>{heading}</th>)}</tr>
            </thead>
            <tbody className="divide-y-2 divide-slate-100 dark:divide-slate-900">
              {pagedRecords.map((record) => {
                const signedAmount = record.cashType === 'Expense' ? `-${amount(record.amount)}` : amount(record.amount);
                return (
                  <tr key={record.id} className="transition hover:bg-slate-50 dark:hover:bg-slate-950/50">
                    <td className="whitespace-nowrap px-5 py-4 text-xs font-bold text-slate-600 dark:text-slate-400">{record.date}</td>
                    <td className="max-w-64 px-5 py-4 text-xs font-bold text-slate-900 dark:text-slate-100">{record.title}</td>
                    <td className="px-5 py-4"><span className={`rounded border-2 px-2.5 py-1 text-[10px] font-extrabold ${record.cashType === 'Income' || record.cashType === 'Capital' ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-red-200 bg-red-50 text-red-700'}`}>{record.cashType.toUpperCase()}</span></td>
                    <td className={`whitespace-nowrap px-5 py-4 text-right text-sm font-black ${record.cashType === 'Expense' ? 'text-red-700' : 'text-emerald-700'}`}>{signedAmount}</td>
                    <td className="whitespace-nowrap px-5 py-4 text-xs font-semibold capitalize text-slate-600 dark:text-slate-400">{financeTypeLabel(record.accountingType)}</td>
                    <td className="px-5 py-4"><span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-1 text-[10px] font-bold lowercase text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">{record.status}</span></td>
                    <td className="max-w-40 px-5 py-4 text-xs font-semibold text-slate-600 dark:text-slate-400">{record.counterparty ?? '—'}</td>
                    <td className="whitespace-nowrap px-5 py-4 text-xs font-semibold text-slate-600 dark:text-slate-400">{record.dueDate ?? '—'}</td>
                    <td className="whitespace-nowrap px-5 py-4 text-xs font-bold text-slate-600 dark:text-slate-400">{record.voucherNumber ?? '—'}</td>
                    <td className="max-w-64 px-5 py-4 text-xs font-semibold text-slate-600 dark:text-slate-400">{record.notes ?? '—'}</td>
                    <td className="px-5 py-4"><div className="flex items-center justify-center gap-2"><Button aria-label={`Edit ${record.title}`} variant="ghost" size="icon" className="h-9 w-9 cursor-pointer text-blue-600 hover:text-blue-700" onClick={() => openEditRecord(record)}><Pencil className="h-4 w-4" /></Button><Button aria-label={`Delete ${record.title}`} variant="ghost" size="icon" className="h-9 w-9 cursor-pointer text-red-600 hover:text-red-700" onClick={() => setDeleteRecord(record)}><Trash2 className="h-4 w-4" /></Button></div></td>
                  </tr>
                );
              })}
              {filteredRecords.length === 0 && <tr><td colSpan={11} className="px-6 py-10 text-center text-sm text-slate-500">No finance records found for these filters.</td></tr>}
            </tbody>
          </table>
        </div>
        {filteredRecords.length > 0 && <div className="flex items-center justify-between border-t border-slate-200 bg-slate-50/60 px-6 py-3 dark:border-slate-800 dark:bg-slate-950/40"><span className="text-xs font-semibold text-muted-foreground">Showing {Math.min((page - 1) * pageSize + 1, filteredRecords.length)}-{Math.min(page * pageSize, filteredRecords.length)} of {filteredRecords.length}</span><div className="flex gap-2"><Button variant="outline" size="sm" className="h-8 cursor-pointer text-xs" disabled={page === 1} onClick={() => setPage((current) => Math.max(1, current - 1))}>Previous</Button><Button variant="outline" size="sm" className="h-8 cursor-pointer text-xs" disabled={page >= totalPages} onClick={() => setPage((current) => Math.min(totalPages, current + 1))}>Next</Button></div></div>}
      </section>
      <Dialog open={recordDialogOpen} onOpenChange={setRecordDialogOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader><DialogTitle>{editingRecord ? 'Edit finance record' : 'Add finance record'}</DialogTitle><DialogDescription>Record income, expenses, accounting category, status, voucher, and payment context.</DialogDescription></DialogHeader>
          <form className="grid gap-4" onSubmit={saveRecord}>
            <div className="grid gap-3 sm:grid-cols-2"><label className="grid gap-1 text-sm font-semibold">Date<Input type="date" value={recordForm.entryDate} onChange={(event) => updateForm('entryDate', event.target.value)} /></label><label className="grid gap-1 text-sm font-semibold">Amount (MMK)<Input type="number" min="1" value={recordForm.amount} onChange={(event) => updateForm('amount', event.target.value)} /></label></div>
            <label className="grid gap-1 text-sm font-semibold">Description<Input value={recordForm.title} onChange={(event) => updateForm('title', event.target.value)} placeholder="Record description" /></label>
            <div className="grid gap-3 sm:grid-cols-3"><label className="grid gap-1 text-sm font-semibold">Cash type<Select value={recordForm.cashType} onValueChange={(value) => updateForm('cashType', value ?? '')}><SelectTrigger>{recordForm.cashType}</SelectTrigger><SelectContent>{['Income', 'Expense', 'Capital'].map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}</SelectContent></Select></label><label className="grid gap-1 text-sm font-semibold">Accounting type<Select value={recordForm.accountingType} onValueChange={(value) => updateForm('accountingType', value ?? '')}><SelectTrigger>{financeTypeLabel(recordForm.accountingType)}</SelectTrigger><SelectContent>{financeEntryTypes.map(([key, label]) => <SelectItem key={key} value={key}>{label}</SelectItem>)}</SelectContent></Select></label><label className="grid gap-1 text-sm font-semibold">Status<Select value={recordForm.status} onValueChange={(value) => updateForm('status', value ?? '')}><SelectTrigger className="capitalize">{recordForm.status}</SelectTrigger><SelectContent>{financeStatuses.map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}</SelectContent></Select></label></div>
            <div className="grid gap-3 sm:grid-cols-2"><label className="grid gap-1 text-sm font-semibold">Counterparty<Input value={recordForm.counterparty} onChange={(event) => updateForm('counterparty', event.target.value)} placeholder="Supplier or customer" /></label><label className="grid gap-1 text-sm font-semibold">Due date<Input type="date" value={recordForm.dueDate} onChange={(event) => updateForm('dueDate', event.target.value)} /></label></div>
            <div className="grid gap-3 sm:grid-cols-2"><label className="grid gap-1 text-sm font-semibold">Voucher / Ref<Input value={recordForm.voucherNumber} onChange={(event) => updateForm('voucherNumber', event.target.value)} placeholder="INV-0001" /></label><label className="grid gap-1 text-sm font-semibold">Payment / Notes<Input value={recordForm.notes} onChange={(event) => updateForm('notes', event.target.value)} placeholder="Payment method, reference, or notes" /></label></div>
            <div className="flex justify-end gap-2 pt-2"><Button type="button" variant="outline" onClick={() => setRecordDialogOpen(false)}>Cancel</Button><Button type="submit" disabled={isSavingRecord}>{isSavingRecord ? 'Saving...' : editingRecord ? 'Save changes' : 'Add record'}</Button></div>
          </form>
        </DialogContent>
      </Dialog>
      <AlertDialog open={Boolean(deleteRecord)} onOpenChange={(open) => !open && setDeleteRecord(null)}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>Delete this finance record?</AlertDialogTitle><AlertDialogDescription>This will move the record to Trash using soft delete. It will no longer appear in Finance Records.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel disabled={isDeletingRecord}>Cancel</AlertDialogCancel><AlertDialogAction disabled={isDeletingRecord} className="bg-red-600 text-white hover:bg-red-700" onClick={confirmDeleteRecord}>{isDeletingRecord ? 'Deleting...' : 'Delete'}</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ─── Sales Workspace with Full CRUD Deals Table ─────────────────────────────

function SalesWorkspace({ data, recommendations, isRecommendationsLoading, dateFrom, dateTo }: { data?: CommerceWorkspaceData['sales']; recommendations?: CommerceActionRecommendation[]; isRecommendationsLoading: boolean; dateFrom?: string; dateTo?: string }) {
  const queryClient = useQueryClient();
  const {
    data: dealsData,
    isLoading: isLoadingDeals,
    isError: isDealsError,
    refetch: refetchDeals,
  } = useDeals({ dateFrom, dateTo });
  const deals = dealsData?.deals ?? [];
  const [stageFilter, setStageFilter] = useState('ALL');
  const [dealSearch, setDealSearch] = useState('');
  const [dealDialogOpen, setDealDialogOpen] = useState(false);
  const [editingDeal, setEditingDeal] = useState<DealRecord | null>(null);
  const [deleteDeal, setDeleteDeal] = useState<DealRecord | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const [dealForm, setDealForm] = useState({
    quotedAmount: '',
    stage: 'NEW_LEAD',
    fulfillmentStatus: 'PENDING',
    sourceChannel: 'Direct',
    note: '',
  });

  const openAddDeal = () => {
    setEditingDeal(null);
    setDealForm({
      quotedAmount: '',
      stage: 'NEW_LEAD',
      fulfillmentStatus: 'PENDING',
      sourceChannel: 'Direct',
      note: '',
    });
    setDealDialogOpen(true);
  };

  const openEditDeal = (deal: DealRecord) => {
    setEditingDeal(deal);
    setDealForm({
      quotedAmount: deal.quotedAmount ? String(deal.quotedAmount) : '',
      stage: deal.stage || 'NEW_LEAD',
      fulfillmentStatus: deal.fulfillmentStatus || 'PENDING',
      sourceChannel: deal.sourceChannel || 'Direct',
      note: deal.note || '',
    });
    setDealDialogOpen(true);
  };

  const saveDeal = async (e: FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      const payload: Record<string, unknown> = {
        stage: dealForm.stage,
        fulfillmentStatus: dealForm.fulfillmentStatus,
        sourceChannel: dealForm.sourceChannel,
        quotedAmount: dealForm.quotedAmount ? Number(dealForm.quotedAmount) : null,
        note: dealForm.note.trim() || null,
      };

      const res = await fetch('/api/deals', {
        method: editingDeal ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editingDeal ? { id: editingDeal.id, ...payload } : payload),
      });

      if (!res.ok) {
        const errorBody = await res.json().catch(() => null);
        throw new Error(
          typeof errorBody?.message === 'string' && errorBody.message
            ? errorBody.message
            : 'Failed to save deal',
        );
      }
      toast.success(editingDeal ? 'Deal updated' : 'Deal created');
      setDealDialogOpen(false);
      await queryClient.invalidateQueries({ queryKey: dealsKeys.all });
      await queryClient.invalidateQueries({ queryKey: commerceDashboardKeys.all });
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Error saving deal');
    } finally {
      setIsSaving(false);
    }
  };

  const confirmDeleteDeal = async () => {
    if (!deleteDeal) return;
    setIsDeleting(true);
    try {
      const res = await fetch(`/api/deals?id=${deleteDeal.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to delete deal');
      toast.success('Deal moved to Trash');
      setDeleteDeal(null);
      await queryClient.invalidateQueries({ queryKey: dealsKeys.all });
      await queryClient.invalidateQueries({ queryKey: commerceDashboardKeys.all });
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Error deleting deal');
    } finally {
      setIsDeleting(false);
    }
  };

  const filteredDeals = deals.filter((deal) => {
    const matchesStage = stageFilter === 'ALL' || deal.stage === stageFilter;
    const query = dealSearch.trim().toLowerCase();
    const matchesSearch = !query ||
      (deal.customer?.name && deal.customer.name.toLowerCase().includes(query)) ||
      (deal.note && deal.note.toLowerCase().includes(query)) ||
      (deal.sourceChannel && deal.sourceChannel.toLowerCase().includes(query));
    return matchesStage && matchesSearch;
  });

  const [dealPage, setDealPage] = useState(1);
  const dealPageSize = 10;
  const totalDealPages = Math.max(1, Math.ceil(filteredDeals.length / dealPageSize));
  const pagedDeals = filteredDeals.slice((dealPage - 1) * dealPageSize, dealPage * dealPageSize);

  const stageColors = [
    ['border-sky-500', 'bg-sky-50 dark:bg-sky-950/20'],
    ['border-violet-500', 'bg-violet-50 dark:bg-violet-950/20'],
    ['border-amber-500', 'bg-amber-50 dark:bg-amber-950/20'],
    ['border-emerald-500', 'bg-emerald-50 dark:bg-emerald-950/20'],
  ];
  const stages = (data?.stages.length ? data.stages : [
    { label: 'New Leads', count: 0, deals: [] },
    { label: 'Quoted', count: 0, deals: [] },
    { label: 'Pending Delivery', count: 0, deals: [] },
    { label: 'Closed Won', count: 0, deals: [] },
  ]).map((stage, index) => ({ ...stage, color: stageColors[index]?.[0] ?? 'border-slate-500', bg: stageColors[index]?.[1] ?? 'bg-slate-50 dark:bg-slate-950/20' }));

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <FinanceKpiCard label="Total Sales" value={amount(data?.kpis.totalSales ?? 0)} unit="MMK" icon={DollarSign} accentClass="border-l-4 border-l-sky-500" />
        <FinanceKpiCard label="Orders" value={amount(data?.kpis.orders ?? 0)} icon={Megaphone} accentClass="border-l-4 border-l-violet-500" />
        <FinanceKpiCard label="Pending Deliveries" value={amount(data?.kpis.pendingDeliveries ?? 0)} icon={Package} accentClass="border-l-4 border-l-amber-500" />
        <FinanceKpiCard label="Deals in Pipeline" value={amount(data?.kpis.pipelineDeals ?? 0)} icon={TrendingUp} accentClass="border-l-4 border-l-emerald-500" />
      </div>

      <SmartSuggestions recommendations={recommendations} isLoading={isRecommendationsLoading} areaFilter="sales" />

      <section className="rounded-xl border-2 border-slate-200 bg-card shadow-sm dark:border-slate-800">
        <div className="flex flex-col gap-3 border-b-2 border-slate-200 bg-slate-50/60 p-6 dark:border-slate-800 dark:bg-slate-950/40 md:flex-row md:items-center md:justify-between">
          <div><h2 className="text-sm font-bold uppercase tracking-wide text-slate-900 dark:text-slate-100">Deal Pipeline Flow</h2><p className="mt-1 text-xs text-muted-foreground">Deals grouped by their current sales stage with visual progress bars.</p></div>
          <span className="text-xs font-bold text-muted-foreground border-2 border-border bg-muted px-3 py-1 rounded-full">{amount(data?.kpis.pipelineDeals ?? 0)} Active Deals</span>
        </div>
        <div className="grid grid-cols-1 gap-4 p-6 lg:grid-cols-4">
          {stages.map((stage) => {
            const totalDealsCount = data?.kpis.orders || stages.reduce((s, st) => s + st.count, 0) || 1;
            const pct = Math.min(100, Math.round((stage.count / totalDealsCount) * 100));
            return (
              <section key={stage.label} className={`rounded-xl border-t-4 ${stage.color} ${stage.bg} p-4 flex flex-col justify-between`}>
                <div>
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-extrabold uppercase tracking-wide text-slate-700 dark:text-slate-200">{stage.label}</h3>
                    <span className="text-xs font-black text-slate-900 dark:text-slate-100 font-mono">{stage.count}</span>
                  </div>
                  <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
                    <div className="h-full rounded-full bg-sky-500 transition-all duration-300" style={{ width: `${pct}%` }} />
                  </div>
                  <p className="mt-1 text-[10px] font-semibold text-slate-500">{pct}% of pipeline volume</p>
                </div>
                <div className="mt-3 space-y-2">
                  {stage.deals.length > 0 ? (
                    stage.deals.map((deal) => (
                      <div key={deal.id} className="w-full rounded-lg border border-slate-200 bg-card p-2.5 text-left text-xs font-bold text-slate-700 shadow-sm dark:border-slate-800 dark:text-slate-200">
                        <span className="block truncate">{deal.customer}</span>
                        <span className="mt-0.5 block text-[10px] font-semibold text-slate-500">{amount(deal.amount)} MMK</span>
                      </div>
                    ))
                  ) : (
                    <div className="rounded-lg border border-dashed border-slate-200 dark:border-slate-800 p-2 text-center text-[10px] text-slate-400">No active deals</div>
                  )}
                </div>
              </section>
            );
          })}
        </div>
      </section>

      {/* Deals Table with CRUD */}
      <section className="overflow-hidden rounded-xl border-2 border-slate-200 bg-card shadow-sm dark:border-slate-800">
        <div className="border-b-2 border-slate-200 bg-slate-50/70 p-5 dark:border-slate-800 dark:bg-slate-950/40">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="flex items-center gap-2 text-lg font-black text-slate-900 dark:text-slate-100">
                <TrendingUp className="h-5 w-5 text-sky-600" />
                Deals &amp; Orders Table
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">Manage and track deals, quoted prices, stages, and order fulfillment.</p>
            </div>
            <div className="flex items-center gap-2">
              <Input placeholder="Search deals..." value={dealSearch} onChange={(e) => { setDealSearch(e.target.value); setDealPage(1); }} className="h-9 w-48 bg-card text-xs font-semibold" />
              <Select value={stageFilter} onValueChange={(val) => { setStageFilter(val ?? 'ALL'); setDealPage(1); }}>
                <SelectTrigger className="h-9 w-36 text-xs font-bold bg-card">{stageFilter === 'ALL' ? 'All Stages' : stageFilter}</SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">All Stages</SelectItem>
                  <SelectItem value="NEW_LEAD">New Lead</SelectItem>
                  <SelectItem value="QUOTED">Quoted</SelectItem>
                  <SelectItem value="FOLLOW_UP_NEEDED">Follow-up</SelectItem>
                  <SelectItem value="PENDING">Pending Delivery</SelectItem>
                  <SelectItem value="WON">Won / Completed</SelectItem>
                  <SelectItem value="LOST">Lost</SelectItem>
                </SelectContent>
              </Select>
              <Button size="sm" className="h-9 bg-sky-600 hover:bg-sky-700 text-white font-bold cursor-pointer" onClick={openAddDeal}>
                <Plus className="mr-1.5 h-4 w-4" /> Add Deal
              </Button>
            </div>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b-2 border-slate-200 bg-slate-50/60 text-[10px] font-extrabold uppercase tracking-wider text-slate-500 dark:border-slate-800 dark:bg-slate-950/40">
              <tr>
                <th className="px-5 py-4">Date</th>
                <th className="px-5 py-4">Customer</th>
                <th className="px-5 py-4 text-right">Quoted Amount</th>
                <th className="px-5 py-4 text-center">Stage</th>
                <th className="px-5 py-4 text-center">Fulfillment</th>
                <th className="px-5 py-4">Channel / Notes</th>
                <th className="px-5 py-4 text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y-2 divide-slate-100 dark:divide-slate-900">
              {isLoadingDeals ? (
                <>
                  {[0, 1, 2, 3, 4].map((idx) => (
                    <tr key={idx} className="border-b border-border/40">
                      <td className="px-5 py-4"><Skeleton className="h-4 w-20" /></td>
                      <td className="px-5 py-4"><Skeleton className="h-4 w-32" /></td>
                      <td className="px-5 py-4 text-right"><Skeleton className="h-4 w-24 ml-auto" /></td>
                      <td className="px-5 py-4 text-center"><Skeleton className="h-5 w-16 mx-auto rounded-full" /></td>
                      <td className="px-5 py-4 text-center"><Skeleton className="h-5 w-20 mx-auto rounded-full" /></td>
                      <td className="px-5 py-4"><Skeleton className="h-4 w-28" /></td>
                      <td className="px-5 py-4 text-center"><Skeleton className="h-6 w-14 mx-auto rounded-md" /></td>
                    </tr>
                  ))}
                </>
              ) : isDealsError ? (
                <tr><td colSpan={7} className="px-6 py-10 text-center text-sm">
                  <p className="font-semibold text-red-600 dark:text-red-400">Couldn&apos;t load deals. Check your connection and try again.</p>
                  <Button variant="outline" size="sm" className="mt-3" onClick={() => void refetchDeals()}>Retry</Button>
                </td></tr>
              ) : pagedDeals.length > 0 ? (
                pagedDeals.map((deal) => (
                  <tr key={deal.id} className="transition hover:bg-slate-50 dark:hover:bg-slate-950/50">
                    <td className="whitespace-nowrap px-5 py-4 text-xs font-bold text-slate-600 dark:text-slate-400">
                      {new Date(deal.createdAt).toLocaleDateString(undefined, { timeZone: "UTC" })}
                    </td>
                    <td className="px-5 py-4 text-xs font-semibold text-slate-600 dark:text-slate-400">{deal.customer?.name || '—'}</td>
                    <td className="whitespace-nowrap px-5 py-4 text-right text-xs font-black text-sky-600 dark:text-sky-400">
                      {deal.quotedAmount ? `${amount(deal.quotedAmount)} MMK` : '—'}
                    </td>
                    <td className="px-5 py-4 text-center">
                      <span className="rounded-full border border-slate-200 bg-slate-50 dark:bg-slate-900 px-2.5 py-1 text-[10px] font-extrabold uppercase text-slate-700 dark:text-slate-300">
                        {deal.stage}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-center">
                      <span className={`rounded-full border px-2.5 py-1 text-[10px] font-extrabold uppercase ${deal.fulfillmentStatus === 'FULFILLED' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-amber-50 text-amber-700 border-amber-200'}`}>
                        {deal.fulfillmentStatus}
                      </span>
                    </td>
                    <td className="max-w-40 truncate px-5 py-4 text-xs text-slate-500">{deal.sourceChannel || deal.note || '—'}</td>
                    <td className="px-5 py-4 text-center">
                      <div className="flex items-center justify-center gap-1.5">
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-blue-600 hover:text-blue-700" onClick={() => openEditDeal(deal)}><Pencil className="h-3.5 w-3.5" /></Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-red-600 hover:text-red-700" onClick={() => setDeleteDeal(deal)}><Trash2 className="h-3.5 w-3.5" /></Button>
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr><td colSpan={7} className="px-6 py-10 text-center text-sm text-slate-500">No deals found for this period.</td></tr>
              )}
            </tbody>
          </table>
        </div>
        {totalDealPages > 1 && (
          <div className="flex items-center justify-between border-t border-slate-200 dark:border-slate-800 bg-card/20 px-6 py-4">
            <div className="text-xs text-muted-foreground font-mono">
              Showing Page <span className="text-foreground font-bold">{dealPage}</span> of <span className="text-foreground font-bold">{totalDealPages}</span> ({filteredDeals.length} total)
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" disabled={dealPage <= 1} onClick={() => setDealPage((p) => Math.max(1, p - 1))} className="bg-card border-border text-foreground hover:bg-muted cursor-pointer">
                <ChevronLeft className="w-4 h-4 mr-1" />
                Prev
              </Button>
              <Button variant="outline" size="sm" disabled={dealPage >= totalDealPages} onClick={() => setDealPage((p) => Math.min(totalDealPages, p + 1))} className="bg-card border-border text-foreground hover:bg-muted cursor-pointer">
                Next
                <ChevronRight className="w-4 h-4 ml-1" />
              </Button>
            </div>
          </div>
        )}
      </section>

      {/* Deal Add/Edit Dialog */}
      <Dialog open={dealDialogOpen} onOpenChange={setDealDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingDeal ? 'Edit Deal' : 'Add New Deal'}</DialogTitle>
            <DialogDescription>Record deal details, customer, pricing, and stage.</DialogDescription>
          </DialogHeader>
          <form className="grid gap-4" onSubmit={saveDeal}>
            {editingDeal && (
              <div className="grid gap-2">
                <label className="text-xs font-bold">Customer</label>
                <Input value={editingDeal.customer?.name || '—'} disabled className="bg-muted" />
              </div>
            )}
            <div className="grid gap-1.5">
              <label className="text-xs font-bold">Quoted Amount (MMK)</label>
              <Input type="number" value={dealForm.quotedAmount} onChange={(e) => setDealForm({ ...dealForm, quotedAmount: e.target.value })} placeholder="0" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <label className="text-xs font-bold">Stage</label>
                <Select value={dealForm.stage} onValueChange={(val) => setDealForm({ ...dealForm, stage: val ?? 'NEW_LEAD' })}>
                  <SelectTrigger className="text-xs font-bold">{dealForm.stage}</SelectTrigger>
                  <SelectContent>
                    <SelectItem value="NEW_LEAD">New Lead</SelectItem>
                    <SelectItem value="QUOTED">Quoted</SelectItem>
                    <SelectItem value="FOLLOW_UP_NEEDED">Follow Up Needed</SelectItem>
                    <SelectItem value="PENDING">Pending Delivery</SelectItem>
                    <SelectItem value="WON">Closed Won</SelectItem>
                    <SelectItem value="LOST">Lost</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1.5">
                <label className="text-xs font-bold">Fulfillment</label>
                <Select value={dealForm.fulfillmentStatus} onValueChange={(val) => setDealForm({ ...dealForm, fulfillmentStatus: val ?? 'PENDING' })}>
                  <SelectTrigger className="text-xs font-bold">{dealForm.fulfillmentStatus}</SelectTrigger>
                  <SelectContent>
                    <SelectItem value="PENDING">Pending</SelectItem>
                    <SelectItem value="PROCESSING">Processing</SelectItem>
                    <SelectItem value="FULFILLED">Fulfilled</SelectItem>
                    <SelectItem value="CANCELLED">Cancelled</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid gap-1.5">
              <label className="text-xs font-bold">Channel / Source</label>
              <Input value={dealForm.sourceChannel} onChange={(e) => setDealForm({ ...dealForm, sourceChannel: e.target.value })} placeholder="e.g. Facebook, Direct, Telegram" />
            </div>
            <div className="grid gap-1.5">
              <label className="text-xs font-bold">Notes</label>
              <Input value={dealForm.note} onChange={(e) => setDealForm({ ...dealForm, note: e.target.value })} placeholder="Additional remarks" />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setDealDialogOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={isSaving} className="bg-sky-600 hover:bg-sky-700 text-white font-bold">{isSaving ? 'Saving...' : editingDeal ? 'Save Changes' : 'Create Deal'}</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={Boolean(deleteDeal)} onOpenChange={(open) => !open && setDeleteDeal(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this deal?</AlertDialogTitle>
            <AlertDialogDescription>This deal will be moved to Trash. It can be restored later from Trash.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction disabled={isDeleting} className="bg-red-600 text-white hover:bg-red-700 font-bold" onClick={confirmDeleteDeal}>{isDeleting ? 'Deleting...' : 'Move to Trash'}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ─── Marketing Workspace with Full CRUD Metrics Table ───────────────────────

function MarketingWorkspace({ data, recommendations, isRecommendationsLoading, dateFrom, dateTo }: { data?: CommerceWorkspaceData['marketing']; recommendations?: CommerceActionRecommendation[]; isRecommendationsLoading: boolean; dateFrom?: string; dateTo?: string }) {
  const queryClient = useQueryClient();
  const [metricPage, setMetricPage] = useState(1);
  const metricPageSize = 10;
  const {
    data: metricsData,
    isLoading: isLoadingMetrics,
    isError: isMetricsError,
    refetch: refetchMetrics,
  } = useMarketingMetrics({ dateFrom, dateTo, page: metricPage, limit: metricPageSize });
  const metrics = useMemo(() => metricsData?.metrics ?? [], [metricsData]);
  const [metricDialogOpen, setMetricDialogOpen] = useState(false);
  const [editingMetric, setEditingMetric] = useState<MarketingMetricRecord | null>(null);
  const [deleteMetric, setDeleteMetric] = useState<MarketingMetricRecord | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const [metricForm, setMetricForm] = useState({
    metricDate: new Date().toISOString().slice(0, 10),
    channel: 'Facebook',
    campaignName: '',
    spend: '',
    reach: '',
    leads: '',
    adDrivenOrders: '',
    notes: '',
  });

  const openAddMetric = () => {
    setEditingMetric(null);
    setMetricForm({
      metricDate: dateFrom || new Date().toISOString().slice(0, 10),
      channel: 'Facebook',
      campaignName: '',
      spend: '',
      reach: '',
      leads: '',
      adDrivenOrders: '',
      notes: '',
    });
    setMetricDialogOpen(true);
  };

  const openEditMetric = (metric: MarketingMetricRecord) => {
    setEditingMetric(metric);
    setMetricForm({
      metricDate: metric.metricDate ? metric.metricDate.slice(0, 10) : new Date().toISOString().slice(0, 10),
      channel: metric.channel || 'Facebook',
      campaignName: metric.campaignName || '',
      spend: metric.spend ? String(metric.spend) : '0',
      reach: metric.reach ? String(metric.reach) : '',
      leads: metric.leads ? String(metric.leads) : '',
      adDrivenOrders: metric.adDrivenOrders ? String(metric.adDrivenOrders) : '',
      notes: metric.notes || '',
    });
    setMetricDialogOpen(true);
  };

  const saveMetric = async (e: FormEvent) => {
    e.preventDefault();
    const spendNum = Number(metricForm.spend);
    if (!Number.isFinite(spendNum) || spendNum < 0) {
      toast.error('Enter a valid spend amount');
      return;
    }
    setIsSaving(true);
    try {
      const payload = {
        metricDate: metricForm.metricDate,
        channel: metricForm.channel,
        campaignName: metricForm.campaignName.trim() || null,
        spend: spendNum,
        reach: metricForm.reach ? Number(metricForm.reach) : null,
        leads: metricForm.leads ? Number(metricForm.leads) : null,
        adDrivenOrders: metricForm.adDrivenOrders ? Number(metricForm.adDrivenOrders) : null,
        notes: metricForm.notes.trim() || null,
      };

      const res = await fetch('/api/marketing-metrics', {
        method: editingMetric ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editingMetric ? { id: editingMetric.id, ...payload } : payload),
      });

      if (!res.ok) throw new Error('Failed to save marketing metric');
      toast.success(editingMetric ? 'Metric updated' : 'Metric recorded');
      setMetricDialogOpen(false);
      await queryClient.invalidateQueries({ queryKey: marketingMetricKeys.all });
      await queryClient.invalidateQueries({ queryKey: commerceDashboardKeys.all });
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Error saving metric');
    } finally {
      setIsSaving(false);
    }
  };

  const confirmDeleteMetric = async () => {
    if (!deleteMetric) return;
    setIsDeleting(true);
    try {
      const res = await fetch(`/api/marketing-metrics?id=${deleteMetric.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to delete marketing metric');
      toast.success('Metric moved to Trash');
      setDeleteMetric(null);
      await queryClient.invalidateQueries({ queryKey: marketingMetricKeys.all });
      await queryClient.invalidateQueries({ queryKey: commerceDashboardKeys.all });
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Error deleting metric');
    } finally {
      setIsDeleting(false);
    }
  };

  const weekly = data?.chart.length ? data.chart.map((item) => [item.label, item.spend, item.orders] as const) : [['W1', 0, 0], ['W2', 0, 0], ['W3', 0, 0], ['W4', 0, 0]] as const;
  const topProducts = data?.topProducts ?? [];

  // The API aggregates all matching records, while the table only loads one
  // page. This keeps the insight correct as the dataset grows.
  const channelBreakdown = useMemo(() => {
    const channels = metricsData?.channels ?? [];
    const total = channels.reduce((sum, entry) => sum + entry.spend, 0);
    return {
      total,
      rows: channels
        .map((entry) => ({
          ...entry,
          share: total > 0 ? (entry.spend / total) * 100 : 0,
          costPerOrder: entry.orders > 0 ? entry.spend / entry.orders : 0,
        }))
        .sort((a, b) => b.spend - a.spend),
    };
  }, [metricsData]);
  const channelColors = ["#0ea5e9", "#8b5cf6", "#10b981", "#f59e0b", "#ef4444", "#64748b"];

  useEffect(() => {
    setMetricPage(1);
  }, [dateFrom, dateTo]);
  const totalMetricPages = Math.max(1, metricsData?.totalPages ?? 1);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <FinanceKpiCard label="Total Ad Expense" value={amount(data?.kpis.adSpend ?? 0)} unit="MMK" icon={ReceiptText} accentClass="border-l-4 border-l-pink-500" />
        <FinanceKpiCard label="Reach" value={amount(data?.kpis.reach ?? 0)} icon={Users} accentClass="border-l-4 border-l-sky-500" />
        <FinanceKpiCard label="Cost per Order" value={amount(data?.kpis.costPerOrder ?? 0)} unit="MMK" icon={DollarSign} accentClass="border-l-4 border-l-amber-500" />
        <FinanceKpiCard label="Ad-driven Orders" value={amount(data?.kpis.adOrders ?? 0)} icon={Megaphone} accentClass="border-l-4 border-l-emerald-500" />
      </div>

      <SmartSuggestions recommendations={recommendations} isLoading={isRecommendationsLoading} areaFilter="marketing" />

      <section className="rounded-xl border-2 border-slate-200 bg-card shadow-sm dark:border-slate-800">
        <div className="p-6"><h2 className="border-b-2 border-slate-100 pb-3 text-sm font-bold uppercase tracking-wide text-slate-900 dark:border-slate-800 dark:text-slate-100">Ad Spend vs Ad-driven Orders</h2></div>
        <div className="px-6 pb-6">
          <div className="mb-4 flex items-center justify-center gap-6 text-sm font-semibold text-slate-600">
            <span className="inline-flex items-center gap-2"><span className="h-4 w-8 rounded-sm bg-sky-500" />Ad Spend</span>
            <span className="inline-flex items-center gap-2"><span className="h-1 w-8 bg-emerald-500" />Orders</span>
          </div>
          <div className="relative h-80 w-full"><MarketingPerformanceChart weekly={weekly} /></div>
        </div>
      </section>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <section className="rounded-xl border-2 border-slate-200 bg-card shadow-sm dark:border-slate-800">
          <div className="p-6"><h2 className="border-b-2 border-slate-100 pb-3 text-sm font-bold uppercase tracking-wide text-slate-900 dark:border-slate-800 dark:text-slate-100">Top Performing Products (Ad-driven)</h2></div>
          <div className="divide-y-2 divide-slate-100 px-6 dark:divide-slate-900">
            {topProducts.length ? topProducts.map((product, index) => (
              <div key={`${product.name}-${index}`} className="flex items-center justify-between gap-4 py-5">
                <div className="min-w-0"><p className="truncate font-bold text-slate-900 dark:text-slate-100">{index + 1}. {product.name}</p><p className="mt-1 text-xs font-semibold text-slate-500">Ad-attributed product sales</p></div>
                <span className="whitespace-nowrap rounded-full bg-emerald-50 px-3 py-1.5 text-sm font-bold text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300">{product.orders} orders</span>
              </div>
            )) : <div className="py-10 text-center text-sm font-semibold text-slate-500">No ad-driven product data yet.</div>}
          </div>
        </section>
        <section className="rounded-xl border-2 border-slate-200 bg-card shadow-sm dark:border-slate-800">
          <div className="p-6"><h2 className="border-b-2 border-slate-100 pb-3 text-sm font-bold uppercase tracking-wide text-slate-900 dark:border-slate-800 dark:text-slate-100">Spend by Channel</h2></div>
          <div className="space-y-5 px-6 pb-6">
            {channelBreakdown.rows.length ? channelBreakdown.rows.map((row, index) => (
              <div key={row.channel}>
                <div className="flex items-baseline justify-between gap-3">
                  <p className="truncate font-bold text-slate-900 dark:text-slate-100">{row.channel}</p>
                  <p className="whitespace-nowrap text-sm font-black text-slate-900 dark:text-slate-100">{amount(row.spend)} <span className="text-xs font-bold text-slate-400">MMK · {row.share.toFixed(1)}%</span></p>
                </div>
                <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                  <div className="h-full rounded-full transition-all duration-300" style={{ width: `${Math.min(100, row.share)}%`, backgroundColor: channelColors[index % channelColors.length] }} />
                </div>
                <p className="mt-1.5 text-xs font-semibold text-slate-500">
                  {row.orders} orders
                  {row.orders > 0 ? ` · ${amount(Math.round(row.costPerOrder))} MMK/order` : " · no orders yet"}
                  {row.reach > 0 && ` · ${amount(row.reach)} reach`}
                </p>
              </div>
            )) : <div className="py-10 text-center text-sm font-semibold text-slate-500">No channel data yet for this period.</div>}
          </div>
        </section>
      </div>

      {/* Marketing Metrics Table with CRUD */}
      <section className="overflow-hidden rounded-xl border-2 border-slate-200 bg-card shadow-sm dark:border-slate-800">
        <div className="border-b-2 border-slate-200 bg-slate-50/70 p-5 dark:border-slate-800 dark:bg-slate-950/40">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="flex items-center gap-2 text-lg font-black text-slate-900 dark:text-slate-100">
                <Megaphone className="h-5 w-5 text-sky-600" />
                Marketing Campaigns &amp; Ad Metrics Table
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">Track channel spend, reach, leads, and conversion efficiency.</p>
            </div>
            <Button size="sm" className="h-9 bg-sky-600 hover:bg-sky-700 text-white font-bold cursor-pointer" onClick={openAddMetric}>
              <Plus className="mr-1.5 h-4 w-4" /> Add Campaign Metric
            </Button>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b-2 border-slate-200 bg-slate-50/60 text-[10px] font-extrabold uppercase tracking-wider text-slate-500 dark:border-slate-800 dark:bg-slate-950/40">
              <tr>
                <th className="px-5 py-4">Date</th>
                <th className="px-5 py-4">Channel</th>
                <th className="px-5 py-4 text-right">Spend (MMK)</th>
                <th className="px-5 py-4 text-center">Reach / Impr</th>
                <th className="px-5 py-4 text-center">Leads</th>
                <th className="px-5 py-4 text-center">Ad Orders</th>
                <th className="px-5 py-4 text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y-2 divide-slate-100 dark:divide-slate-900">
              {isLoadingMetrics ? (
                <>
                  {[0, 1, 2, 3, 4].map((idx) => (
                    <tr key={idx} className="border-b border-border/40">
                      <td className="px-5 py-4"><Skeleton className="h-4 w-24" /></td>
                      <td className="px-5 py-4"><Skeleton className="h-4 w-28" /></td>
                      <td className="px-5 py-4 text-right"><Skeleton className="h-4 w-20 ml-auto" /></td>
                      <td className="px-5 py-4 text-center"><Skeleton className="h-4 w-16 mx-auto" /></td>
                      <td className="px-5 py-4 text-center"><Skeleton className="h-4 w-12 mx-auto" /></td>
                      <td className="px-5 py-4 text-center"><Skeleton className="h-4 w-12 mx-auto" /></td>
                      <td className="px-5 py-4 text-center"><Skeleton className="h-6 w-14 mx-auto rounded-md" /></td>
                    </tr>
                  ))}
                </>
              ) : isMetricsError ? (
                <tr><td colSpan={7} className="px-6 py-10 text-center text-sm">
                  <p className="font-semibold text-red-600 dark:text-red-400">Couldn&apos;t load marketing records. Check your connection and try again.</p>
                  <Button variant="outline" size="sm" className="mt-3" onClick={() => void refetchMetrics()}>Retry</Button>
                </td></tr>
              ) : metrics.length > 0 ? (
                metrics.map((metric) => (
                  <tr key={metric.id} className="transition hover:bg-slate-50 dark:hover:bg-slate-950/50">
                    <td className="whitespace-nowrap px-5 py-4 text-xs font-bold text-slate-600 dark:text-slate-400">
                      {metric.metricDate ? metric.metricDate.slice(0, 10) : '—'}
                    </td>
                    <td className="px-5 py-4 font-bold text-xs text-slate-900 dark:text-slate-100">{metric.channel}</td>
                    <td className="whitespace-nowrap px-5 py-4 text-right text-xs font-black text-rose-600 dark:text-rose-400">
                      {amount(metric.spend)} MMK
                    </td>
                    <td className="px-5 py-4 text-center text-xs font-semibold">{amount(metric.reach || metric.impressions || 0)}</td>
                    <td className="px-5 py-4 text-center text-xs font-semibold text-violet-600">{metric.leads || 0}</td>
                    <td className="px-5 py-4 text-center text-xs font-black text-emerald-600">{metric.adDrivenOrders || 0}</td>
                    <td className="px-5 py-4 text-center">
                      <div className="flex items-center justify-center gap-1.5">
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-blue-600 hover:text-blue-700" onClick={() => openEditMetric(metric)}><Pencil className="h-3.5 w-3.5" /></Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-red-600 hover:text-red-700" onClick={() => setDeleteMetric(metric)}><Trash2 className="h-3.5 w-3.5" /></Button>
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr><td colSpan={7} className="px-6 py-10 text-center text-sm text-slate-500">No marketing records found for this period.</td></tr>
              )}
            </tbody>
          </table>
        </div>
        {totalMetricPages > 1 && (
          <div className="flex items-center justify-between border-t border-slate-200 dark:border-slate-800 bg-card/20 px-6 py-4">
            <div className="text-xs text-muted-foreground font-mono">
              Showing Page <span className="text-foreground font-bold">{metricPage}</span> of <span className="text-foreground font-bold">{totalMetricPages}</span> ({metricsData?.total ?? 0} total)
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" disabled={metricPage <= 1} onClick={() => setMetricPage((p) => Math.max(1, p - 1))} className="bg-card border-border text-foreground hover:bg-muted cursor-pointer">
                <ChevronLeft className="w-4 h-4 mr-1" />
                Prev
              </Button>
              <Button variant="outline" size="sm" disabled={metricPage >= totalMetricPages} onClick={() => setMetricPage((p) => Math.min(totalMetricPages, p + 1))} className="bg-card border-border text-foreground hover:bg-muted cursor-pointer">
                Next
                <ChevronRight className="w-4 h-4 ml-1" />
              </Button>
            </div>
          </div>
        )}
      </section>

      {/* Metric Add/Edit Dialog */}
      <Dialog open={metricDialogOpen} onOpenChange={setMetricDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingMetric ? 'Edit Marketing Metric' : 'Record Marketing Metric'}</DialogTitle>
            <DialogDescription>Record advertising spend, reach, and order attribution.</DialogDescription>
          </DialogHeader>
          <form className="grid gap-4" onSubmit={saveMetric}>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <label className="text-xs font-bold">Date</label>
                <Input type="date" value={metricForm.metricDate} onChange={(e) => setMetricForm({ ...metricForm, metricDate: e.target.value })} required />
              </div>
              <div className="grid gap-1.5">
                <label className="text-xs font-bold">Channel</label>
                <Select value={metricForm.channel} onValueChange={(val) => setMetricForm({ ...metricForm, channel: val ?? 'Facebook' })}>
                  <SelectTrigger className="text-xs font-bold">{metricForm.channel}</SelectTrigger>
                  <SelectContent>
                    {['Facebook', 'TikTok', 'Google', 'Viber', 'Telegram', 'Instagram', 'Other'].map((ch) => (
                      <SelectItem key={ch} value={ch}>{ch}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid gap-1.5">
              <label className="text-xs font-bold">Campaign Name</label>
              <Input value={metricForm.campaignName} onChange={(e) => setMetricForm({ ...metricForm, campaignName: e.target.value })} placeholder="e.g. Summer Promo 2026" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <label className="text-xs font-bold">Spend (MMK) *</label>
                <Input type="number" value={metricForm.spend} onChange={(e) => setMetricForm({ ...metricForm, spend: e.target.value })} placeholder="0" required />
              </div>
              <div className="grid gap-1.5">
                <label className="text-xs font-bold">Reach / Impressions</label>
                <Input type="number" value={metricForm.reach} onChange={(e) => setMetricForm({ ...metricForm, reach: e.target.value })} placeholder="0" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <label className="text-xs font-bold">Leads Generated</label>
                <Input type="number" value={metricForm.leads} onChange={(e) => setMetricForm({ ...metricForm, leads: e.target.value })} placeholder="0" />
              </div>
              <div className="grid gap-1.5">
                <label className="text-xs font-bold">Ad-driven Orders</label>
                <Input type="number" value={metricForm.adDrivenOrders} onChange={(e) => setMetricForm({ ...metricForm, adDrivenOrders: e.target.value })} placeholder="0" />
              </div>
            </div>
            <div className="grid gap-1.5">
              <label className="text-xs font-bold">Notes</label>
              <Input value={metricForm.notes} onChange={(e) => setMetricForm({ ...metricForm, notes: e.target.value })} placeholder="Targeting details, notes" />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setMetricDialogOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={isSaving} className="bg-sky-600 hover:bg-sky-700 text-white font-bold">{isSaving ? 'Saving...' : editingMetric ? 'Save Changes' : 'Record Metric'}</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={Boolean(deleteMetric)} onOpenChange={(open) => !open && setDeleteMetric(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this marketing metric?</AlertDialogTitle>
            <AlertDialogDescription>This metric entry will be moved to Trash.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction disabled={isDeleting} className="bg-red-600 text-white hover:bg-red-700 font-bold" onClick={confirmDeleteMetric}>{isDeleting ? 'Deleting...' : 'Move to Trash'}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ─── Inventory Workspace with Full CRUD Products Table ──────────────────────

function InventoryWorkspace({ data, recommendations, isRecommendationsLoading }: { data?: CommerceWorkspaceData['inventory']; recommendations?: CommerceActionRecommendation[]; isRecommendationsLoading: boolean }) {
  const queryClient = useQueryClient();
  const [productDialogOpen, setProductDialogOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<ProductRecord | null>(null);
  const [deleteProduct, setDeleteProduct] = useState<ProductRecord | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const [productForm, setProductForm] = useState({
    name: '',
    sku: '',
    category: '',
    sellingPrice: '',
    unitCost: '',
    stockQty: '0',
    lowStockThreshold: '5',
    description: '',
  });

  const products = data?.products ?? [];
  const statusClass = (status: string) => status === 'In Stock' ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : status === 'Low Stock' ? 'border-amber-200 bg-amber-50 text-amber-700' : status === 'Out of Stock' ? 'border-red-200 bg-red-50 text-red-700' : 'border-slate-200 bg-slate-50 text-slate-600';

  const openAddProduct = () => {
    setEditingProduct(null);
    setProductForm({
      name: '',
      sku: '',
      category: '',
      sellingPrice: '',
      unitCost: '',
      stockQty: '0',
      lowStockThreshold: '5',
      description: '',
    });
    setProductDialogOpen(true);
  };

  const openEditProduct = (prod: ProductRecord) => {
    setEditingProduct(prod);
    setProductForm({
      name: prod.name || '',
      sku: prod.sku || '',
      category: prod.category || '',
      sellingPrice: prod.sellingPrice ? String(prod.sellingPrice) : '',
      unitCost: prod.unitCost ? String(prod.unitCost) : '',
      stockQty: String(prod.stockQty ?? 0),
      lowStockThreshold: String(prod.lowStockThreshold ?? 5),
      description: prod.description || '',
    });
    setProductDialogOpen(true);
  };

  const saveProduct = async (e: FormEvent) => {
    e.preventDefault();
    if (!productForm.name.trim()) {
      toast.error('Product name is required');
      return;
    }
    setIsSaving(true);
    try {
      const generatedSku = productForm.sku.trim() || `SKU-${Date.now().toString().slice(-6)}`;
      const payload = {
        name: productForm.name.trim(),
        sku: generatedSku,
        category: productForm.category.trim() || null,
        sellingPrice: productForm.sellingPrice ? Number(productForm.sellingPrice) : null,
        unitCost: productForm.unitCost ? Number(productForm.unitCost) : null,
        stockQty: Number(productForm.stockQty) || 0,
        lowStockThreshold: Number(productForm.lowStockThreshold) || 5,
      };

      const res = await fetch('/api/products', {
        method: editingProduct ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editingProduct ? { id: editingProduct.id, ...payload } : payload),
      });

      if (!res.ok) {
        const err = (await res.json()) as { message?: string };
        throw new Error(err.message || 'Failed to save product');
      }
      toast.success(editingProduct ? 'Product updated' : 'Product created');
      setProductDialogOpen(false);
      await queryClient.invalidateQueries({ queryKey: commerceDashboardKeys.all });
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Error saving product');
    } finally {
      setIsSaving(false);
    }
  };

  const confirmDeleteProduct = async () => {
    if (!deleteProduct) return;
    setIsDeleting(true);
    try {
      const res = await fetch(`/api/products?id=${deleteProduct.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to delete product');
      toast.success('Product moved to Trash');
      setDeleteProduct(null);
      await queryClient.invalidateQueries({ queryKey: commerceDashboardKeys.all });
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Error deleting product');
    } finally {
      setIsDeleting(false);
    }
  };

  const [prodPage, setProdPage] = useState(1);
  const prodPageSize = 10;
  const totalProdPages = Math.max(1, Math.ceil(products.length / prodPageSize));
  const pagedProducts = products.slice((prodPage - 1) * prodPageSize, prodPage * prodPageSize);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <FinanceKpiCard label="Total Products" value={amount(data?.kpis.totalProducts ?? 0)} icon={Package} accentClass="border-l-4 border-l-sky-500" />
        <FinanceKpiCard label="Low Stock Items" value={amount(data?.kpis.lowStockItems ?? 0)} icon={AlertTriangle} accentClass="border-l-4 border-l-amber-500" />
        <FinanceKpiCard label="Out of Stock" value={amount(data?.kpis.outOfStock ?? 0)} icon={Package} accentClass="border-l-4 border-l-red-500" />
        <FinanceKpiCard label="Inventory Value" value={amount(data?.kpis.inventoryValue ?? 0)} unit="MMK" icon={DollarSign} accentClass="border-l-4 border-l-emerald-500" />
      </div>

      <SmartSuggestions recommendations={recommendations} isLoading={isRecommendationsLoading} areaFilter="inventory" />

      <section className="bg-card border-2 border-slate-200 dark:border-slate-800 rounded-xl shadow-sm overflow-hidden">
        <div className="p-6 border-b border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h2 className="text-lg font-extrabold text-slate-900 dark:text-slate-100 uppercase tracking-wide">Product Catalog Table</h2>
            <p className="mt-1 text-xs text-muted-foreground">Product Code is the internal identifier used to identify each product.</p>
          </div>
          <Button size="sm" className="h-9 bg-sky-600 hover:bg-sky-700 text-white font-bold cursor-pointer" onClick={openAddProduct}>
            <Plus className="mr-1.5 h-4 w-4" /> Add Product
          </Button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b-2 border-slate-200 bg-slate-50/60 text-[10px] font-extrabold uppercase tracking-wider text-slate-500 dark:border-slate-800 dark:bg-slate-950/40">
              <tr>
                {['Product', 'Product Code', 'Stock Level', 'Status', 'Actions'].map((heading) => (
                  <th key={heading} className={`px-6 py-4 ${heading === 'Actions' ? 'text-center' : 'text-left'}`}>{heading}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y-2 divide-slate-100 dark:divide-slate-900">
              {pagedProducts.length > 0 ? (
                pagedProducts.map((product) => (
                  <tr key={product.id} className="transition hover:bg-slate-50 dark:hover:bg-slate-950/50">
                    <td className="px-6 py-4 text-xs font-bold text-slate-900 dark:text-slate-100">{product.name}</td>
                    <td className="px-6 py-4 text-xs font-bold text-slate-500">{product.productCode || '—'}</td>
                    <td className="px-6 py-4 text-xs font-semibold text-slate-500">{product.stockLevel}</td>
                    <td className="px-6 py-4">
                      <span className={`rounded border-2 px-2.5 py-1 text-[10px] font-extrabold ${statusClass(product.status)}`}>
                        {product.status.toUpperCase()}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center justify-center gap-2">
                        <Button aria-label={`Edit ${product.name}`} variant="ghost" size="icon" className="h-8 w-8 text-blue-600 hover:text-blue-700" onClick={() => openEditProduct(product as unknown as ProductRecord)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button aria-label={`Delete ${product.name}`} variant="ghost" size="icon" className="h-8 w-8 text-red-600 hover:text-red-700" onClick={() => setDeleteProduct(product as unknown as ProductRecord)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr><td colSpan={5} className="px-6 py-10 text-center text-sm text-slate-500">No products in catalog yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
        {totalProdPages > 1 && (
          <div className="flex items-center justify-between border-t border-slate-200 dark:border-slate-800 bg-card/20 px-6 py-4">
            <div className="text-xs text-muted-foreground font-mono">
              Showing Page <span className="text-foreground font-bold">{prodPage}</span> of <span className="text-foreground font-bold">{totalProdPages}</span> ({products.length} total)
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" disabled={prodPage <= 1} onClick={() => setProdPage((p) => Math.max(1, p - 1))} className="bg-card border-border text-foreground hover:bg-muted cursor-pointer">
                <ChevronLeft className="w-4 h-4 mr-1" />
                Prev
              </Button>
              <Button variant="outline" size="sm" disabled={prodPage >= totalProdPages} onClick={() => setProdPage((p) => Math.min(totalProdPages, p + 1))} className="bg-card border-border text-foreground hover:bg-muted cursor-pointer">
                Next
                <ChevronRight className="w-4 h-4 ml-1" />
              </Button>
            </div>
          </div>
        )}
      </section>

      {/* Product Add/Edit Dialog */}
      <Dialog open={productDialogOpen} onOpenChange={setProductDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingProduct ? 'Edit Product' : 'Add New Product'}</DialogTitle>
            <DialogDescription>Add or update product stock, price, and SKU details.</DialogDescription>
          </DialogHeader>
          <form className="grid gap-4" onSubmit={saveProduct}>
            <div className="grid gap-1.5">
              <label className="text-xs font-bold">Product Name *</label>
              <Input value={productForm.name} onChange={(e) => setProductForm({ ...productForm, name: e.target.value })} placeholder="Product name" required />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <label className="text-xs font-bold">SKU / Product Code</label>
                <Input value={productForm.sku} onChange={(e) => setProductForm({ ...productForm, sku: e.target.value })} placeholder="SKU-001" />
              </div>
              <div className="grid gap-1.5">
                <label className="text-xs font-bold">Category</label>
                <Input value={productForm.category} onChange={(e) => setProductForm({ ...productForm, category: e.target.value })} placeholder="Category" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <label className="text-xs font-bold">Selling Price (MMK)</label>
                <Input type="number" value={productForm.sellingPrice} onChange={(e) => setProductForm({ ...productForm, sellingPrice: e.target.value })} placeholder="0" />
              </div>
              <div className="grid gap-1.5">
                <label className="text-xs font-bold">Unit Cost (MMK)</label>
                <Input type="number" value={productForm.unitCost} onChange={(e) => setProductForm({ ...productForm, unitCost: e.target.value })} placeholder="0" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <label className="text-xs font-bold">Stock Quantity</label>
                <Input type="number" value={productForm.stockQty} onChange={(e) => setProductForm({ ...productForm, stockQty: e.target.value })} placeholder="0" />
              </div>
              <div className="grid gap-1.5">
                <label className="text-xs font-bold">Low Stock Threshold</label>
                <Input type="number" value={productForm.lowStockThreshold} onChange={(e) => setProductForm({ ...productForm, lowStockThreshold: e.target.value })} placeholder="5" />
              </div>
            </div>
            <div className="grid gap-1.5">
              <label className="text-xs font-bold">Description</label>
              <Input value={productForm.description} onChange={(e) => setProductForm({ ...productForm, description: e.target.value })} placeholder="Product notes" />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setProductDialogOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={isSaving} className="bg-sky-600 hover:bg-sky-700 text-white font-bold">{isSaving ? 'Saving...' : editingProduct ? 'Save Changes' : 'Add Product'}</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={Boolean(deleteProduct)} onOpenChange={(open) => !open && setDeleteProduct(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this product?</AlertDialogTitle>
            <AlertDialogDescription>This product will be moved to Trash.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction disabled={isDeleting} className="bg-red-600 text-white hover:bg-red-700 font-bold" onClick={confirmDeleteProduct}>{isDeleting ? 'Deleting...' : 'Move to Trash'}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export function ProductSalesWorkspace({ workspace }: { workspace: Workspace }) {
  const queryClient = useQueryClient();
  const {
    period,
    month,
    day,
    year,
    customFrom,
    customTo,
    updatePeriod,
    years: filterYears,
    dateFrom,
    dateTo,
  } = useDateFilter('workspace_filter');
  const [isTargetDialogOpen, setIsTargetDialogOpen] = useState(false);
  // Start blank like BAI-service: only values the owner actually saved are
  // prefilled, never hardcoded defaults.
  const [targetRevenue, setTargetRevenue] = useState('');
  const [targetExpense, setTargetExpense] = useState('');
  const [targetOrders, setTargetOrders] = useState('');
  const [targetFulfilledOrders, setTargetFulfilledOrders] = useState('');
  const [targetNewCustomers, setTargetNewCustomers] = useState('');
  const [isDeleteAllOpen, setIsDeleteAllOpen] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);
  const overview = workspace === 'overview';
  const dashboardParams: CommerceDashboardParams = {
    period,
    year: Number(year),
    month: Number(month),
    ...(period === 'day' ? { day: Number(day) } : {}),
    ...(period === 'custom' ? { from: customFrom, to: customTo } : {}),
  };
  const { data: dashboard } = useCommerceDashboard(dashboardParams, overview);
  const { data: workspaceData } = useCommerceWorkspaces(dashboardParams, !overview);
  const { data: recommendationsData, isLoading: recsLoading } = useCommerceRecommendations(dashboardParams, true);
  const saveTargets = useSaveCommerceTargets();
  const content = {
    overview: ['Business Overview', 'Daily intelligence feed and target pacing.'],
    finance: ['Finance', 'Revenue, expense, and category-level cost control.'],
    sales: ['Sales', 'Deal pipeline, order performance, and follow-up actions.'],
    marketing: ['Marketing', 'Ad performance and spend efficiency.'],
    customers: ['Customer Service', 'Leads, inquiries, and customer relationships.'],
    inventory: ['Product & Inventory', 'Catalog, stock levels, and restock alerts.'],
  }[workspace];

  useEffect(() => {
    if (!dashboard?.targets) return;
    const prefill = (value: number | null) => (value !== null && value !== undefined ? String(value) : '');
    setTargetRevenue(prefill(dashboard.targets.targetSalesAmount));
    setTargetExpense(prefill(dashboard.targets.targetExpenseAmount));
    setTargetOrders(prefill(dashboard.targets.targetDemandCount));
    setTargetFulfilledOrders(prefill(dashboard.targets.targetAppointments));
    setTargetNewCustomers(prefill(dashboard.targets.targetNewCustomers));
  }, [dashboard?.targets]);

  const iconMap = {
    DollarSign,
    Wallet,
    TrendingUp,
    Megaphone,
    CalendarCheck,
    Users,
  };

  // Loading placeholders — no fake targets, matching the API's "Not set" state.
  const fallbackOverviewCards = [
    ['Revenue', amount(0), 'Not set', 'Set targets to track pacing', 'Not Set', 'slate', DollarSign, 0],
    ['Expense Limit', amount(0), 'Not set', 'Set targets to track pacing', 'Not Set', 'slate', Wallet, 0],
    ['Profit Margin', '0.0%', 'Not set', 'Set revenue & expense targets', 'Not Set', 'slate', TrendingUp, 0],
    ['Orders Received', '0', 'Not set', 'Set targets to track pacing', 'Not Set', 'slate', Megaphone, 0],
    ['Orders Fulfilled', '0', 'Not set', 'Set targets to track pacing', 'Not Set', 'slate', CalendarCheck, 0],
    ['New Customers', '0', 'Not set', 'Set targets to track pacing', 'Not Set', 'slate', Users, 0],
  ] as const;

  const cards = [
    ...(dashboard?.kpis.map((kpi) => [kpi.title, kpi.value, kpi.target, kpi.expected, kpi.status, kpi.tone, iconMap[kpi.icon], kpi.progressPercent] as const) ?? fallbackOverviewCards),
  ] as const;

  // Targets are stored per calendar period (month/year), matching
  // /api/settings/target. Non-calendar views anchor to their range's month.
  const targetAnchorParams = () => {
    if (period === 'year') return { period: 'year' as const, year: Number(year), month: 0 };
    if (period === 'month' || period === 'day') return { period: 'month' as const, year: Number(year), month: Number(month) };
    const base = period === 'custom' && customFrom ? new Date(`${customFrom}T00:00:00Z`) : new Date();
    return { period: 'month' as const, year: base.getUTCFullYear(), month: base.getUTCMonth() + 1 };
  };
  const anchor = targetAnchorParams();
  const anchorLabel = anchor.period === 'year'
    ? `${anchor.year} (Yearly)`
    : new Date(anchor.year, anchor.month - 1).toLocaleString('en', { month: 'long', year: 'numeric' });

  function handleSaveTargets() {
    const orNull = (value: string) => (value.trim() === '' ? null : Number(value));
    saveTargets.mutate({
      period: anchor.period,
      year: anchor.year,
      month: anchor.month,
      // Blank inputs clear the target (null) instead of saving zeros.
      targetSalesAmount: orNull(targetRevenue),
      targetExpenseAmount: orNull(targetExpense),
      targetDemandCount: orNull(targetOrders),
      targetAppointments: orNull(targetFulfilledOrders),
      targetNewCustomers: orNull(targetNewCustomers),
    }, {
      onSuccess: () => setIsTargetDialogOpen(false),
    });
  }

  async function handleDeleteAll() {
    setIsDeleting(true);
    try {
      const search = new URLSearchParams({ workspace });
      if ((period === 'month' || period === 'day' || period === 'year' || period === 'custom') && dateFrom && dateTo) {
        search.set('from', dateFrom);
        search.set('to', dateTo);
      }
      const response = await fetch(`/api/commerce/delete-all?${search.toString()}`, { method: 'DELETE' });
      const result = await response.json() as { count?: number; message?: string };
      if (!response.ok) throw new Error(result.message ?? 'Unable to move records to Trash');
      toast.success(`${result.count ?? 0} ${content[0]} record${result.count === 1 ? '' : 's'} moved to Trash`);
      // Refresh every workspace view (and Trash) so the deletion shows immediately.
      // Note: deals + marketing-metrics power their own tables via useDeals /
      // useMarketingMetrics, so they must be invalidated too — otherwise the
      // KPIs clear to 0 while the table keeps stale rows until a refresh.
      await queryClient.invalidateQueries({ queryKey: dealsKeys.all });
      await queryClient.invalidateQueries({ queryKey: marketingMetricKeys.all });
      await queryClient.invalidateQueries({ queryKey: commerceDashboardKeys.all });
      await queryClient.invalidateQueries({ queryKey: commerceCustomersKeys.all });
      await queryClient.invalidateQueries({ queryKey: trashKeys.all });
      setIsDeleteAllOpen(false);
      setDeleteConfirmText('');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to move records to Trash');
    } finally {
      setIsDeleting(false);
    }
  }

  return (
    <main className="space-y-8">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground mb-1 font-heading">{content[0]}</h1>
          <p className="text-muted-foreground text-sm">{content[1]}</p>
        </div>
        <div className="flex w-full flex-wrap items-center gap-2 rounded-xl border border-slate-200/80 bg-white/70 p-1.5 shadow-sm backdrop-blur-sm dark:border-slate-800 dark:bg-slate-900/60 lg:w-auto">
          <Select value={period} onValueChange={(value) => {
            if (value === 'overall' || value === 'day' || value === 'month' || value === 'year' || value === 'custom') {
              updatePeriod({ period: value });
            }
          }}>
            <SelectTrigger className="h-9 w-36 rounded-lg border border-slate-200 bg-background text-sm font-semibold text-slate-800 shadow-sm transition-colors hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800 dark:text-slate-200">
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
              <Input type="date" value={customFrom} onChange={(event) => updatePeriod({ customFrom: event.target.value })} className="h-9 w-40 rounded-lg border border-slate-200 bg-background text-sm font-semibold shadow-sm dark:border-slate-700" aria-label="Start date" />
              <span className="px-1 text-xs font-medium text-muted-foreground">to</span>
              <Input type="date" value={customTo} min={customFrom} onChange={(event) => updatePeriod({ customTo: event.target.value })} className="h-9 w-40 rounded-lg border border-slate-200 bg-background text-sm font-semibold shadow-sm dark:border-slate-700" aria-label="End date" />
            </div>
          ) : period === 'day' ? (
            <Input
              type="date"
              value={`${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`}
              onChange={(event) => {
                const next = new Date(`${event.target.value}T00:00:00`);
                if (!Number.isNaN(next.getTime())) updatePeriod({ year: next.getFullYear(), month: next.getMonth() + 1, day: next.getDate() });
              }}
              className="h-9 w-40 rounded-lg border border-slate-200 bg-background text-sm font-semibold shadow-sm dark:border-slate-700"
              aria-label="Select day"
            />
          ) : period === 'month' ? (
            <Select value={String(month)} onValueChange={(value) => {
              if (value) updatePeriod({ month: Number(value) });
            }}>
              <SelectTrigger className="h-9 w-32 rounded-lg border border-slate-200 bg-background text-sm font-semibold text-slate-800 shadow-sm transition-colors hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800 dark:text-slate-200">
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
            <Select value={String(year)} onValueChange={(value) => {
              if (value) updatePeriod({ year: Number(value) });
            }}>
              <SelectTrigger className="h-9 w-24 rounded-lg border border-slate-200 bg-background text-sm font-semibold text-slate-800 shadow-sm transition-colors hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800 dark:text-slate-200">
                {year}
              </SelectTrigger>
              <SelectContent>
                {filterYears.map((itemYear) => (
                  <SelectItem key={itemYear} value={String(itemYear)}>
                    {itemYear}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          {overview ? (
            <Button onClick={() => setIsTargetDialogOpen(true)} variant="outline" className="h-9 rounded-lg border-2 border-slate-300 dark:border-slate-800 bg-card hover:bg-slate-50 dark:hover:bg-slate-800/80 text-xs font-bold gap-1.5 px-3 cursor-pointer"><Target className="w-4 h-4 text-emerald-500 animate-pulse" />Set Targets</Button>
          ) : (
            <Button onClick={() => { setDeleteConfirmText(''); setIsDeleteAllOpen(true); }} variant="outline" className="h-9 rounded-lg shrink-0 cursor-pointer bg-red-950/20 border-red-900/50 text-red-700 dark:text-red-300 hover:bg-red-900/40 hover:text-red-800 dark:hover:text-red-200 text-xs font-bold gap-1.5 px-3"><Trash2 className="w-4 h-4" />Delete All</Button>
          )}
        </div>
      </header>

      {workspace === 'finance' ? (
        <FinanceWorkspace
          data={workspaceData?.finance}
          recommendations={recommendationsData?.recommendations}
          isRecommendationsLoading={recsLoading}
          defaultDate={dateFrom}
        />
      ) : workspace === 'sales' ? (
        <SalesWorkspace
          data={workspaceData?.sales}
          recommendations={recommendationsData?.recommendations}
          isRecommendationsLoading={recsLoading}
          dateFrom={dateFrom}
          dateTo={dateTo}
        />
      ) : workspace === 'marketing' ? (
        <MarketingWorkspace
          data={workspaceData?.marketing}
          recommendations={recommendationsData?.recommendations}
          isRecommendationsLoading={recsLoading}
          dateFrom={dateFrom}
          dateTo={dateTo}
        />
      ) : workspace === 'customers' ? (
        <CustomerServiceView params={dashboardParams} dateFrom={dateFrom} dateTo={dateTo} />
      ) : workspace === 'inventory' ? (
        <InventoryWorkspace
          data={workspaceData?.inventory}
          recommendations={recommendationsData?.recommendations}
          isRecommendationsLoading={recsLoading}
        />
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {cards.map(([title, value, target, expected, status, tone, icon, progressPercent]) => (
              <ProgressCard
                key={title}
                title={title}
                value={value}
                target={target}
                expected={expected}
                status={status}
                tone={tone}
                icon={icon}
                progressPercent={progressPercent}
              />
            ))}
          </div>

          <SmartSuggestions
            recommendations={recommendationsData?.recommendations}
            isLoading={recsLoading}
            onSetTargets={() => setIsTargetDialogOpen(true)}
            areaFilter="general"
          />

          <BusinessOverviewAnalytics
            dashboard={dashboard}
            periodLabel={periodRangeLabel(period, year, month, day, customFrom, customTo)}
          />
        </>
      )}

      <Dialog open={isTargetDialogOpen} onOpenChange={setIsTargetDialogOpen}>
        <DialogContent showCloseButton={false} className="w-full max-w-md rounded-xl border border-slate-200 bg-card p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto dark:border-slate-800">
          <DialogHeader className="flex-row items-center justify-between border-b border-border pb-3">
            <div>
              <DialogTitle className="font-extrabold text-foreground flex items-center gap-2"><Target className="w-5 h-5 text-emerald-500" />Set Period Targets</DialogTitle>
              <DialogDescription className="mt-0.5 text-[11px] font-bold uppercase tracking-wide">Saved for {anchorLabel}</DialogDescription>
            </div>
            <Button aria-label="Close target settings" variant="ghost" size="icon" className="h-8 w-8 rounded-full text-muted-foreground hover:text-foreground" onClick={() => setIsTargetDialogOpen(false)}>✕</Button>
          </DialogHeader>
          <div className="space-y-4 text-xs font-semibold text-foreground">
            <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 mb-1.5 uppercase tracking-wide">Target Revenue (KS)<Input className="mt-1.5 h-10 text-xs bg-muted border-border font-bold" value={targetRevenue} onChange={(event) => setTargetRevenue(event.target.value)} inputMode="numeric" /></label>
            <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 mb-1.5 uppercase tracking-wide">Target Expense (KS)<Input className="mt-1.5 h-10 text-xs bg-muted border-border font-bold" value={targetExpense} onChange={(event) => setTargetExpense(event.target.value)} inputMode="numeric" /></label>
            <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 mb-1.5 uppercase tracking-wide">Target Orders Received<Input className="mt-1.5 h-10 text-xs bg-muted border-border font-bold" value={targetOrders} onChange={(event) => setTargetOrders(event.target.value)} inputMode="numeric" /></label>
            <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 mb-1.5 uppercase tracking-wide">Target Orders Fulfilled<Input className="mt-1.5 h-10 text-xs bg-muted border-border font-bold" value={targetFulfilledOrders} onChange={(event) => setTargetFulfilledOrders(event.target.value)} inputMode="numeric" /></label>
            <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 mb-1.5 uppercase tracking-wide">Target New Customers<Input className="mt-1.5 h-10 text-xs bg-muted border-border font-bold" value={targetNewCustomers} onChange={(event) => setTargetNewCustomers(event.target.value)} inputMode="numeric" /></label>
          </div>
          <div className="flex justify-end gap-2 pt-2 border-t border-border">
            <Button variant="outline" size="sm" className="border-border text-foreground rounded-lg" onClick={() => setIsTargetDialogOpen(false)} disabled={saveTargets.isPending}>Cancel</Button>
            <Button size="sm" onClick={handleSaveTargets} disabled={saveTargets.isPending} className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg px-4">{saveTargets.isPending ? 'Saving…' : 'Save Targets'}</Button>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={isDeleteAllOpen} onOpenChange={(open) => { setIsDeleteAllOpen(open); if (!open) setDeleteConfirmText(''); }}>
        <AlertDialogContent className="bg-card border-border text-foreground">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete all {content[0].toLowerCase()} records?</AlertDialogTitle>
            <AlertDialogDescription>All active records in this workspace will be moved to Trash. Type <strong>confirm</strong> to continue.</AlertDialogDescription>
          </AlertDialogHeader>
          <label className="grid gap-2 text-sm font-semibold text-foreground">Type confirm to move these records to Trash
            <Input value={deleteConfirmText} onChange={(event) => setDeleteConfirmText(event.target.value)} disabled={isDeleting} placeholder="confirm" className="h-10 font-mono" />
          </label>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-border text-foreground" disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={(event) => { event.preventDefault(); void handleDeleteAll(); }} disabled={isDeleting || deleteConfirmText.toLowerCase() !== 'confirm'} className="bg-red-600 hover:bg-red-700 text-white">{isDeleting ? 'Deleting…' : 'Move to Trash'}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </main>
  );
}
