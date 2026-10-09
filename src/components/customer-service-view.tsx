'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  BarChart3,
  Bot,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Crown,
  DollarSign,
  Edit2,
  HeartPulse,
  MessageSquare,
  Loader2,
  Phone,
  Plus,
  RotateCcw,
  Search,
  Trash2,
  Users,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select';
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
import { ModalPortal } from '@/components/ui/modal-portal';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { formatPhoneNumber } from '@/lib/utils';
import type { CommerceCustomerRecordRow, CommerceCustomerRecordInput, CommerceDashboardParams, CommerceCustomerMetric, Customer } from '@/lib/api';
import {
  useCommerceCustomerAnalytics,
  useCommerceCustomerDirectory,
  useCommerceCustomerStats,
  useCreateCommerceCustomer,
  useDeleteCommerceCustomer,
  useUpdateCommerceCustomer,
} from '@/hooks/use-commerce-customers';
import { useDemandRecordStats } from '@/hooks/use-demand-records';
import {
  useCommerceCustomerRecords,
  useCreateCommerceCustomerRecord,
  useDeleteCommerceCustomerRecord,
  useUpdateCommerceCustomerRecord,
} from '@/hooks/use-commerce-customers';

const PAGE_SIZE = 10;

const statusColors: Record<string, string> = {
  active: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20',
  inactive: 'bg-slate-500/10 text-muted-foreground border-slate-500/20',
  pending: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20',
};

const priorityColors: Record<string, string> = {
  high: 'bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20 font-bold',
  medium: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20 font-bold',
  low: 'bg-slate-500/10 text-muted-foreground border-slate-500/20',
};

const leadStatusColors: Record<string, string> = {
  new: 'bg-blue-500/10 text-blue-600 border-blue-500/20',
  contacted: 'bg-purple-500/10 text-purple-600 border-purple-500/20',
  quoted: 'bg-amber-500/10 text-amber-600 border-amber-500/20',
  pending: 'bg-indigo-500/10 text-indigo-600 border-indigo-500/20',
  closed: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20',
  completed: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20',
  lost: 'bg-slate-500/10 text-muted-foreground border-slate-500/20',
};

type EditableClient = Pick<Customer, 'id' | 'name' | 'phone' | 'email' | 'company' | 'status' | 'notes'>;

type Insight = {
  type: string;
  severity: 'urgent' | 'warning' | 'success' | 'info';
  title: string;
  message: string;
  recommendedAction: string;
  action?: string;
  actionType?: string;
};

function CustomerMetricCard({ label, value, icon: Icon, tone, loading }: { label: string; value: number; icon: typeof DollarSign; tone: string; loading: boolean }) {
  return (
    <div className={`rounded-xl border border-slate-200 border-l-4 ${tone} bg-card p-4 dark:border-slate-800`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500">{label}</p>
          {loading ? (
            <Skeleton className="mt-2 h-6 w-28" />
          ) : (
            <p className="mt-2 text-xl font-black text-foreground">
              {Math.round(value).toLocaleString()} <span className="text-[10px] font-bold text-slate-400">MMK</span>
            </p>
          )}
        </div>
        <Icon className="h-5 w-5 text-slate-400" />
      </div>
    </div>
  );
}

function CustomerRanking({ title, items, loading, accent }: { title: string; items: CommerceCustomerMetric[]; loading: boolean; accent: string }) {
  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 dark:border-slate-800">
      <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-800 dark:bg-slate-950/30">
        <h3 className={`text-sm font-bold ${accent}`}>{title}</h3>
        <span className="text-[11px] text-muted-foreground">Spend · frequency · LTV</span>
      </div>
      {loading ? (
        <div className="space-y-3 p-4"><Skeleton className="h-8 w-full" /><Skeleton className="h-8 w-full" /><Skeleton className="h-8 w-full" /></div>
      ) : items.length === 0 ? (
        <p className="p-6 text-center text-sm text-muted-foreground">No customer spending data for this period.</p>
      ) : (
        <div className="divide-y divide-slate-100 dark:divide-slate-900">
          {items.slice(0, 5).map((customer, index) => (
            <div key={customer.id} className="grid grid-cols-[2rem_1fr_auto] items-center gap-3 px-4 py-3">
              <span className="text-xs font-black text-slate-400">{index + 1}</span>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-foreground">{customer.name}</p>
                <p className="truncate text-[11px] text-muted-foreground">{customer.purchaseFrequency} purchase{customer.purchaseFrequency === 1 ? '' : 's'} · LTV {Math.round(customer.lifetimeValue).toLocaleString()} MMK</p>
              </div>
              <p className="whitespace-nowrap text-sm font-bold text-foreground">{Math.round(customer.totalSpend).toLocaleString()}</p>
            </div>
          ))}
        </div>
      )}
      {items.length > 5 && (
        <p className="border-t border-slate-100 px-4 py-2 text-center text-[11px] font-semibold text-muted-foreground dark:border-slate-900">Showing 5 of {items.length} customers</p>
      )}
    </div>
  );
}

export function CustomerServiceView({ params, dateFrom, dateTo }: { params: CommerceDashboardParams; dateFrom: string; dateTo: string }) {
  // Purchased Customers Directory state
  const [customerSearch, setCustomerSearch] = useState('');
  const [debouncedCustomerSearch, setDebouncedCustomerSearch] = useState('');
  const [customerPage, setCustomerPage] = useState(1);

  // Purchase Records state
  const [recordSearch, setRecordSearch] = useState('');
  const [debouncedRecordSearch, setDebouncedRecordSearch] = useState('');
  const [followUpFilter, setFollowUpFilter] = useState('all');
  const [recordPage, setRecordPage] = useState(1);

  // Modals Open/Prefill State
  const [editingCustomer, setEditingCustomer] = useState<EditableClient | null>(null);
  const [isCreatingCustomer, setIsCreatingCustomer] = useState(false);
  const [customerForm, setCustomerForm] = useState({ name: '', company: '', phone: '', email: '', status: 'active', notes: '' });

  const [editingLead, setEditingLead] = useState<CommerceCustomerRecordRow | null>(null);
  const [isCreatingLead, setIsCreatingLead] = useState(false);
  const [leadForm, setLeadForm] = useState({
    customerName: '',
    customerPhone: '',
    customerCompany: '',
    productName: '',
    purchaseAmount: '',
    quantity: '1',
    followUpDate: '',
    status: 'new',
    note: '',
  });

  // Delete Dialog States
  const [customerToDelete, setCustomerToDelete] = useState<EditableClient | null>(null);
  const [leadToDelete, setLeadToDelete] = useState<CommerceCustomerRecordRow | null>(null);
  const [showBehaviorAnalysis, setShowBehaviorAnalysis] = useState(false);
  const [customerDeleteConfirmText, setCustomerDeleteConfirmText] = useState('');
  const [leadDeleteConfirmText, setLeadDeleteConfirmText] = useState('');

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedCustomerSearch(customerSearch);
      setCustomerPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [customerSearch]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedRecordSearch(recordSearch);
      setRecordPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [recordSearch]);

  const [lastPeriodKey, setLastPeriodKey] = useState(() => `${params.period}:${params.year}:${params.month}:${params.day ?? ''}:${params.from ?? ''}:${params.to ?? ''}`);
  const periodKey = `${params.period}:${params.year}:${params.month}:${params.day ?? ''}:${params.from ?? ''}:${params.to ?? ''}`;
  if (lastPeriodKey !== periodKey) {
    setLastPeriodKey(periodKey);
    setCustomerPage(1);
    setRecordPage(1);
  }

  // Queries
  const { data: customerData, isLoading: customerLoading } = useCommerceCustomerDirectory({
    ...params,
    page: customerPage,
    limit: PAGE_SIZE,
    search: debouncedCustomerSearch || undefined,
  });
  const { data: stats, isLoading: statsLoading } = useCommerceCustomerStats(params);
  const { data: analytics, isLoading: analyticsLoading } = useCommerceCustomerAnalytics(params);
  const { data: demandStats, isLoading: demandStatsLoading } = useDemandRecordStats({ dateFrom, dateTo });
  const { data: recordData, isLoading: recordsLoading } = useCommerceCustomerRecords({
    ...params,
    page: recordPage,
    limit: PAGE_SIZE,
    search: debouncedRecordSearch || undefined,
    followUpStatus: followUpFilter as 'all' | 'overdue' | 'due',
  });

  // Mutations
  const createCustomerMutation = useCreateCommerceCustomer();
  const updateCustomerMutation = useUpdateCommerceCustomer();
  const deleteCustomer = useDeleteCommerceCustomer();
  const createLeadMutation = useCreateCommerceCustomerRecord();
  const updateLeadMutation = useUpdateCommerceCustomerRecord();
  const deleteLeadMutation = useDeleteCommerceCustomerRecord();

  function handleSaveCustomer(e: React.FormEvent) {
    e.preventDefault();
    if (!customerForm.name.trim()) {
      toast.error('Name is required');
      return;
    }
    const payload = {
      name: customerForm.name.trim(),
      company: customerForm.company.trim() || null,
      phone: customerForm.phone.trim() || null,
      email: customerForm.email.trim() || null,
      status: customerForm.status,
      notes: customerForm.notes.trim() || null,
    };
    if (editingCustomer) {
      updateCustomerMutation.mutate({ id: editingCustomer.id, ...payload }, { onSuccess: () => setEditingCustomer(null) });
    } else {
      createCustomerMutation.mutate(payload, { onSuccess: () => setIsCreatingCustomer(false) });
    }
  }

  function handleSaveLead(e: React.FormEvent) {
    e.preventDefault();
    if (!leadForm.customerName.trim()) {
      toast.error('Customer name is required');
      return;
    }
    const payload: CommerceCustomerRecordInput = {
      customerName: leadForm.customerName.trim(),
      customerPhone: leadForm.customerPhone.trim() || null,
      customerCompany: leadForm.customerCompany.trim() || null,
      productName: leadForm.productName.trim() || null,
      amount: leadForm.purchaseAmount ? parseFloat(leadForm.purchaseAmount) : null,
      quantity: leadForm.quantity ? parseInt(leadForm.quantity) : 1,
      followUpDate: leadForm.followUpDate || null,
      status: leadForm.status as CommerceCustomerRecordInput['status'],
      note: leadForm.note.trim() || '',
    };
    if (editingLead) {
      updateLeadMutation.mutate({ id: editingLead.id, ...payload }, { onSuccess: () => setEditingLead(null) });
    } else {
      createLeadMutation.mutate(payload, { onSuccess: () => setIsCreatingLead(false) });
    }
  }

  function openEditCustomer(customer: EditableClient) {
    setEditingCustomer(customer);
    setCustomerForm({
      name: customer.name,
      company: customer.company || '',
      phone: customer.phone || '',
      email: customer.email || '',
      status: customer.status,
      notes: customer.notes || '',
    });
  }

  function openCreateCustomer() {
    setIsCreatingCustomer(true);
    setCustomerForm({ name: '', company: '', phone: '', email: '', status: 'active', notes: '' });
  }

  function openEditLead(record: CommerceCustomerRecordRow) {
    setEditingLead(record);
    setLeadForm({
      customerName: record.customerName || '',
      customerPhone: record.phone ? String(record.phone).replace(/^\+959/, '09') : '',
      customerCompany: record.company || '',
      productName: record.product || '',
      purchaseAmount: record.amount ? String(record.amount) : '',
      quantity: '1',
      followUpDate: '',
      status: record.status === 'lost' ? 'pending' : record.status,
      note: '',
    });
  }

  function openCreateLead() {
    setIsCreatingLead(true);
    setLeadForm({
      customerName: '',
      customerPhone: '',
      customerCompany: '',
      productName: '',
      purchaseAmount: '',
      quantity: '1',
      followUpDate: '',
      status: 'new',
      note: '',
    });
  }

  const totalPurchaseRecords = stats?.totalPurchaseRecords ?? 0;
  const pendingPurchaseRecords = stats?.pendingPurchaseRecords ?? 0;
  const purchaseCustomers = stats?.purchaseCustomers ?? customerData?.total ?? 0;
  const avgSpending = stats?.avgSpendingValue ?? 0;

  const foundFollowUp = demandStats?.insights?.find(
    (insight) => insight.title.includes('Follow-up') || insight.actionType === 'view_overdue' || insight.actionType === 'view_due_today',
  );
  const followUpInsight: Insight = foundFollowUp
    ? {
        type: 'sales',
        severity: (foundFollowUp.severity as Insight['severity']) ?? 'info',
        title: foundFollowUp.title,
        message: foundFollowUp.message,
        recommendedAction: foundFollowUp.recommendedAction,
        action: 'Follow-up စစ်ရန်',
        actionType: foundFollowUp.actionType ?? 'view_overdue',
      }
    : {
        type: 'sales',
        severity: 'info',
        title: 'Follow-up နောက်ဆက်တွဲ ဆက်သွယ်မှု',
        message: 'လတ်တလော လုပ်ဆောင်ရန်လိုအပ်သော follow-up နောက်ဆက်တွဲ ဖုန်းခေါ်ဆိုမှုများ မရှိသေးပါ။',
        recommendedAction: 'နောက်ဆက်တွဲ လုပ်ဆောင်ရန်မရှိသေးသည့် Leads များအတွက် follow-up ရက်စွဲများ သတ်မှတ်ပေးပါ။',
        action: 'Follow-up စစ်ရန်',
        actionType: 'view_overdue',
      };

  const atRiskCustomers = analytics?.summary.atRiskCustomers ?? 0;
  const customerHealthInsight: Insight = {
    type: 'customer_health',
    severity: atRiskCustomers > 0 ? 'warning' : 'success',
    title: atRiskCustomers > 0 ? 'ပြန်လည်ဆက်သွယ်ရန် Customer များရှိသည်' : 'Customer ဝယ်ယူမှုအခြေအနေ ကောင်းမွန်သည်',
    message:
      atRiskCustomers > 0
        ? `ဝယ်ယူမှုမှတ်တမ်းရှိသော်လည်း ရက် ၉၀ ကျော် လှုပ်ရှားမှုမရှိသော Customer ${atRiskCustomers} ဦး ရှိသည်။`
        : 'လက်ရှိ Customer ဝယ်ယူမှုမှတ်တမ်းများအရ ရက် ၉၀ ကျော် လှုပ်ရှားမှုမရှိသော Customer မတွေ့ရပါ။',
    recommendedAction:
      atRiskCustomers > 0
        ? 'ပြန်လည်ဝယ်ယူမှုရရှိစေရန် Follow-up ဆက်သွယ်ပြီး သင့်တော်သော Offer ကို ပေးပို့ပါ။'
        : 'Customer ဝယ်ယူမှုနှုန်းနှင့် Lifetime Value ကို ဆက်လက်စောင့်ကြည့်ပါ။',
    action: 'ဖောက်သည် စစ်ရန်',
    actionType: 'view_customer_health',
  };

  return (
    <div className="space-y-6">
      {/* Metrics Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {[
          { label: 'Purchase Records', value: totalPurchaseRecords, color: 'text-slate-900 dark:text-slate-100', loading: statsLoading, icon: MessageSquare, accent: 'border-l-4 border-l-slate-500' },
          { label: 'Pending Purchases', value: pendingPurchaseRecords, color: 'text-blue-600 dark:text-blue-400', loading: statsLoading, accent: 'border-l-4 border-l-blue-500', icon: AlertTriangle },
          { label: 'Purchase Customers', value: purchaseCustomers, color: 'text-emerald-600 dark:text-emerald-400', loading: statsLoading, accent: 'border-l-4 border-l-emerald-500', icon: Users },
          { label: 'Avg Spending Value', value: avgSpending, displayVal: Math.round(avgSpending).toLocaleString(), suffix: 'MMK', color: 'text-slate-900 dark:text-slate-100', loading: statsLoading, icon: DollarSign, accent: 'border-l-4 border-l-amber-500' },
        ].map((item) => {
          const Icon = item.icon;
          return (
            <Card key={item.label} className={`bg-card border-2 border-slate-200 dark:border-slate-800 shadow-sm rounded-xl ${item.accent}`}>
              <CardContent className="p-6 h-32 flex flex-col justify-center">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-[10px] font-extrabold text-slate-500 uppercase tracking-wider mb-2">{item.label}</p>
                    {item.loading ? (
                      <Skeleton className="h-8 w-16 bg-muted" />
                    ) : (
                      <h3 className={`flex items-baseline gap-1.5 text-2xl font-black ${item.color} tracking-tight`}>
                        <span>{item.displayVal ?? item.value.toLocaleString()}</span>
                        {'suffix' in item && item.suffix && <span className="text-xs font-bold text-slate-400">{item.suffix}</span>}
                      </h3>
                    )}
                  </div>
                  <div className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-900 flex items-center justify-center text-slate-400">
                    <Icon className="w-4 h-4" />
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Intelligence Cards */}
      {!demandStatsLoading && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[followUpInsight, customerHealthInsight].map((insight) => {
            const isUrgent = insight.severity === 'urgent';
            const isWarning = insight.severity === 'warning';
            const isSuccess = insight.severity === 'success';
            const InsightIcon = isUrgent ? AlertTriangle : isWarning ? Phone : CheckCircle2;
            return (
              <Card
                key={insight.title}
                className={`bg-white dark:bg-card border-2 rounded-xl shadow-sm flex flex-col justify-between ${
                  isUrgent
                    ? 'border-red-300 border-l-8 border-l-red-500'
                    : isWarning
                      ? 'border-amber-300 border-l-8 border-l-amber-500'
                      : isSuccess
                        ? 'border-emerald-300 border-l-8 border-l-emerald-500'
                        : 'border-sky-300 border-l-8 border-l-sky-500'
                }`}
              >
                <CardContent className="p-5 flex flex-col h-full justify-between">
                  <div>
                    <div className="flex items-center gap-3 mb-2">
                      <InsightIcon className={`w-5 h-5 shrink-0 ${isUrgent ? 'text-red-600' : isWarning ? 'text-amber-600' : isSuccess ? 'text-emerald-600' : 'text-sky-600'}`} />
                      <h4 className="font-bold text-slate-900 dark:text-slate-100">{insight.title}</h4>
                    </div>
                    <p className="text-xs text-slate-600 dark:text-slate-400 mb-1 leading-relaxed">{insight.message}</p>
                    <p className="text-xs font-semibold text-slate-800 dark:text-slate-300 leading-relaxed">{insight.recommendedAction}</p>
                  </div>
                  <div className="mt-3.5">
                    <Button
                      size="sm"
                      onClick={() => {
                        if (insight.actionType === 'view_customer_health') {
                          document.getElementById('customer-value-frequency')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                        } else {
                          document.getElementById('commerce-purchase-records-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                        }
                      }}
                      className={`${
                        isUrgent
                          ? 'bg-red-600 hover:bg-red-700 text-white'
                          : isWarning
                            ? 'bg-amber-500 hover:bg-amber-600 text-white'
                            : isSuccess
                              ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                              : 'bg-sky-600 hover:bg-sky-700 text-white'
                      } text-xs font-bold rounded-lg px-4 h-8 cursor-pointer transition shadow-sm border-none`}
                    >
                      {insight.action}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Customer Value & Frequency */}
      <Card id="customer-value-frequency" className="overflow-hidden rounded-xl border-2 border-slate-200 shadow-sm dark:border-slate-800">
        <div className="flex flex-col gap-3 border-b border-slate-200 bg-slate-50/70 p-5 dark:border-slate-800 dark:bg-slate-950/30 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-sm font-bold text-foreground"><BarChart3 className="h-4 w-4 text-sky-600" />Customer Value &amp; Frequency</CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">Top and bottom 20 customers are ranked by selected-period spending. Lifetime value is calculated from all customer history.</p>
          </div>
          <Badge variant="outline" className="w-fit border-slate-300 bg-card text-xs font-semibold">{analytics?.summary.totalCustomers ?? 0} active customers</Badge>
        </div>
        <CardContent className="p-5">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <CustomerMetricCard label="Top 20 average spend" value={analytics?.summary.top20AverageSpend ?? 0} icon={Crown} tone="border-l-amber-500" loading={analyticsLoading} />
            <CustomerMetricCard label="Bottom 20 average spend" value={analytics?.summary.bottom20AverageSpend ?? 0} icon={RotateCcw} tone="border-l-slate-500" loading={analyticsLoading} />
            <CustomerMetricCard label="Average lifetime value" value={analytics?.summary.averageLifetimeValue ?? 0} icon={HeartPulse} tone="border-l-emerald-500" loading={analyticsLoading} />
          </div>
          <div className="mt-5 grid grid-cols-1 gap-5 xl:grid-cols-2">
            <CustomerRanking title="Top 20 customers" items={analytics?.top20 ?? []} loading={analyticsLoading} accent="text-amber-700 dark:text-amber-300" />
            <CustomerRanking title="Bottom 20 customers" items={analytics?.bottom20 ?? []} loading={analyticsLoading} accent="text-slate-700 dark:text-slate-300" />
          </div>
        </CardContent>
      </Card>

      {/* Customer Behavior Analysis */}
      <Card className="border-2 border-sky-200 bg-sky-50/30 shadow-sm dark:border-sky-900/60 dark:bg-sky-950/15">
        <CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-sm font-bold text-foreground"><Bot className="h-4 w-4 text-sky-600" />Customer Behavior Analysis</CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">Analyzes customer behavior and provides insights into customer actions.</p>
          </div>
          <Button variant="outline" size="sm" onClick={() => setShowBehaviorAnalysis((visible) => !visible)} className="shrink-0 border-border bg-card text-foreground hover:bg-muted/50">
            {showBehaviorAnalysis ? 'Hide analysis' : 'View analysis'}
            {showBehaviorAnalysis ? <ChevronUp className="ml-1.5 h-4 w-4" /> : <ChevronDown className="ml-1.5 h-4 w-4" />}
          </Button>
        </CardContent>
        {showBehaviorAnalysis && (
          <CardContent className="border-t border-sky-200 p-5 dark:border-sky-900/60">
            {analyticsLoading ? (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2"><Skeleton className="h-32 rounded-xl animate-pulse" /><Skeleton className="h-32 rounded-xl animate-pulse" /></div>
            ) : analytics?.recommendations.length ? (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                {analytics.recommendations.map((insight) => {
                  const isWarning = insight.tone === 'warning';
                  const isSuccess = insight.tone === 'success';
                  const RecommendationIcon = isWarning ? AlertTriangle : isSuccess ? CheckCircle2 : Bot;
                  return (
                    <Card key={insight.title} className={`bg-white dark:bg-card border-2 rounded-xl shadow-sm flex flex-col justify-between ${isWarning ? 'border-amber-300 border-l-8 border-l-amber-500' : isSuccess ? 'border-emerald-300 border-l-8 border-l-emerald-500' : 'border-sky-300 border-l-8 border-l-sky-500'}`}>
                      <CardContent className="p-5 flex flex-col h-full justify-between">
                        <div>
                          <div className="mb-2 flex items-center gap-3">
                            <RecommendationIcon className={`h-5 w-5 shrink-0 ${isWarning ? 'text-amber-600' : isSuccess ? 'text-emerald-600' : 'text-sky-600'}`} />
                            <h4 className="font-bold text-slate-900 dark:text-slate-100">{insight.title}</h4>
                          </div>
                          <p className="text-xs leading-relaxed text-slate-600 dark:text-slate-400">{insight.message}</p>
                        </div>
                        <div className="mt-3.5">
                          <Button size="sm" onClick={() => document.getElementById('customer-value-frequency')?.scrollIntoView({ behavior: 'smooth', block: 'start' })} className={`${isWarning ? 'bg-amber-500 hover:bg-amber-600' : isSuccess ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-sky-600 hover:bg-sky-700'} h-8 rounded-lg border-none px-4 text-xs font-bold text-white shadow-sm transition cursor-pointer`}>
                            {insight.action}
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            ) : (
              <p className="py-4 text-center text-sm text-muted-foreground">ဝယ်ယူမှုမှတ်တမ်း မလုံလောက်သေးပါ။ Sales orders မှတ်တမ်းများ ထည့်သွင်းပြီးနောက် အပြုအမူခွဲခြမ်းစိတ်ဖြာမှုကို ကြည့်ရှုနိုင်ပါသည်။</p>
            )}
          </CardContent>
        )}
      </Card>

      {/* 1. Purchased Customers Directory Card */}
      <Card className="bg-card border-2 border-slate-200 dark:border-slate-800 rounded-xl shadow-sm overflow-hidden">
        <div className="p-6 border-b border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <CardTitle className="text-lg font-extrabold text-slate-900 dark:text-slate-100 uppercase tracking-wide">1. Purchased Customers Directory</CardTitle>
          <div className="flex items-center gap-3 w-full sm:w-auto">
            <div className="relative flex-1 sm:flex-initial">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
              <Input
                placeholder="Search customers..."
                value={customerSearch}
                onChange={(e) => setCustomerSearch(e.target.value)}
                className="pl-9 bg-muted/50 border-border text-foreground placeholder:text-muted-foreground w-full sm:w-60 focus-visible:ring-ring"
              />
            </div>
            <Button onClick={openCreateCustomer} className="bg-blue-600 hover:bg-blue-700 text-white rounded-lg px-4 h-10 text-xs font-bold transition-all shrink-0 cursor-pointer">
              <Plus className="w-4 h-4 mr-1.5" />
              Add Client
            </Button>
          </div>
        </div>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[800px] text-sm">
              <thead className="bg-slate-50 dark:bg-slate-900/60 text-xs uppercase text-slate-500 border-b border-slate-200 dark:border-slate-800">
                <tr>
                  <th className="px-6 py-4 text-left font-extrabold">Customer Name</th>
                  <th className="px-6 py-4 text-left font-extrabold">Company</th>
                  <th className="px-6 py-4 text-left font-extrabold">Purchased Product</th>
                  <th className="px-6 py-4 text-right font-extrabold">Amount Paid (MMK)</th>
                  <th className="px-6 py-4 text-center font-extrabold">Status</th>
                  <th className="px-6 py-4 text-center font-extrabold">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                {customerLoading ? (
                  Array.from({ length: 5 }).map((_, index) => (
                    <tr key={index}>
                      <td className="px-6 py-4"><Skeleton className="h-4 w-32" /></td>
                      <td className="px-6 py-4"><Skeleton className="h-4 w-28" /></td>
                      <td className="px-6 py-4"><Skeleton className="h-4 w-36" /></td>
                      <td className="px-6 py-4 text-right"><Skeleton className="h-4 w-20 ml-auto" /></td>
                      <td className="px-6 py-4"><Skeleton className="h-5 w-16 mx-auto" /></td>
                      <td className="px-6 py-4"><Skeleton className="h-5 w-14 mx-auto" /></td>
                    </tr>
                  ))
                ) : customerData?.customers && customerData.customers.length > 0 ? (
                  customerData.customers.map((customer) => (
                    <tr key={customer.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-900/40 align-middle">
                      <td className="px-6 py-4">
                        <Link href={`/customers/${customer.id}`} className="font-bold text-slate-900 dark:text-slate-100 hover:text-blue-600 transition-colors">
                          {customer.name}
                        </Link>
                      </td>
                      <td className="px-6 py-4 text-slate-600 dark:text-slate-400 font-semibold">{customer.company || '-'}</td>
                      <td className="px-6 py-4 text-blue-600 dark:text-blue-400 font-bold">
                        {customer.purchasedProduct ? (
                          <span className="inline-flex items-center gap-1.5">
                            {customer.purchasedProduct}
                            {customer.purchaseCount > 1 && (
                              <Badge variant="outline" className="text-[10px] px-1 py-0 bg-blue-50/50 text-blue-700 shrink-0 font-mono">
                                +{customer.purchaseCount - 1} more
                              </Badge>
                            )}
                          </span>
                        ) : (
                          <span className="text-slate-400 font-normal italic">-</span>
                        )}
                      </td>
                      <td className="px-6 py-4 font-black text-right text-slate-800 dark:text-slate-200">
                        {customer.amountPaid.toLocaleString()}
                      </td>
                      <td className="px-6 py-4 text-center">
                        <Badge variant="outline" className={`text-[10px] font-extrabold uppercase px-2 py-0.5 ${statusColors[customer.status] || statusColors.active}`}>
                          {customer.status}
                        </Badge>
                      </td>
                      <td className="px-6 py-4 text-center">
                        <div className="flex items-center justify-center gap-2">
                          <Button variant="ghost" size="icon" onClick={() => openEditCustomer(customer)} className="h-8 w-8 text-blue-600 hover:text-blue-700 hover:bg-blue-50 dark:hover:bg-blue-950/30 rounded-md cursor-pointer">
                            <Edit2 className="w-3.5 h-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => {
                              setCustomerDeleteConfirmText('');
                              setCustomerToDelete(customer);
                            }}
                            className="h-8 w-8 text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 rounded-md cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={6} className="px-6 py-12 text-center text-sm text-slate-500">No purchased customers found.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>

        {customerData && customerData.totalPages > 1 && (
          <div className="flex items-center justify-between border-t border-slate-200 dark:border-slate-800 bg-card/20 px-6 py-4">
            <div className="text-xs text-muted-foreground font-mono">
              Showing Page <span className="text-foreground font-bold">{customerPage}</span> of <span className="text-foreground font-bold">{customerData.totalPages}</span>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" disabled={customerPage <= 1} onClick={() => setCustomerPage((page) => Math.max(1, page - 1))} className="bg-card border-border text-foreground hover:bg-muted cursor-pointer">
                <ChevronLeft className="w-4 h-4 mr-1" />
                Prev
              </Button>
              <Button variant="outline" size="sm" disabled={customerPage >= customerData.totalPages} onClick={() => setCustomerPage((page) => Math.min(customerData.totalPages, page + 1))} className="bg-card border-border text-foreground hover:bg-muted cursor-pointer">
                Next
                <ChevronRight className="w-4 h-4 ml-1" />
              </Button>
            </div>
          </div>
        )}
      </Card>

      {/* 2. Purchase Records Data Card */}
      <Card id="commerce-purchase-records-section" className="bg-card border-2 border-slate-200 dark:border-slate-800 rounded-xl shadow-sm overflow-hidden">
        <div className="p-6 border-b border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <CardTitle className="text-lg font-extrabold text-slate-900 dark:text-slate-100 uppercase tracking-wide">2. Purchase Records Data</CardTitle>
          <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto">
            <Select value={followUpFilter} onValueChange={(value) => setFollowUpFilter(value || 'all')}>
              <SelectTrigger className="h-10 w-40 rounded-lg border border-border bg-card text-xs font-bold text-slate-800 dark:text-slate-200">
                {followUpFilter === 'overdue' ? 'Overdue Follow-ups' : followUpFilter === 'due' ? 'Due Today' : 'All Follow-ups'}
              </SelectTrigger>
              <SelectContent className="bg-card border-border text-foreground rounded-lg">
                <SelectItem value="all">All Follow-ups</SelectItem>
                <SelectItem value="overdue">Overdue Follow-ups</SelectItem>
                <SelectItem value="due">Due Today</SelectItem>
              </SelectContent>
            </Select>
            <div className="relative flex-1 sm:flex-initial">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
              <Input
                placeholder="Search purchase records..."
                value={recordSearch}
                onChange={(e) => setRecordSearch(e.target.value)}
                className="pl-9 bg-muted/50 border-border text-foreground placeholder:text-muted-foreground w-full sm:w-60 focus-visible:ring-ring"
              />
            </div>
            <Button onClick={openCreateLead} className="bg-blue-600 hover:bg-blue-700 text-white rounded-lg px-4 h-10 text-xs font-bold transition-all shrink-0 cursor-pointer">
              <Plus className="w-4 h-4 mr-1.5" />
              Add Purchase
            </Button>
          </div>
        </div>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[850px] text-sm">
              <thead className="bg-slate-50 dark:bg-slate-900/60 text-xs uppercase text-slate-500 border-b border-slate-200 dark:border-slate-800">
                <tr>
                  <th className="px-6 py-4 text-left font-extrabold">Purchase Date</th>
                  <th className="px-6 py-4 text-left font-extrabold">Customer Name</th>
                  <th className="px-6 py-4 text-left font-extrabold">Source Channel</th>
                  <th className="px-6 py-4 text-left font-extrabold">Purchased Product</th>
                  <th className="px-6 py-4 text-left font-extrabold">Contact</th>
                  <th className="px-6 py-4 text-center font-extrabold">Potential</th>
                  <th className="px-6 py-4 text-center font-extrabold">Status</th>
                  <th className="px-6 py-4 text-center font-extrabold">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                {recordsLoading ? (
                  Array.from({ length: 5 }).map((_, index) => (
                    <tr key={index}>
                      <td className="px-6 py-4"><Skeleton className="h-4 w-20" /></td>
                      <td className="px-6 py-4"><Skeleton className="h-4 w-32" /></td>
                      <td className="px-6 py-4"><Skeleton className="h-4 w-28" /></td>
                      <td className="px-6 py-4"><Skeleton className="h-4 w-36" /></td>
                      <td className="px-6 py-4"><Skeleton className="h-4 w-24" /></td>
                      <td className="px-6 py-4"><Skeleton className="h-5 w-24 mx-auto" /></td>
                      <td className="px-6 py-4"><Skeleton className="h-5 w-16 mx-auto" /></td>
                      <td className="px-6 py-4"><Skeleton className="h-5 w-14 mx-auto" /></td>
                    </tr>
                  ))
                ) : recordData?.records && recordData.records.length > 0 ? (
                  recordData.records.map((record) => {
                    const leadPhone = formatPhoneNumber(record.phone);
                    return (
                      <tr key={record.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-900/40 align-middle">
                        <td className="px-6 py-4 font-mono text-xs text-slate-600 dark:text-slate-400">
                          {format(new Date(record.purchaseDate), 'd MMM yyyy')}
                        </td>
                        <td className="px-6 py-4 font-bold text-slate-900 dark:text-slate-100">
                          {record.customerId ? (
                            <Link href={`/customers/${record.customerId}`} className="hover:text-blue-600 transition-colors">
                              {record.customerName}
                            </Link>
                          ) : (
                            record.customerName
                          )}
                          {record.company && <span className="block text-xs font-normal text-muted-foreground">{record.company}</span>}
                        </td>
                        <td className="px-6 py-4 text-slate-600 dark:text-slate-400 font-semibold">{record.sourceChannel || 'Telegram'}</td>
                        <td className="px-6 py-4 text-slate-700 dark:text-slate-300">
                          {record.product || '-'}
                        </td>
                        <td className="px-6 py-4 font-mono text-xs font-bold text-emerald-600 dark:text-emerald-400">
                          {leadPhone || <span className="text-slate-400 font-normal italic">No contact</span>}
                        </td>
                        <td className="px-6 py-4 text-center">
                          <Badge variant="outline" className={`text-[10px] font-extrabold uppercase px-2.5 py-0.5 ${priorityColors[record.potential] || priorityColors.medium}`}>
                            {record.potential === 'high' ? 'High Potential' : record.potential}
                          </Badge>
                        </td>
                        <td className="px-6 py-4 text-center">
                          <Badge variant="outline" className={`text-[10px] font-bold px-2 py-0.5 capitalize ${leadStatusColors[record.status] || leadStatusColors.new}`}>
                            {record.status === 'completed' ? 'Completed' : record.status}
                          </Badge>
                        </td>
                        <td className="px-6 py-4 text-center">
                          <div className="flex items-center justify-center gap-2">
                            <Button variant="ghost" size="icon" onClick={() => openEditLead(record)} className="h-8 w-8 text-blue-600 hover:text-blue-700 hover:bg-blue-50 dark:hover:bg-blue-950/30 rounded-md cursor-pointer">
                              <Edit2 className="w-3.5 h-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => {
                                setLeadDeleteConfirmText('');
                                setLeadToDelete(record);
                              }}
                              className="h-8 w-8 text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 rounded-md cursor-pointer"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan={8} className="px-6 py-12 text-center text-sm text-slate-500">No purchase records found.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>

        {recordData && recordData.totalPages > 1 && (
          <div className="flex items-center justify-between border-t border-slate-200 dark:border-slate-800 bg-card/20 px-6 py-4">
            <div className="text-xs text-muted-foreground font-mono">
              Showing Page <span className="text-foreground font-bold">{recordPage}</span> of <span className="text-foreground font-bold">{recordData.totalPages}</span>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" disabled={recordPage <= 1} onClick={() => setRecordPage((page) => Math.max(1, page - 1))} className="bg-card border-border text-foreground hover:bg-muted cursor-pointer">
                <ChevronLeft className="w-4 h-4 mr-1" />
                Prev
              </Button>
              <Button variant="outline" size="sm" disabled={recordPage >= recordData.totalPages} onClick={() => setRecordPage((page) => Math.min(recordData.totalPages, page + 1))} className="bg-card border-border text-foreground hover:bg-muted cursor-pointer">
                Next
                <ChevronRight className="w-4 h-4 ml-1" />
              </Button>
            </div>
          </div>
        )}
      </Card>

      {/* ─── MODALS ──────────────────────────────────────────────────────── */}

      {(isCreatingCustomer || editingCustomer) && (
        <ModalPortal className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 animate-in fade-in duration-200 p-4">
          <form onSubmit={handleSaveCustomer} className="bg-card border border-border w-full max-w-lg rounded-lg overflow-hidden shadow-lg animate-in zoom-in-95 duration-200 text-foreground">
            <div className="flex justify-between items-center border-b border-border p-6 pb-4">
              <h3 className="text-lg font-bold text-foreground">{editingCustomer ? `Edit Client: ${editingCustomer.name}` : 'Add New Client'}</h3>
              <button
                type="button"
                onClick={() => {
                  setIsCreatingCustomer(false);
                  setEditingCustomer(null);
                }}
                className="text-muted-foreground hover:text-foreground text-lg cursor-pointer"
              >
                ✕
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5 col-span-2">
                  <label className="text-xs font-semibold uppercase text-muted-foreground">Name *</label>
                  <Input required value={customerForm.name} onChange={(e) => setCustomerForm({ ...customerForm, name: e.target.value })} placeholder="Enter client's full name" className="bg-muted/35 border-border text-foreground" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold uppercase text-muted-foreground">Company</label>
                  <Input value={customerForm.company} onChange={(e) => setCustomerForm({ ...customerForm, company: e.target.value })} placeholder="Company Name" className="bg-muted/35 border-border text-foreground" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold uppercase text-muted-foreground">Phone</label>
                  <Input value={customerForm.phone} onChange={(e) => setCustomerForm({ ...customerForm, phone: e.target.value })} placeholder="Phone number" className="bg-muted/35 border-border text-foreground" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold uppercase text-muted-foreground">Email</label>
                  <Input type="email" value={customerForm.email} onChange={(e) => setCustomerForm({ ...customerForm, email: e.target.value })} placeholder="Email address" className="bg-muted/35 border-border text-foreground" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold uppercase text-muted-foreground">Client Status</label>
                  <select value={customerForm.status} onChange={(e) => setCustomerForm({ ...customerForm, status: e.target.value })} className="w-full h-10 bg-muted border border-border rounded-lg px-3 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-blue-500">
                    <option value="active">Active</option>
                    <option value="pending">Pending</option>
                    <option value="inactive">Inactive</option>
                  </select>
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold uppercase text-muted-foreground">Notes</label>
                <textarea value={customerForm.notes} onChange={(e) => setCustomerForm({ ...customerForm, notes: e.target.value })} placeholder="Notes about client history, SLA requirements..." className="w-full h-20 bg-muted/40 border border-border rounded-lg p-3 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-blue-500 placeholder:text-muted-foreground" />
              </div>
            </div>
            <div className="flex justify-end gap-3 p-6 pt-2 border-t border-border">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setIsCreatingCustomer(false);
                  setEditingCustomer(null);
                }}
                className="bg-muted/50 border-border text-foreground hover:bg-muted cursor-pointer"
              >
                Cancel
              </Button>
              <Button type="submit" disabled={createCustomerMutation.isPending || updateCustomerMutation.isPending} className="bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 font-bold shrink-0 cursor-pointer">
                {(createCustomerMutation.isPending || updateCustomerMutation.isPending) && <Loader2 className="w-4 h-4 mr-2 animate-spin shrink-0" />}
                Save Client
              </Button>
            </div>
          </form>
        </ModalPortal>
      )}

      {(isCreatingLead || editingLead) && (
        <ModalPortal className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 animate-in fade-in duration-200 p-4">
          <form onSubmit={handleSaveLead} className="bg-card border border-border w-full max-w-lg rounded-lg overflow-hidden shadow-lg animate-in zoom-in-95 duration-200 text-foreground">
            <div className="flex justify-between items-center border-b border-border p-6 pb-4">
              <h3 className="text-lg font-bold text-foreground">{editingLead ? 'Edit Purchase Record' : 'Add Purchase Record'}</h3>
              <button
                type="button"
                onClick={() => {
                  setIsCreatingLead(false);
                  setEditingLead(null);
                }}
                className="text-muted-foreground hover:text-foreground text-lg cursor-pointer"
              >
                ✕
              </button>
            </div>
            <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5 col-span-2">
                  <label className="text-xs font-semibold uppercase text-muted-foreground">Customer Name *</label>
                  <Input required value={leadForm.customerName} onChange={(e) => setLeadForm({ ...leadForm, customerName: e.target.value })} placeholder="e.g. Aung Myint" className="bg-muted/35 border-border text-foreground" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold uppercase text-muted-foreground">Phone Number</label>
                  <Input value={leadForm.customerPhone} onChange={(e) => setLeadForm({ ...leadForm, customerPhone: e.target.value })} placeholder="e.g. 09950111222" className="bg-muted/35 border-border text-foreground" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold uppercase text-muted-foreground">Company Name</label>
                  <Input value={leadForm.customerCompany} onChange={(e) => setLeadForm({ ...leadForm, customerCompany: e.target.value })} placeholder="e.g. Mandalay Retail" className="bg-muted/35 border-border text-foreground" />
                </div>
                <div className="space-y-1.5 col-span-2">
                  <label className="text-xs font-semibold uppercase text-muted-foreground">Purchased Product</label>
                  <Input value={leadForm.productName} onChange={(e) => setLeadForm({ ...leadForm, productName: e.target.value })} placeholder="e.g. iPhone 15 Case Bundle" className="bg-muted/35 border-border text-foreground" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold uppercase text-muted-foreground">Purchase Amount (Ks)</label>
                  <Input type="number" value={leadForm.purchaseAmount} onChange={(e) => setLeadForm({ ...leadForm, purchaseAmount: e.target.value })} placeholder="e.g. 150000" className="bg-muted/35 border-border text-foreground" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold uppercase text-muted-foreground">Quantity</label>
                  <Input type="number" value={leadForm.quantity} onChange={(e) => setLeadForm({ ...leadForm, quantity: e.target.value })} placeholder="1" className="bg-muted/35 border-border text-foreground" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold uppercase text-muted-foreground">Follow-up Date</label>
                  <Input type="date" value={leadForm.followUpDate} onChange={(e) => setLeadForm({ ...leadForm, followUpDate: e.target.value })} className="bg-muted/35 border-border text-foreground w-full" />
                </div>
                <div className="space-y-1.5 col-span-2">
                  <label className="text-xs font-semibold uppercase text-muted-foreground">Purchase Status</label>
                  <select value={leadForm.status} onChange={(e) => setLeadForm({ ...leadForm, status: e.target.value })} className="w-full h-10 bg-muted border border-border rounded-lg px-3 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-blue-500">
                    <option value="new">New Purchase</option>
                    <option value="contacted">Contacted</option>
                    <option value="quoted">Quoted</option>
                    <option value="pending">Pending</option>
                    <option value="closed">Closed</option>
                    <option value="completed">Completed</option>
                  </select>
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold uppercase text-muted-foreground">Conversation Note / Details</label>
                <textarea value={leadForm.note} onChange={(e) => setLeadForm({ ...leadForm, note: e.target.value })} placeholder="Delivery preferences, repeat order details..." className="w-full h-20 bg-muted/40 border border-border rounded-lg p-3 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-blue-500 placeholder:text-muted-foreground" />
              </div>
            </div>
            <div className="flex justify-end gap-3 p-6 pt-2 border-t border-border">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setIsCreatingLead(false);
                  setEditingLead(null);
                }}
                className="bg-muted/50 border-border text-foreground hover:bg-muted cursor-pointer"
              >
                Cancel
              </Button>
              <Button type="submit" disabled={createLeadMutation.isPending || updateLeadMutation.isPending} className="bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 font-bold shrink-0 cursor-pointer">
                {(createLeadMutation.isPending || updateLeadMutation.isPending) && <Loader2 className="w-4 h-4 mr-2 animate-spin shrink-0" />}
                Save Purchase
              </Button>
            </div>
          </form>
        </ModalPortal>
      )}

      {/* Delete Single Customer Confirmation */}
      {customerToDelete && (
        <AlertDialog
          open={!!customerToDelete}
          onOpenChange={(open) => {
            if (!open) {
              setCustomerToDelete(null);
              setCustomerDeleteConfirmText('');
            }
          }}
        >
          <AlertDialogContent className="bg-card border-border text-foreground">
            <AlertDialogHeader>
              <AlertDialogTitle>Delete {customerToDelete.name}?</AlertDialogTitle>
              <AlertDialogDescription className="text-muted-foreground">This will move this client to Trash. Related activity history stays linked, and admins can restore the client later.</AlertDialogDescription>
            </AlertDialogHeader>
            <div className="space-y-2">
              <label className="text-sm font-semibold text-foreground">Type confirm to move this client to Trash</label>
              <Input value={customerDeleteConfirmText} onChange={(event) => setCustomerDeleteConfirmText(event.target.value)} disabled={deleteCustomer.isPending} placeholder="confirm" className="h-10 font-mono" />
            </div>
            <AlertDialogFooter>
              <AlertDialogCancel className="border-border text-foreground">Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={async () => {
                  await deleteCustomer.mutateAsync(customerToDelete.id);
                  setCustomerToDelete(null);
                  setCustomerDeleteConfirmText('');
                }}
                disabled={deleteCustomer.isPending || customerDeleteConfirmText.toLowerCase() !== 'confirm'}
                className="bg-red-600 hover:bg-red-700 text-white font-bold cursor-pointer"
              >
                {deleteCustomer.isPending ? 'Deleting…' : 'Move to Trash'}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}

      {/* Delete Single Purchase Record Confirmation */}
      {leadToDelete && (
        <AlertDialog
          open={!!leadToDelete}
          onOpenChange={(open) => {
            if (!open) {
              setLeadToDelete(null);
              setLeadDeleteConfirmText('');
            }
          }}
        >
          <AlertDialogContent className="bg-card border-border text-foreground">
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Record for {leadToDelete.customerName || 'Unknown'}?</AlertDialogTitle>
              <AlertDialogDescription className="text-muted-foreground">This will move this purchase record to Trash. Admins can restore it later.</AlertDialogDescription>
            </AlertDialogHeader>
            <div className="space-y-2">
              <label className="text-sm font-semibold text-foreground">Type confirm to move this record to Trash</label>
              <Input value={leadDeleteConfirmText} onChange={(event) => setLeadDeleteConfirmText(event.target.value)} disabled={deleteLeadMutation.isPending} placeholder="confirm" className="h-10 font-mono" />
            </div>
            <AlertDialogFooter>
              <AlertDialogCancel className="border-border text-foreground">Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={async () => {
                  await deleteLeadMutation.mutateAsync(leadToDelete.id);
                  setLeadToDelete(null);
                  setLeadDeleteConfirmText('');
                }}
                disabled={deleteLeadMutation.isPending || leadDeleteConfirmText.toLowerCase() !== 'confirm'}
                className="bg-red-600 hover:bg-red-700 text-white font-bold cursor-pointer"
              >
                {deleteLeadMutation.isPending ? 'Deleting…' : 'Move to Trash'}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </div>
  );
}
