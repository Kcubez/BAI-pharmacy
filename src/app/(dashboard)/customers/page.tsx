'use client';

import { useEffect, useState, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useDateFilter } from '@/hooks/use-date-filter';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from '@/components/ui/select';
import { format } from 'date-fns';
import { Card, CardContent, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { PageLoadingState } from '@/components/page-loading-state';
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
import {
  Search,
  Phone,
  MessageSquare,
  ChevronRight,
  Trash2,
  ChevronLeft,
  Users,
  Edit2,
  Plus,
  Loader2,
  AlertTriangle,
  CheckCircle2,
  DollarSign,
} from 'lucide-react';
import { customersApi, type Customer, type DemandRecord } from '@/lib/api';
import { clearListQueryData, removeListItemQueryData } from '@/lib/query-cache';
import { toast } from 'sonner';
import { formatPhoneNumber } from '@/lib/utils';
import {
  useDemandRecords,
  useDemandRecordStats,
  useCreateDemandRecord,
  useUpdateDemandRecord,
  useDeleteDemandRecord,
} from '@/hooks/use-demand-records';
import { ModalPortal } from '@/components/ui/modal-portal';

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
};

function useCustomers(params: { search?: string; page?: number; limit?: number; status?: string; dateFrom?: string; dateTo?: string } = {}) {
  return useQuery({
    queryKey: ['customers', params],
    queryFn: () => customersApi.list(params),
    placeholderData: (prev) => prev,
    refetchInterval: 10000,
  });
}

function CustomersPageContent() {
  const router = useRouter();
  const queryClient = useQueryClient();

  const {
    period,
    month,
    year,
    dateFrom,
    dateTo,
    localPeriod,
    localMonth,
    localYear,
    setLocalPeriod,
    setLocalMonth,
    setLocalYear,
    updatePeriod,
    years,
  } = useDateFilter('customer_filter');

  const searchParams = useSearchParams();
  const initialCustomerSearch = searchParams.get('customerSearch') || '';
  const initialDemandSearch = searchParams.get('search') || searchParams.get('demandSearch') || '';
  const initialFollowUpStatus = searchParams.get('followUpStatus') || 'all';

  // Purchased Customers Pagination and Search
  const [customerSearch, setCustomerSearch] = useState(initialCustomerSearch);
  const [debouncedCustomerSearch, setDebouncedCustomerSearch] = useState(initialCustomerSearch);
  const [customerPage, setCustomerPage] = useState(1);

  // Demand Leads Pagination and Search
  const [demandSearch, setDemandSearch] = useState(initialDemandSearch);
  const [debouncedDemandSearch, setDebouncedDemandSearch] = useState(initialDemandSearch);
  const [followUpFilter, setFollowUpFilter] = useState<string>(initialFollowUpStatus);
  const [demandPage, setDemandPage] = useState(1);
  const [lastUrlFilters, setLastUrlFilters] = useState(
    () => `${initialCustomerSearch}:${initialDemandSearch}:${initialFollowUpStatus}`,
  );

  const urlCustomerSearch = searchParams.get('customerSearch') || '';
  const urlDemandSearch = searchParams.get('search') || searchParams.get('demandSearch') || '';
  const urlFollowUpStatus = searchParams.get('followUpStatus') || 'all';
  const urlFilters = `${urlCustomerSearch}:${urlDemandSearch}:${urlFollowUpStatus}`;
  if (lastUrlFilters !== urlFilters) {
    setLastUrlFilters(urlFilters);
    setCustomerSearch(urlCustomerSearch);
    setDebouncedCustomerSearch(urlCustomerSearch);
    setDemandSearch(urlDemandSearch);
    setDebouncedDemandSearch(urlDemandSearch);
    setFollowUpFilter(urlFollowUpStatus);
    setCustomerPage(1);
    setDemandPage(1);
  }

  useEffect(() => {
    const followUp = searchParams.get('followUpStatus');
    if (followUp && followUp !== 'all') {
      const timer = setTimeout(() => {
        const element = document.getElementById('demand-leads-section');
        if (element) {
          element.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [searchParams]);

  // Modals Open/Prefill State
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [isCreatingCustomer, setIsCreatingCustomer] = useState(false);
  const [customerForm, setCustomerForm] = useState({
    name: "",
    company: "",
    phone: "",
    email: "",
    status: "active",
    notes: "",
  });

  const [editingLead, setEditingLead] = useState<DemandRecord | null>(null);
  const [isCreatingLead, setIsCreatingLead] = useState(false);
  const [leadForm, setLeadForm] = useState({
    customerName: "",
    customerPhone: "",
    customerCompany: "",
    serviceName: "",
    serviceAmount: "",
    serviceQty: "1",
    followUpDate: "",
    priority: "medium",
    status: "new",
    note: "",
  });

  // Delete Dialog States
  const [customerToDelete, setCustomerToDelete] = useState<Customer | null>(null);
  const [leadToDelete, setLeadToDelete] = useState<DemandRecord | null>(null);
  const [isDeleteAllOpen, setIsDeleteAllOpen] = useState(false);
  const [deleteAllConfirmText, setDeleteAllConfirmText] = useState('');
  const [customerDeleteConfirmText, setCustomerDeleteConfirmText] = useState('');
  const [leadDeleteConfirmText, setLeadDeleteConfirmText] = useState('');

  // Debounce effects
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedCustomerSearch(customerSearch);
      setCustomerPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [customerSearch]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedDemandSearch(demandSearch);
      setDemandPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [demandSearch]);

  const [lastDateFilter, setLastDateFilter] = useState(() => `${period}:${month}:${year}`);
  const dateFilter = `${period}:${month}:${year}`;
  if (lastDateFilter !== dateFilter) {
    setLastDateFilter(dateFilter);
    setCustomerPage(1);
    setDemandPage(1);
  }

  // Queries
  const { data: customerData, isLoading: customerLoading, isError: customerError, refetch: refetchCustomers } = useCustomers({
    search: debouncedCustomerSearch,
    page: customerPage,
    limit: PAGE_SIZE,
    dateFrom,
    dateTo,
  });

  const { data: demandStats, isLoading: demandStatsLoading } = useDemandRecordStats({ dateFrom, dateTo });

  const { data: demandData, isLoading: demandLoading, isError: demandError, refetch: refetchDemands } = useDemandRecords({
    page: demandPage,
    limit: PAGE_SIZE,
    search: debouncedDemandSearch || undefined,
    dateFrom,
    dateTo,
    followUpStatus: followUpFilter === 'all' ? undefined : followUpFilter,
  });

  const { data: dashboardStats } = useQuery({
    queryKey: ['dashboard-stats-cs', period, month, year],
    queryFn: async () => {
      const res = await fetch(`/api/dashboard/stats?period=${period}&month=${month}&year=${year}`, { cache: "no-store" });
      if (!res.ok) throw new Error('Failed to fetch');
      return res.json();
    },
    refetchInterval: 15000,
  });

  // Mutations
  const createCustomerMutation = useMutation({
    mutationFn: (data: Partial<Customer>) => customersApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      toast.success('Customer created successfully');
      setIsCreatingCustomer(false);
    },
    onError: (err: unknown) => {
      toast.error(err instanceof Error ? err.message : 'Failed to create customer');
    }
  });

  const updateCustomerMutation = useMutation({
    mutationFn: ({ id, ...data }: { id: string } & Partial<Customer>) => customersApi.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      toast.success('Customer updated successfully');
      setEditingCustomer(null);
    },
    onError: (err: unknown) => {
      toast.error(err instanceof Error ? err.message : 'Failed to update customer');
    }
  });

  const deleteCustomer = useMutation({
    mutationFn: (id: string) => customersApi.delete(id),
    onSuccess: (_res, id) => {
      removeListItemQueryData(queryClient, ['customers'], 'customers', id);
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      queryClient.invalidateQueries({ queryKey: ['trash'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
      queryClient.invalidateQueries({ queryKey: ['demand-records'] });
      queryClient.invalidateQueries({ queryKey: ['demand-record-stats'] });
      toast.success('Customer moved to Trash');
    },
    onError: (err: Error) => {
      toast.error(err.message || 'Failed to delete customer');
    },
  });

  const deleteAllCustomers = useMutation({
    mutationFn: (params: { dateFrom?: string; dateTo?: string }) => customersApi.deleteAll(params),
    onSuccess: (res) => {
      clearListQueryData(queryClient, ['customers'], 'customers');
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      queryClient.invalidateQueries({ queryKey: ['trash'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
      queryClient.invalidateQueries({ queryKey: ['demand-records'] });
      queryClient.invalidateQueries({ queryKey: ['demand-record-stats'] });
      toast.success(`${res.count} customer${res.count === 1 ? '' : 's'} moved to Trash`);
      setIsDeleteAllOpen(false);
      setDeleteAllConfirmText('');
    },
    onError: (err: Error) => {
      toast.error(err.message || 'Failed to delete all customers');
    },
  });

  const createLeadMutation = useCreateDemandRecord();
  const updateLeadMutation = useUpdateDemandRecord();
  const deleteLeadMutation = useDeleteDemandRecord();

  // Handlers for Save
  const handleSaveCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customerForm.name.trim()) {
      toast.error("Name is required");
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
      await updateCustomerMutation.mutateAsync({
        id: editingCustomer.id,
        ...payload,
      });
    } else {
      await createCustomerMutation.mutateAsync(payload);
    }
  };

  const handleSaveLead = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!leadForm.customerName.trim()) {
      toast.error("Lead name is required");
      return;
    }
    const payload = {
      customerName: leadForm.customerName.trim(),
      customerPhone: leadForm.customerPhone.trim() || null,
      customerCompany: leadForm.customerCompany.trim() || null,
      serviceName: leadForm.serviceName.trim() || null,
      serviceAmount: leadForm.serviceAmount ? parseFloat(leadForm.serviceAmount) : null,
      serviceQty: leadForm.serviceQty ? parseInt(leadForm.serviceQty) : 1,
      followUpDate: leadForm.followUpDate || null,
      priority: leadForm.priority as "high" | "medium" | "low",
      status: leadForm.status,
      note: leadForm.note.trim() || "",
    };
    if (editingLead) {
      await updateLeadMutation.mutateAsync({
        id: editingLead.id,
        ...payload,
      });
      setEditingLead(null);
    } else {
      await createLeadMutation.mutateAsync(payload);
      setIsCreatingLead(false);
    }
  };

  // Prefill Functions
  const openEditCustomer = (customer: Customer) => {
    setEditingCustomer(customer);
    setCustomerForm({
      name: customer.name,
      company: customer.company || "",
      phone: customer.phone || "",
      email: customer.email || "",
      status: customer.status,
      notes: customer.notes || "",
    });
  };

  const openCreateCustomer = () => {
    setIsCreatingCustomer(true);
    setCustomerForm({
      name: "",
      company: "",
      phone: "",
      email: "",
      status: "active",
      notes: "",
    });
  };

  const openEditLead = (lead: DemandRecord) => {
    setEditingLead(lead);
    setLeadForm({
      customerName: lead.customerName || "",
      customerPhone: lead.customer?.phone || "",
      customerCompany: lead.customer?.company || "",
      serviceName: lead.serviceName || "",
      serviceAmount: lead.serviceAmount ? String(lead.serviceAmount) : "",
      serviceQty: lead.serviceQty ? String(lead.serviceQty) : "1",
      followUpDate: lead.followUpDate ? lead.followUpDate.slice(0, 10) : "",
      priority: lead.priority || "medium",
      status: lead.status || "new",
      note: lead.note || "",
    });
  };

  const openCreateLead = () => {
    setIsCreatingLead(true);
    setLeadForm({
      customerName: "",
      customerPhone: "",
      customerCompany: "",
      serviceName: "",
      serviceAmount: "",
      serviceQty: "1",
      followUpDate: "",
      priority: "medium",
      status: "new",
      note: "",
    });
  };

  // Calculations for metric cards
  const totalDemandRecords = demandStats?.totalRecords ?? 0;
  const highPotential = demandStats?.priority.high ?? 0;
  const totalCustomers = demandStats?.uniqueCustomers ?? customerData?.total ?? 0;
  const avgSpending = dashboardStats?.totalCustomers > 0 
    ? (dashboardStats?.totalAmountSold / dashboardStats?.totalCustomers) 
    : 0;

  return (
    <div className="min-h-[calc(100vh-7rem)] space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* Page Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-border pb-5">
        <div>
          <h1 className="text-3xl font-bold text-foreground font-heading">Customer Service</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Customer directory, demand leads, and satisfaction metrics.
          </p>
        </div>
        <div className="flex flex-wrap gap-2 items-center">
          <Select value={localPeriod} onValueChange={(value) => {
            if (value === 'month' || value === 'year') {
              setLocalPeriod(value);
              updatePeriod({ period: value });
            }
          }}>
            <SelectTrigger className="h-9 w-28 rounded-lg border-2 border-slate-300 dark:border-slate-800 bg-card text-xs font-bold text-slate-800 dark:text-slate-200">
              {localPeriod === 'year' ? 'Yearly' : 'Monthly'}
            </SelectTrigger>
            <SelectContent className="bg-card border-border text-foreground rounded-lg">
              <SelectItem value="month">Monthly</SelectItem>
              <SelectItem value="year">Yearly</SelectItem>
            </SelectContent>
          </Select>
          {localPeriod === 'month' ? (
            <Select value={localMonth} onValueChange={(value) => {
              if (value) {
                setLocalMonth(value);
                updatePeriod({ month: Number(value) });
              }
            }}>
              <SelectTrigger className="h-9 w-32 rounded-lg border-2 border-slate-300 dark:border-slate-800 bg-card text-xs font-bold text-slate-800 dark:text-slate-200">
                {new Date(Number(localYear), Number(localMonth) - 1, 1).toLocaleString('en', { month: 'long' })}
              </SelectTrigger>
              <SelectContent className="bg-card border-border text-foreground rounded-lg">
                {Array.from({ length: 12 }).map((_, index) => (
                  <SelectItem key={index + 1} value={String(index + 1)}>
                    {new Date(Number(localYear), index, 1).toLocaleString('en', { month: 'long' })}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : null}
          <Select value={localYear} onValueChange={(value) => {
            if (value) {
              setLocalYear(value);
              updatePeriod({ year: Number(value) });
            }
          }}>
            <SelectTrigger className="h-9 w-24 rounded-lg border-2 border-slate-300 dark:border-slate-800 bg-card text-xs font-bold text-slate-800 dark:text-slate-200">
              {localYear}
            </SelectTrigger>
            <SelectContent className="bg-card border-border text-foreground rounded-lg">
              {years.map((itemYear) => (
                <SelectItem key={itemYear} value={String(itemYear)}>
                  {itemYear}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <AlertDialog open={isDeleteAllOpen} onOpenChange={(open) => {
            setIsDeleteAllOpen(open);
            if (!open) setDeleteAllConfirmText('');
          }}>
            <button
              type="button"
              disabled={!customerData?.customers?.length}
              onClick={() => {
                setDeleteAllConfirmText('');
                setIsDeleteAllOpen(true);
              }}
              className="inline-flex items-center gap-2 px-3 h-9 rounded-md text-sm border border-red-500/30 text-red-600 dark:text-red-400 bg-red-500/5 hover:bg-red-500/15 disabled:opacity-40 disabled:cursor-not-allowed transition-colors font-bold shrink-0 cursor-pointer animate-none"
            >
              <Trash2 className="w-4 h-4" />
              Delete All Clients
            </button>
          <AlertDialogContent className="bg-card border-border text-foreground">
            <AlertDialogHeader>
              <AlertDialogTitle>Delete customers for selected period?</AlertDialogTitle>
              <AlertDialogDescription className="text-muted-foreground">
                This will move <strong>{customerData?.total ?? 0}</strong> customer(s) from <strong>{dateFrom}</strong> to <strong>{dateTo}</strong> to Trash.
                Related activity history stays linked, and admins can restore these customers later.
              </AlertDialogDescription>
            </AlertDialogHeader>
             <div className="space-y-2">
              <label className="text-sm font-semibold text-foreground">Type confirm to move these customers to Trash</label>
              <Input
                value={deleteAllConfirmText}
                onChange={(event) => setDeleteAllConfirmText(event.target.value)}
                disabled={deleteAllCustomers.isPending}
                placeholder="confirm"
                className="h-10 font-mono"
              />
            </div>
            <AlertDialogFooter>
              <AlertDialogCancel className="border-border text-foreground">Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => deleteAllCustomers.mutate({ dateFrom, dateTo })}
                disabled={deleteAllCustomers.isPending || deleteAllConfirmText.toLowerCase() !== 'confirm'}
                className="bg-red-600 hover:bg-red-700 text-white"
              >
                {deleteAllCustomers.isPending ? 'Deleting…' : 'Move to Trash'}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
        </div>
      </div>

      {/* Metrics Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {[
          { label: 'Total Demands', value: totalDemandRecords, color: 'text-slate-900 dark:text-slate-100', loading: demandStatsLoading, icon: MessageSquare, accent: 'border-l-4 border-l-slate-500' },
          { label: 'High Potential (HPS)', value: highPotential, color: 'text-blue-600 dark:text-blue-400', loading: demandStatsLoading, accent: 'border-l-4 border-l-blue-500', icon: AlertTriangle },
          { label: 'Total Customers', value: totalCustomers, color: 'text-emerald-600 dark:text-emerald-400', loading: customerLoading, accent: 'border-l-4 border-l-emerald-500', icon: Users },
          { label: 'Avg Spending Value', value: avgSpending, displayVal: Math.round(avgSpending).toLocaleString(), suffix: 'MMK', color: 'text-slate-900 dark:text-slate-100', loading: !dashboardStats, icon: DollarSign, accent: 'border-l-4 border-l-amber-500' },
        ].map((item) => {
          const Icon = item.icon;
          return (
            <Card key={item.label} className={`bg-card border-2 border-slate-200 dark:border-slate-800 shadow-sm rounded-xl cursor-pointer ${item.accent}`}>
              <CardContent className="p-6 h-32 flex flex-col justify-center">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-[10px] font-extrabold text-slate-500 uppercase tracking-wider mb-2">{item.label}</p>
                    {item.loading ? (
                      <Skeleton className="h-8 w-16 bg-muted" />
                    ) : (
                      <h3 className={`flex items-baseline gap-1.5 text-2xl font-black ${item.color} tracking-tight`}>
                        <span>{item.displayVal ?? item.value.toLocaleString()}</span>
                        {item.suffix && (
                          <span className="text-xs font-bold text-slate-400">{item.suffix}</span>
                        )}
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
      </div>      {/* Intelligence Cards */}
      {totalDemandRecords > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {demandStatsLoading ? (
            <>
              <Skeleton className="h-32 rounded-xl animate-pulse" />
              <Skeleton className="h-32 rounded-xl animate-pulse" />
            </>
          ) : (
            (() => {
              const followUp = demandStats?.insights?.find(ins => ins.title.includes("Follow-up") || ins.actionType === "view_overdue" || ins.actionType === "view_due_today") || {
                type: "sales",
                severity: "info",
                title: "Follow-up နောက်ဆက်တွဲ ဆက်သွယ်မှု",
                message: "လတ်တလော လုပ်ဆောင်ရန်လိုအပ်သော follow-up နောက်ဆက်တွဲ ဖုန်းခေါ်ဆိုမှုများ မရှိသေးပါ။",
                recommendedAction: "နောက်ဆက်တွဲ လုပ်ဆောင်ရန်မရှိသေးသည့် Leads များအတွက် follow-up ရက်စွဲများ သတ်မှတ်ပေးပါ။",
                action: "Follow-up စစ်ဆေးရန်",
                actionType: "view_overdue"
              };

              const csat = {
                type: "csat",
                severity: "success",
                title: "ဝန်ဆောင်မှု စိတ်ကျေနပ်မှုရလဒ် (CSAT)",
                message: "ယခုအပတ်အတွင်း သုံးစွဲသူစိတ်ကျေနပ်မှု (CSAT Score) သည် ၉၆% အထိ ရှိခဲ့ပြီး သတ်မှတ်ချက်ထက် ကျော်လွန်အောင်မြင်ခဲ့သည်။",
                recommendedAction: "ဝန်ဆောင်မှုပေးရသည့်ကြာချိန်များသည် SLA သတ်မှတ်ချက် ဘောင်အတွင်း ကောင်းမွန်စွာ တည်ရှိနေပါသည်။",
                action: "Overview သွားရန်",
                actionType: "general_dashboard"
              };

              return [followUp, csat].map((insight) => {
                const isUrgent = insight.severity === 'urgent';
                const isWarning = insight.severity === 'warning';
                const isSuccess = insight.severity === 'success';
                const CS_Icon = isUrgent ? AlertTriangle : isWarning ? Phone : CheckCircle2;
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
                          <CS_Icon className={`w-5 h-5 shrink-0 ${isUrgent ? 'text-red-600' : isWarning ? 'text-amber-600' : isSuccess ? 'text-emerald-600' : 'text-sky-650'}`} />
                          <h4 className="font-bold text-slate-900 dark:text-slate-100">{insight.title}</h4>
                        </div>
                        <p className="text-xs text-slate-600 dark:text-slate-400 mb-1 leading-relaxed">
                          {insight.message}
                        </p>
                        <p className="text-xs font-semibold text-slate-800 dark:text-slate-300 leading-relaxed">
                          {insight.recommendedAction}
                        </p>
                      </div>
                      {insight.action && (
                        <div className="mt-3.5">
                          <Button
                            size="sm"
                            onClick={() => {
                              if (insight.actionType === 'view_high_priority') {
                                router.push('/sales-marketing?priority=high#report-table-section');
                              } else if (insight.actionType === 'view_missing_phone') {
                                router.push('/sales-marketing?missingField=phone#report-table-section');
                              } else if (insight.actionType === 'view_overdue' || insight.actionType === 'view_due_today') {
                                const el = document.getElementById('demand-leads-section');
                                if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
                              } else if (insight.actionType === 'general_dashboard') {
                                router.push('/pharmacy');
                              } else {
                                const el = document.getElementById('demand-leads-section');
                                if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
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
                      )}
                    </CardContent>
                  </Card>
                );
              });
            })()
          )}
        </div>
      )}

      {/* 1. Purchased Customers Directory Card */}
      <Card className="bg-card border-2 border-slate-200 dark:border-slate-800 rounded-xl shadow-sm overflow-hidden">
        <div className="p-6 border-b border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <CardTitle className="text-lg font-extrabold text-slate-900 dark:text-slate-100 uppercase tracking-wide">
            1. Purchased Customers Directory
          </CardTitle>
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
            <Button
              onClick={openCreateCustomer}
              className="bg-blue-600 hover:bg-blue-700 text-white rounded-lg px-4 h-10 text-xs font-bold transition-all shrink-0 cursor-pointer"
            >
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
                  <th className="px-6 py-4 text-left font-extrabold">Purchased Service</th>
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
                  customerData.customers.map((customer) => {
                    const latestRecord = customer.demandRecords?.[0];
                    const recordCount = customer.demandRecords?.length || 0;
                    const amountPaid = customer.demandRecords?.reduce((sum, record) => sum + (record.serviceAmount || 0), 0) || 0;

                    return (
                      <tr key={customer.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-900/40 align-middle">
                        <td className="px-6 py-4">
                          <Link href={`/customers/${customer.id}`} className="font-bold text-slate-900 dark:text-slate-100 hover:text-blue-600 transition-colors">
                            {customer.name}
                          </Link>
                        </td>
                        <td className="px-6 py-4 text-slate-600 dark:text-slate-400 font-semibold">{customer.company || '-'}</td>
                        <td className="px-6 py-4 text-blue-600 dark:text-blue-400 font-bold">
                          {latestRecord ? (
                            <span className="inline-flex items-center gap-1.5">
                              {latestRecord.serviceName || 'Package Deal'}
                              {recordCount > 1 && (
                                <Badge variant="outline" className="text-[10px] px-1 py-0 bg-blue-50/50 text-blue-700 shrink-0 font-mono">
                                  +{recordCount - 1} more
                                </Badge>
                              )}
                            </span>
                          ) : (
                            <span className="text-slate-400 font-normal italic">-</span>
                          )}
                        </td>
                        <td className="px-6 py-4 font-black text-right text-slate-800 dark:text-slate-200">
                          {amountPaid.toLocaleString()}
                        </td>
                        <td className="px-6 py-4 text-center">
                          <Badge variant="outline" className={`text-[10px] font-extrabold uppercase px-2 py-0.5 ${statusColors[customer.status] || statusColors.active}`}>
                            {customer.status}
                          </Badge>
                        </td>
                        <td className="px-6 py-4 text-center">
                          <div className="flex items-center justify-center gap-2">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => openEditCustomer(customer)}
                              className="h-8 w-8 text-blue-600 hover:text-blue-700 hover:bg-blue-50 dark:hover:bg-blue-950/30 rounded-md cursor-pointer"
                            >
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
                    );
                  })
                ) : customerError ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-12 text-center text-sm">
                      <p className="font-semibold text-red-600 dark:text-red-400">Couldn&apos;t load customers. Check your connection and try again.</p>
                      <Button variant="outline" size="sm" className="mt-3" onClick={() => void refetchCustomers()}>Retry</Button>
                    </td>
                  </tr>
                ) : (
                  <tr>
                    <td colSpan={6} className="px-6 py-12 text-center text-sm text-slate-500">
                      No purchased customers found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>

        {/* Customer Pagination Footer */}
        {customerData && customerData.totalPages > 1 && (
          <div className="flex items-center justify-between border-t border-slate-200 dark:border-slate-800 bg-card/20 px-6 py-4">
            <div className="text-xs text-muted-foreground font-mono">
              Showing Page <span className="text-foreground font-bold">{customerPage}</span> of{' '}
              <span className="text-foreground font-bold">{customerData.totalPages}</span>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={customerPage <= 1}
                onClick={() => setCustomerPage(p => Math.max(1, p - 1))}
                className="bg-card border-border text-foreground hover:bg-muted cursor-pointer"
              >
                <ChevronLeft className="w-4 h-4 mr-1" />
                Prev
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={customerPage >= customerData.totalPages}
                onClick={() => setCustomerPage(p => Math.min(customerData.totalPages, p + 1))}
                className="bg-card border-border text-foreground hover:bg-muted cursor-pointer"
              >
                Next
                <ChevronRight className="w-4 h-4 ml-1" />
              </Button>
            </div>
          </div>
        )}
      </Card>

      {/* 2. Demand Leads Data Card */}
      <Card id="demand-leads-section" className="bg-card border-2 border-slate-200 dark:border-slate-800 rounded-xl shadow-sm overflow-hidden">
        <div className="p-6 border-b border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <CardTitle className="text-lg font-extrabold text-slate-900 dark:text-slate-100 uppercase tracking-wide">
            2. Demand Leads Data
          </CardTitle>
          <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto">
            <Select value={followUpFilter} onValueChange={(val) => setFollowUpFilter(val || 'all')}>
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
                placeholder="Search leads..."
                value={demandSearch}
                onChange={(e) => setDemandSearch(e.target.value)}
                className="pl-9 bg-muted/50 border-border text-foreground placeholder:text-muted-foreground w-full sm:w-60 focus-visible:ring-ring"
              />
            </div>
            <Button
              onClick={openCreateLead}
              className="bg-blue-600 hover:bg-blue-700 text-white rounded-lg px-4 h-10 text-xs font-bold transition-all shrink-0 cursor-pointer"
            >
              <Plus className="w-4 h-4 mr-1.5" />
              Add Lead
            </Button>
          </div>
        </div>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[850px] text-sm">
              <thead className="bg-slate-50 dark:bg-slate-900/60 text-xs uppercase text-slate-500 border-b border-slate-200 dark:border-slate-800">
                <tr>
                  <th className="px-6 py-4 text-left font-extrabold">Date</th>
                  <th className="px-6 py-4 text-left font-extrabold">Lead Name</th>
                  <th className="px-6 py-4 text-left font-extrabold">Source Channel</th>
                  <th className="px-6 py-4 text-left font-extrabold">Interest / Inquiry</th>
                  <th className="px-6 py-4 text-left font-extrabold">Contact</th>
                  <th className="px-6 py-4 text-center font-extrabold">Potential</th>
                  <th className="px-6 py-4 text-center font-extrabold">Status</th>
                  <th className="px-6 py-4 text-center font-extrabold">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                {demandLoading ? (
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
                ) : demandData?.records && demandData.records.length > 0 ? (
                  demandData.records.map((lead) => {
                    const leadPhone = formatPhoneNumber(lead.customer?.phone);
                    const leadCompany = lead.customer?.company;

                    return (
                      <tr key={lead.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-900/40 align-middle">
                        <td className="px-6 py-4 font-mono text-xs text-slate-600 dark:text-slate-400">
                          {format(new Date(lead.createdAt), 'yyyy-MM-dd')}
                        </td>
                        <td className="px-6 py-4 font-bold text-slate-900 dark:text-slate-100">
                          {lead.customerId ? (
                            <Link href={`/customers/${lead.customerId}`} className="hover:text-blue-600 transition-colors">
                              {lead.customerName || 'Unknown'}
                            </Link>
                          ) : (
                            lead.customerName || 'Unknown'
                          )}
                          {leadCompany && (
                            <span className="block text-xs font-normal text-muted-foreground">{leadCompany}</span>
                          )}
                        </td>
                        <td className="px-6 py-4 text-slate-600 dark:text-slate-400 font-semibold">{lead.sourceChannel || lead.sourceType || 'Telegram'}</td>
                        <td className="px-6 py-4 text-slate-700 dark:text-slate-300">
                          {lead.serviceName || (lead.note ? lead.note.slice(0, 45) + (lead.note.length > 45 ? '...' : '') : '-')}
                        </td>
                        <td className="px-6 py-4 font-mono text-xs font-bold text-emerald-600 dark:text-emerald-400">
                          {leadPhone || (
                            <span className="text-slate-400 font-normal italic">No contact</span>
                          )}
                        </td>
                        <td className="px-6 py-4 text-center">
                          <Badge variant="outline" className={`text-[10px] font-extrabold uppercase px-2.5 py-0.5 ${priorityColors[lead.priority] || priorityColors.medium}`}>
                            {lead.priority === 'high' ? 'High Potential' : lead.priority}
                          </Badge>
                        </td>
                        <td className="px-6 py-4 text-center">
                          <Badge variant="outline" className={`text-[10px] font-bold px-2 py-0.5 capitalize ${leadStatusColors[lead.status] || leadStatusColors.new}`}>
                            {lead.status}
                          </Badge>
                        </td>
                        <td className="px-6 py-4 text-center">
                          <div className="flex items-center justify-center gap-2">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => openEditLead(lead)}
                              className="h-8 w-8 text-blue-600 hover:text-blue-700 hover:bg-blue-50 dark:hover:bg-blue-950/30 rounded-md cursor-pointer"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => {
                                setLeadDeleteConfirmText('');
                                setLeadToDelete(lead);
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
                ) : demandError ? (
                  <tr>
                    <td colSpan={8} className="px-6 py-12 text-center text-sm">
                      <p className="font-semibold text-red-600 dark:text-red-400">Couldn&apos;t load leads. Check your connection and try again.</p>
                      <Button variant="outline" size="sm" className="mt-3" onClick={() => void refetchDemands()}>Retry</Button>
                    </td>
                  </tr>
                ) : (
                  <tr>
                    <td colSpan={8} className="px-6 py-12 text-center text-sm text-slate-500">
                      No demand leads found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>

        {/* Lead Pagination Footer */}
        {demandData && demandData.totalPages > 1 && (
          <div className="flex items-center justify-between border-t border-slate-200 dark:border-slate-800 bg-card/20 px-6 py-4">
            <div className="text-xs text-muted-foreground font-mono">
              Showing Page <span className="text-foreground font-bold">{demandPage}</span> of{' '}
              <span className="text-foreground font-bold">{demandData.totalPages}</span>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={demandPage <= 1}
                onClick={() => setDemandPage(p => Math.max(1, p - 1))}
                className="bg-card border-border text-foreground hover:bg-muted cursor-pointer"
              >
                <ChevronLeft className="w-4 h-4 mr-1" />
                Prev
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={demandPage >= demandData.totalPages}
                onClick={() => setDemandPage(p => Math.min(demandData.totalPages, p + 1))}
                className="bg-card border-border text-foreground hover:bg-muted cursor-pointer"
              >
                Next
                <ChevronRight className="w-4 h-4 ml-1" />
              </Button>
            </div>
          </div>
        )}
      </Card>

      {/* ─── MODALS ──────────────────────────────────────────────────────── */}

      {/* Customer Create/Edit Modal */}
      {(isCreatingCustomer || editingCustomer) && (
        <ModalPortal className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 animate-in fade-in duration-200 p-4">
          <form onSubmit={handleSaveCustomer} className="bg-card border border-border w-full max-w-lg rounded-lg overflow-hidden shadow-lg animate-in zoom-in-95 duration-200 text-foreground">
            <div className="flex justify-between items-center border-b border-border p-6 pb-4">
              <h3 className="text-lg font-bold text-foreground">
                {editingCustomer ? `Edit Client: ${editingCustomer.name}` : 'Add New Client'}
              </h3>
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
                  <Input
                    required
                    value={customerForm.name}
                    onChange={(e) => setCustomerForm({ ...customerForm, name: e.target.value })}
                    placeholder="Enter client's full name"
                    className="bg-muted/35 border-border text-foreground"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold uppercase text-muted-foreground">Company</label>
                  <Input
                    value={customerForm.company}
                    onChange={(e) => setCustomerForm({ ...customerForm, company: e.target.value })}
                    placeholder="Company Name"
                    className="bg-muted/35 border-border text-foreground"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold uppercase text-muted-foreground">Phone</label>
                  <Input
                    value={customerForm.phone}
                    onChange={(e) => setCustomerForm({ ...customerForm, phone: e.target.value })}
                    placeholder="Phone number"
                    className="bg-muted/35 border-border text-foreground"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold uppercase text-muted-foreground">Email</label>
                  <Input
                    type="email"
                    value={customerForm.email}
                    onChange={(e) => setCustomerForm({ ...customerForm, email: e.target.value })}
                    placeholder="Email address"
                    className="bg-muted/35 border-border text-foreground"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold uppercase text-muted-foreground">Client Status</label>
                  <select
                    value={customerForm.status}
                    onChange={(e) => setCustomerForm({ ...customerForm, status: e.target.value })}
                    className="w-full h-10 bg-muted border border-border rounded-lg px-3 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-blue-500"
                  >
                    <option value="active">Active</option>
                    <option value="pending">Pending</option>
                    <option value="inactive">Inactive</option>
                  </select>
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold uppercase text-muted-foreground">Notes</label>
                <textarea
                  value={customerForm.notes}
                  onChange={(e) => setCustomerForm({ ...customerForm, notes: e.target.value })}
                  placeholder="Notes about client history, SLA requirements..."
                  className="w-full h-20 bg-muted/40 border border-border rounded-lg p-3 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-blue-500 placeholder:text-muted-foreground"
                />
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
              <Button
                type="submit"
                disabled={createCustomerMutation.isPending || updateCustomerMutation.isPending}
                className="bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 font-bold shrink-0 cursor-pointer"
              >
                {(createCustomerMutation.isPending || updateCustomerMutation.isPending) && (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin shrink-0" />
                )}
                Save Client
              </Button>
            </div>
          </form>
        </ModalPortal>
      )}

      {/* Demand Lead Create/Edit Modal */}
      {(isCreatingLead || editingLead) && (
        <ModalPortal className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 animate-in fade-in duration-200 p-4">
          <form onSubmit={handleSaveLead} className="bg-card border border-border w-full max-w-lg rounded-lg overflow-hidden shadow-lg animate-in zoom-in-95 duration-200 text-foreground">
            <div className="flex justify-between items-center border-b border-border p-6 pb-4">
              <h3 className="text-lg font-bold text-foreground">
                {editingLead ? 'Edit Demand Lead' : 'Add New Demand Lead'}
              </h3>
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
                  <label className="text-xs font-semibold uppercase text-muted-foreground">Lead Name / Client Name *</label>
                  <Input
                    required
                    value={leadForm.customerName}
                    onChange={(e) => setLeadForm({ ...leadForm, customerName: e.target.value })}
                    placeholder="e.g. Aung Myint"
                    className="bg-muted/35 border-border text-foreground"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold uppercase text-muted-foreground">Phone Number</label>
                  <Input
                    value={leadForm.customerPhone}
                    onChange={(e) => setLeadForm({ ...leadForm, customerPhone: e.target.value })}
                    placeholder="e.g. 09950111222"
                    className="bg-muted/35 border-border text-foreground"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold uppercase text-muted-foreground">Company Name</label>
                  <Input
                    value={leadForm.customerCompany}
                    onChange={(e) => setLeadForm({ ...leadForm, customerCompany: e.target.value })}
                    placeholder="e.g. Mandalay Retail"
                    className="bg-muted/35 border-border text-foreground"
                  />
                </div>
                <div className="space-y-1.5 col-span-2">
                  <label className="text-xs font-semibold uppercase text-muted-foreground">Requested Service / Interest</label>
                  <Input
                    value={leadForm.serviceName}
                    onChange={(e) => setLeadForm({ ...leadForm, serviceName: e.target.value })}
                    placeholder="e.g. Gold Package, AI CRM Setup"
                    className="bg-muted/35 border-border text-foreground"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold uppercase text-muted-foreground">Price Amount (Ks)</label>
                  <Input
                    type="number"
                    value={leadForm.serviceAmount}
                    onChange={(e) => setLeadForm({ ...leadForm, serviceAmount: e.target.value })}
                    placeholder="e.g. 1500000"
                    className="bg-muted/35 border-border text-foreground"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold uppercase text-muted-foreground">Quantity</label>
                  <Input
                    type="number"
                    value={leadForm.serviceQty}
                    onChange={(e) => setLeadForm({ ...leadForm, serviceQty: e.target.value })}
                    placeholder="1"
                    className="bg-muted/35 border-border text-foreground"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold uppercase text-muted-foreground">Follow-up Date</label>
                  <Input
                    type="date"
                    value={leadForm.followUpDate}
                    onChange={(e) => setLeadForm({ ...leadForm, followUpDate: e.target.value })}
                    className="bg-muted/35 border-border text-foreground w-full"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold uppercase text-muted-foreground">Priority / Potential</label>
                  <select
                    value={leadForm.priority}
                    onChange={(e) => setLeadForm({ ...leadForm, priority: e.target.value })}
                    className="w-full h-10 bg-muted border border-border rounded-lg px-3 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-blue-500"
                  >
                    <option value="high">High Potential</option>
                    <option value="medium">Medium</option>
                    <option value="low">Low</option>
                  </select>
                </div>
                <div className="space-y-1.5 col-span-2">
                  <label className="text-xs font-semibold uppercase text-muted-foreground">Lead Stage / Status</label>
                  <select
                    value={leadForm.status}
                    onChange={(e) => setLeadForm({ ...leadForm, status: e.target.value })}
                    className="w-full h-10 bg-muted border border-border rounded-lg px-3 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-blue-500"
                  >
                    <option value="new">New Lead</option>
                    <option value="contacted">Contacted</option>
                    <option value="quoted">Quoted</option>
                    <option value="pending">Pending Handoff</option>
                    <option value="closed">Closed Deal</option>
                  </select>
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold uppercase text-muted-foreground">Conversation Note / Details</label>
                <textarea
                  value={leadForm.note}
                  onChange={(e) => setLeadForm({ ...leadForm, note: e.target.value })}
                  placeholder="Requested custom reports, wants domain transfer support..."
                  className="w-full h-20 bg-muted/40 border border-border rounded-lg p-3 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-blue-500 placeholder:text-muted-foreground"
                />
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
              <Button
                type="submit"
                disabled={createLeadMutation.isPending || updateLeadMutation.isPending}
                className="bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 font-bold shrink-0 cursor-pointer"
              >
                {(createLeadMutation.isPending || updateLeadMutation.isPending) && (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin shrink-0" />
                )}
                Save Lead
              </Button>
            </div>
          </form>
        </ModalPortal>
      )}

      {/* Delete Single Customer Confirmation */}
      {customerToDelete && (
        <AlertDialog open={!!customerToDelete} onOpenChange={(open) => {
          if (!open) {
            setCustomerToDelete(null);
            setCustomerDeleteConfirmText('');
          }
        }}>
          <AlertDialogContent className="bg-card border-border text-foreground">
            <AlertDialogHeader>
              <AlertDialogTitle>Delete {customerToDelete.name}?</AlertDialogTitle>
              <AlertDialogDescription className="text-muted-foreground">
                This will move this client to Trash. Related activity history stays linked, and admins can restore the client later.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <div className="space-y-2">
              <label className="text-sm font-semibold text-foreground">Type confirm to move this client to Trash</label>
              <Input
                value={customerDeleteConfirmText}
                onChange={(event) => setCustomerDeleteConfirmText(event.target.value)}
                disabled={deleteCustomer.isPending}
                placeholder="confirm"
                className="h-10 font-mono"
              />
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

      {/* Delete Single Lead Confirmation */}
      {leadToDelete && (
        <AlertDialog open={!!leadToDelete} onOpenChange={(open) => {
          if (!open) {
            setLeadToDelete(null);
            setLeadDeleteConfirmText('');
          }
        }}>
          <AlertDialogContent className="bg-card border-border text-foreground">
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Lead for {leadToDelete.customerName || 'Unknown'}?</AlertDialogTitle>
              <AlertDialogDescription className="text-muted-foreground">
                This will move this demand lead record to Trash. Admins can restore it later.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <div className="space-y-2">
              <label className="text-sm font-semibold text-foreground">Type confirm to move this lead to Trash</label>
              <Input
                value={leadDeleteConfirmText}
                onChange={(event) => setLeadDeleteConfirmText(event.target.value)}
                disabled={deleteLeadMutation.isPending}
                placeholder="confirm"
                className="h-10 font-mono"
              />
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

export default function CustomersPage() {
  return (
    <Suspense fallback={<PageLoadingState label="Loading Customers..." />}>
      <CustomersPageContent />
    </Suspense>
  );
}
