// ─── API helper ─────────────────────────────────────────────────────────────

type RequestOptions = {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
  headers?: Record<string, string>;
};

type DateRangeParams = {
  dateFrom?: string;
  dateTo?: string;
};

function buildDateRangeQuery(params: DateRangeParams = {}) {
  const searchParams = new URLSearchParams();
  if (params.dateFrom) searchParams.set("dateFrom", params.dateFrom);
  if (params.dateTo) searchParams.set("dateTo", params.dateTo);
  const qs = searchParams.toString();
  return qs ? `?${qs}` : "";
}

async function request<T>(url: string, options: RequestOptions = {}): Promise<T> {
  const { method = "GET", body, headers = {} } = options;

  const res = await fetch(url, {
    method,
    // Never serve API responses from the browser HTTP cache: stale flags
    // (e.g. trash permissions) otherwise survive code updates and reloads.
    cache: "no-store",
    headers: {
      "Content-Type": "application/json",
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    const error = await res.json().catch(() => ({ message: "Request failed" }));
    throw new Error(error.message ?? "Request failed");
  }

  return res.json() as Promise<T>;
}

// ─── Users API ───────────────────────────────────────────────────────────────

export const usersApi = {
  list: () => request<{ users: AdminUser[] }>("/api/admin/users"),
  get: (id: string) => request<AdminUser>(`/api/admin/users/${id}`),
  create: (data: CreateUserPayload) =>
    request<AdminUser>("/api/admin/users", { method: "POST", body: data }),
  update: (id: string, data: UpdateUserPayload) =>
    request<AdminUser>(`/api/admin/users/${id}`, { method: "PUT", body: data }),
  delete: (id: string) =>
    request<{ success: boolean }>(`/api/admin/users/${id}`, { method: "DELETE" }),
  ban: (id: string, reason?: string) =>
    request<AdminUser>(`/api/admin/users/${id}/ban`, { method: "POST", body: { reason } }),
  unban: (id: string) =>
    request<AdminUser>(`/api/admin/users/${id}/unban`, { method: "POST" }),
};

// ─── Types ───────────────────────────────────────────────────────────────────

export type AdminUser = {
  id: string;
  name: string;
  email: string;
  role: string;
  banned: boolean | null;
  banReason: string | null;
  createdAt: string;
  updatedAt: string;
  businessOwner?: {
    botConnected: boolean;
    botUpdatedAt: string | null;
    staffCount: number;
    authorizedStaffCount: number;
    customerCount: number;
    demandRecordCount: number;
    messageCount: number;
    projectCount: number;
    websiteCount: number;
    businessReportCount: number;
  };
};

export type CreateUserPayload = {
  name: string;
  email: string;
  password: string;
  role: "user" | "admin";
};

export type UpdateUserPayload = {
  name: string;
  email: string;
  role: "user" | "admin";
};

// ─── Telegram Messages API ──────────────────────────────────────────────────

export type TelegramSender = {
  id: string;
  telegramUserId: string | null;
  firstName: string | null;
  lastName: string | null;
  username: string | null;
  displayName: string | null;
  messageCount: number;
  lastMessageAt: string | null;
  activeReportType: string;
  createdAt: string;
  userId?: string | null;
  email?: string | null;
  isVerified?: boolean;
  isAuthorized?: boolean;
  allowedDepartments?: string[];
};

export type TelegramMessageItem = {
  id: string;
  telegramMsgId: number;
  text: string;
  senderId: string;
  sender: TelegramSender;
  chatId: string;
  chatTitle: string | null;
  receivedAt: string;
  createdAt: string;
};

export type MessagesResponse = {
  messages: TelegramMessageItem[];
  total: number;
  page: number;
  totalPages: number;
};

export type MessageStats = {
  totalMessages: number;
  todayMessages: number;
  totalSenders: number;
  weekMessages: number;
  businessReports: number;
  futurePlans: number;
};

export type MessagesParams = {
  page?: number;
  limit?: number;
  search?: string;
  senderId?: string;
};

export const messagesApi = {
  list: (params: MessagesParams = {}) => {
    const searchParams = new URLSearchParams();
    if (params.page) searchParams.set("page", String(params.page));
    if (params.limit) searchParams.set("limit", String(params.limit));
    if (params.search) searchParams.set("search", params.search);
    if (params.senderId) searchParams.set("senderId", params.senderId);
    const qs = searchParams.toString();
    return request<MessagesResponse>(`/api/messages${qs ? `?${qs}` : ""}`);
  },
  delete: (id: string) =>
    request<{ success: boolean }>(`/api/messages/${id}`, { method: "DELETE" }),
  stats: () => request<MessageStats>("/api/messages/stats"),
};

export const sendersApi = {
  list: () => request<{ senders: TelegramSender[] }>("/api/senders"),
};

export const settingsSendersApi = {
  list: () => request<{ senders: TelegramSender[] }>("/api/settings/senders"),
  create: (data: { email: string; allowedDepartments: string[] }) =>
    request<{ sender: TelegramSender }>("/api/settings/senders", {
      method: "POST",
      body: data,
    }),
  update: (id: string, data: { isAuthorized?: boolean; allowedDepartments?: string[] }) =>
    request<{ sender: TelegramSender }>(`/api/settings/senders/${id}`, {
      method: "PUT",
      body: data,
    }),
  delete: (id: string) =>
    request<{ success: boolean }>(`/api/settings/senders/${id}`, {
      method: "DELETE",
    }),
};

// ─── Commerce Dashboard API ─────────────────────────────────────────────────

export type CommercePeriod = "overall" | "day" | "month" | "year" | "custom";

export type CommerceDashboardParams = {
  period: CommercePeriod;
  year: number;
  month: number;
  day?: number;
  from?: string;
  to?: string;
};

export type CommerceTargetValues = {
  targetSalesAmount: number | null;
  targetExpenseAmount: number | null;
  targetDemandCount: number | null;
  targetAppointments: number | null;
  targetNewCustomers: number | null;
};

export type CommerceDashboardKpi = {
  title: string;
  value: string;
  target: string;
  expected: string;
  status: string;
  tone: "emerald" | "red" | "sky" | "amber" | "slate";
  icon: "DollarSign" | "Wallet" | "TrendingUp" | "Megaphone" | "CalendarCheck" | "Users";
  progressPercent: number;
};

export type CommerceDashboard = {
  period: string;
  year: number;
  month: number;
  targets: CommerceTargetValues;
  kpis: CommerceDashboardKpi[];
  analytics: {
    topProducts: { name: string; sku: string | null; quantity: number; income: number }[];
    liveIntelligence: { area: string; text: string }[];
    incomeTrend: { label: string; value: number }[];
    orderTrend: { label: string; value: number }[];
  };
};

export type SaveCommerceTargetsPayload = CommerceDashboardParams & CommerceTargetValues;

export type CommerceWorkspaceData = {
  finance: {
    kpis: { revenue: number; expense: number; profit: number; profitMargin: number };
    timeline: { label: string; revenue: number; expense: number }[];
    expenseBreakdown: { category: string; value: number; percent: number }[];
    records: { id: string; recordType: "deal" | "expense"; date: string; description: string; category: string; type: "Income" | "Expense"; amount: number }[];
    accounting: { totals: Record<string, number>; entries: { id: string; date: string; title: string; cashType: string; accountingType: string; amount: number; status: string; counterparty: string | null; dueDate: string | null; voucherNumber: string | null; notes: string | null }[] };
    insights: { tone: "red" | "emerald" | "amber"; title: string; text: string; action: string }[];
  };
  sales: {
    kpis: { totalSales: number; orders: number; pendingDeliveries: number; pipelineDeals: number };
    stages: { label: string; count: number; deals: { id: string; customer: string; amount: number }[] }[];
    insights: { tone: "red" | "emerald" | "amber"; title: string; text: string; action: string }[];
  };
  marketing: {
    kpis: { adSpend: number; reach: number; costPerOrder: number; adOrders: number };
    chart: { label: string; spend: number; orders: number }[];
    topProducts: { name: string; orders: number }[];
    insights: { tone: "red" | "emerald" | "amber"; title: string; text: string; action: string }[];
  };
  customers: {
    kpis: { inquiries: number; highPotential: number; totalCustomers: number; avgOrderValue: number };
    purchasedCustomers: { id: string; name: string; product: string; amount: number; status: string }[];
    leads: { id: string; name: string; source: string; product: string; status: string }[];
    insights: { tone: "red" | "emerald" | "amber"; title: string; text: string; action: string }[];
  };
  inventory: {
    kpis: { totalProducts: number; lowStockItems: number; outOfStock: number; inventoryValue: number };
    products: { id: string; name: string; productCode: string; stockLevel: string; status: string }[];
    insights: { tone: "red" | "emerald" | "amber"; title: string; text: string; action: string }[];
  };
};

export const commerceDashboardApi = {
  get: (params: CommerceDashboardParams) => {
    const searchParams = commercePeriodQuery(params);
    return request<CommerceDashboard>(`/api/commerce/dashboard?${searchParams.toString()}`);
  },
  saveTargets: (data: SaveCommerceTargetsPayload) =>
    request<{ target: unknown }>("/api/settings/target", {
      method: "PUT",
      body: data,
    }),
  workspaces: (params: CommerceDashboardParams) => {
    const searchParams = commercePeriodQuery(params);
    return request<CommerceWorkspaceData>(`/api/commerce/workspaces?${searchParams.toString()}`);
  },
};

// ─── Commerce Customers (BAI-service Customer Service parity) ──────────────

export type CommerceCustomerDirectoryRow = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  company: string | null;
  status: string;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  purchaseCount: number;
  amountPaid: number;
  purchasedProduct: string | null;
};

export type CommerceCustomerDirectoryResponse = {
  customers: CommerceCustomerDirectoryRow[];
  total: number;
  page: number;
  totalPages: number;
};

export type CommerceCustomersListParams = CommerceDashboardParams & {
  page?: number;
  limit?: number;
  search?: string;
  followUpStatus?: "all" | "overdue" | "due";
};

export type CommerceCustomerRecordRow = {
  id: string;
  purchaseDate: string;
  customerId: string | null;
  customerName: string;
  company: string | null;
  phone: string | null;
  sourceChannel: string | null;
  product: string | null;
  amount: number;
  potential: "high" | "medium" | "low";
  status: "new" | "contacted" | "quoted" | "pending" | "completed" | "lost";
};

export type CommerceCustomerRecordsResponse = {
  records: CommerceCustomerRecordRow[];
  total: number;
  page: number;
  totalPages: number;
};

export type CommerceCustomerRecordInput = {
  customerName: string;
  customerPhone?: string | null;
  customerCompany?: string | null;
  productName?: string | null;
  amount?: number | null;
  quantity?: number | null;
  followUpDate?: string | null;
  status?: "new" | "contacted" | "quoted" | "pending" | "closed" | "completed";
  note?: string | null;
};

export type CommerceCustomerStats = {
  totalPurchaseRecords: number;
  pendingPurchaseRecords: number;
  purchaseCustomers: number;
  avgSpendingValue: number;
};

export type CommerceCustomerMetric = {
  id: string;
  name: string;
  company: string | null;
  totalSpend: number;
  lifetimeValue: number;
  purchaseFrequency: number;
  averageOrderValue: number;
  lastPurchaseAt: string | null;
  segment: "vip" | "frequent" | "at_risk" | "new" | "standard";
};

export type CommerceCustomerAnalytics = {
  top20: CommerceCustomerMetric[];
  bottom20: CommerceCustomerMetric[];
  summary: {
    totalCustomers: number;
    top20AverageSpend: number;
    bottom20AverageSpend: number;
    averageLifetimeValue: number;
    averagePurchaseFrequency: number;
    atRiskCustomers: number;
  };
  recommendations: { tone: "success" | "warning" | "info"; title: string; message: string; action: string }[];
};

export const commerceCustomersApi = {
  directory: (params: CommerceCustomersListParams = { period: "overall", year: 0, month: 0 }) => {
    const searchParams = commercePeriodQuery(params);
    if (params.page) searchParams.set("page", String(params.page));
    if (params.limit) searchParams.set("limit", String(params.limit));
    if (params.search) searchParams.set("search", params.search);
    return request<CommerceCustomerDirectoryResponse>(`/api/commerce/customers?${searchParams.toString()}`);
  },
  stats: (params: CommerceDashboardParams) =>
    request<CommerceCustomerStats>(`/api/commerce/customers/stats?${commercePeriodQuery(params).toString()}`),
  analytics: (params: CommerceDashboardParams) =>
    request<CommerceCustomerAnalytics>(`/api/commerce/customers/analytics?${commercePeriodQuery(params).toString()}`),
  records: (params: CommerceCustomersListParams) => {
    const searchParams = commercePeriodQuery(params);
    if (params.page) searchParams.set("page", String(params.page));
    if (params.limit) searchParams.set("limit", String(params.limit));
    if (params.search) searchParams.set("search", params.search);
    if (params.followUpStatus && params.followUpStatus !== "all") searchParams.set("followUpStatus", params.followUpStatus);
    return request<CommerceCustomerRecordsResponse>(`/api/commerce/customers/records?${searchParams.toString()}`);
  },
  createRecord: (data: CommerceCustomerRecordInput) =>
    request<{ record: CommerceCustomerRecordRow }>("/api/commerce/customers/records", { method: "POST", body: data }),
  updateRecord: (id: string, data: Partial<CommerceCustomerRecordInput>) =>
    request<{ record: CommerceCustomerRecordRow }>(`/api/commerce/customers/records/${id}`, { method: "PATCH", body: data }),
  deleteRecord: (id: string) =>
    request<{ success: boolean }>(`/api/commerce/customers/records/${id}`, { method: "DELETE" }),
};

export type CommerceActionRecommendation = {
  area: "sales" | "finance" | "inventory" | "marketing" | "general";
  severity: "urgent" | "warning" | "info";
  title: string;
  insight: string;
  action: string;
  actionType:
    | "view_sales"
    | "view_finance"
    | "view_inventory"
    | "view_marketing"
    | "set_target_modal"
    | "general_dashboard";
};

export function commercePeriodQuery(params: CommerceDashboardParams) {
  const searchParams = new URLSearchParams();
  searchParams.set("period", params.period);
  if (params.period !== "overall") {
    searchParams.set("year", String(params.year));
    if (params.period !== "year" && params.period !== "custom") {
      searchParams.set("month", String(params.month));
      if (params.period === "day" && params.day) searchParams.set("day", String(params.day));
    }
    if (params.period === "custom") {
      if (params.from) searchParams.set("from", params.from);
      if (params.to) searchParams.set("to", params.to);
    }
  }
  return searchParams;
}

// ─── Demand Sheet API ───────────────────────────────────────────────────────

export type DemandRecord = {
  id: string;
  messageId: string;
  senderId: string;
  sender: TelegramSender;
  customerId: string | null;
  customerName: string | null;
  customer?: Customer | null;
  category: string;
  status: string;
  note: string;
  sourceType: string;
  sourceFileName: string | null;
  sourceChannel: string | null;
  rawData?: Record<string, unknown> | null;
  normalizedData?: Record<string, unknown> | null;
  importBatchId: string | null;
  serviceName: string | null;
  serviceAmount: number | null;
  serviceQty: number | null;
  followUpDate: string | null;
  followUpStatus: string;
  priority: "high" | "medium" | "low";
  potentialScore: number;
  priorityReason: string | null;
  recommendedAction: string | null;
  missingFields: string[];
  confidence: number;
  aiProvider: string;
  aiModel: string | null;
  createdAt: string;
  updatedAt: string;
};

export type DemandRecordsResponse = {
  records: DemandRecord[];
  total: number;
  page: number;
  totalPages: number;
};

export type ServiceStat = {
  serviceName: string;
  salesCount: number;
  totalQty: number;
  revenue: number;
};

export type DemandRecordStats = {
  totalRecords: number;
  todayRecords: number;
  uniqueCustomers: number;
  services: ServiceStat[];
  priority: {
    high: number;
    medium: number;
    low: number;
  };
  insights: {
    type: string;
    severity: "info" | "warning" | "urgent";
    title: string;
    message: string;
    recommendedAction: string;
    action?: string;
    actionType?: "view_high_priority" | "view_missing_phone" | "view_overdue" | "view_due_today";
  }[];
};

export type DemandRecordsParams = {
  page?: number;
  limit?: number;
  search?: string;
  status?: string;
  category?: string;
  senderId?: string;
  priority?: string;
  dateFrom?: string;
  dateTo?: string;
  followUpStatus?: string;
  missingField?: string;
};

export type AIRecommendation = {
  customerName: string;
  insight: string;
};

export type AIRecommendationsResponse = {
  recommendations: AIRecommendation[];
};

export type UpdateDemandRecordPayload = {
  status?: string;
  note?: string;
  followUpDate?: string | null;
  recommendedAction?: string;
  priority?: "high" | "medium" | "low";
  customerName?: string;
  customerPhone?: string | null;
  customerCompany?: string | null;
  serviceName?: string | null;
  serviceAmount?: number | null;
  serviceQty?: number;
};

export const demandRecordsApi = {
  list: (params: DemandRecordsParams = {}) => {
    const searchParams = new URLSearchParams();
    if (params.page) searchParams.set("page", String(params.page));
    if (params.limit) searchParams.set("limit", String(params.limit));
    if (params.search) searchParams.set("search", params.search);
    if (params.status) searchParams.set("status", params.status);
    if (params.category) searchParams.set("category", params.category);
    if (params.senderId) searchParams.set("senderId", params.senderId);
    if (params.priority) searchParams.set("priority", params.priority);
    if (params.dateFrom) searchParams.set("dateFrom", params.dateFrom);
    if (params.dateTo) searchParams.set("dateTo", params.dateTo);
    if (params.followUpStatus) searchParams.set("followUpStatus", params.followUpStatus);
    if (params.missingField) searchParams.set("missingField", params.missingField);
    const qs = searchParams.toString();
    return request<DemandRecordsResponse>(`/api/demand-records${qs ? `?${qs}` : ""}`);
  },
  update: (id: string, data: UpdateDemandRecordPayload) =>
    request<DemandRecord>(`/api/demand-records/${id}`, { method: "PATCH", body: data }),
  create: (data: Partial<DemandRecord>) =>
    request<DemandRecord>("/api/demand-records", { method: "POST", body: data }),
  delete: (id: string) =>
    request<{ success: boolean }>(`/api/demand-records/${id}`, { method: "DELETE" }),
  stats: (params: { dateFrom?: string; dateTo?: string } = {}) => {
    const sp = new URLSearchParams();
    if (params.dateFrom) sp.set("dateFrom", params.dateFrom);
    if (params.dateTo) sp.set("dateTo", params.dateTo);
    const qs = sp.toString();
    return request<DemandRecordStats>(`/api/demand-records/stats${qs ? `?${qs}` : ""}`);
  },
  recommendations: () => request<AIRecommendationsResponse>("/api/demand-records/recommendations"),
  deleteAll: (params: DateRangeParams = {}) =>
    request<{ success: boolean; count: number }>(`/api/demand-records${buildDateRangeQuery(params)}`, { method: "DELETE" }),
};

// ─── Customers API ───────────────────────────────────────────────────────────

export type Customer = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  company: string | null;
  notes: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
  activities: CustomerActivity[];
  demandRecords?: DemandRecord[];
  _count?: { demandRecords: number };
};

export type CustomerActivity = {
  id: string;
  customerId: string;
  action: string;
  description: string;
  senderId: string | null;
  sender: TelegramSender | null;
  createdAt: string;
};

export type CustomerTimelineItem = {
  id: string;
  type: "activity" | "demand";
  action?: string;
  reportType?: string;
  customerName?: string | null;
  category?: string;
  status?: string;
  note?: string;
  followUpDate?: string | null;
  sender?: string;
  senderId?: string | null;
  description?: string;
  createdAt: string;
};

export type CustomerWithTimeline = {
  customer: Customer;
  timeline: CustomerTimelineItem[];
};

export type CustomersResponse = {
  customers: Customer[];
  total: number;
  page: number;
  totalPages: number;
};

export type CustomersParams = {
  page?: number;
  limit?: number;
  search?: string;
  status?: string;
  dateFrom?: string;
  dateTo?: string;
};

export const customersApi = {
  list: (params: CustomersParams = {}) => {
    const searchParams = new URLSearchParams();
    if (params.page) searchParams.set("page", String(params.page));
    if (params.limit) searchParams.set("limit", String(params.limit));
    if (params.search) searchParams.set("search", params.search);
    if (params.status) searchParams.set("status", params.status);
    if (params.dateFrom) searchParams.set("dateFrom", params.dateFrom);
    if (params.dateTo) searchParams.set("dateTo", params.dateTo);
    const qs = searchParams.toString();
    return request<CustomersResponse>(`/api/customers${qs ? `?${qs}` : ""}`);
  },
  get: (id: string) => request<CustomerWithTimeline>(`/api/customers/${id}`),
  create: (data: Partial<Customer>) =>
    request<Customer>("/api/customers", { method: "POST", body: data }),
  update: (id: string, data: Partial<Customer>) =>
    request<Customer>(`/api/customers/${id}`, { method: "PATCH", body: data }),
  delete: (id: string) =>
    request<{ success: boolean }>(`/api/customers/${id}`, { method: "DELETE" }),
  deleteAll: (params: DateRangeParams = {}) =>
    request<{ success: boolean; count: number }>(`/api/customers${buildDateRangeQuery(params)}`, { method: "DELETE" }),
};

// ─── Trash API ───────────────────────────────────────────────────────────────

export type TrashRecordType =
  | "customers"
  | "sales"
  | "finance"
  | "financeEntries"
  | "products"
  | "deals"
  | "expenses"
  | "marketing"
  | "pharma_supplier"
  | "pharma_product"
  | "pharma_po"
  | "pharma_invoice"
  | "pharma_sales"
  | "pharma_receivable"
  | "pharma_stock"
  | "pharma_movement"
  | "pharma_expiry"
  | "pharma_return"
  | "pharma_storein";

export type TrashRecord = {
  type: TrashRecordType;
  id: string;
  title: string;
  subtitle: string;
  recordDate: string | null;
  deletedAt: string | null;
  deletedByUserId: string | null;
  deletedReason: string | null;
  restoreRequested: boolean;
  restoreRequestCount: number;
};

export type TrashParams = {
  page?: number;
  limit?: number;
  type?: TrashRecordType | "all";
  dateFrom?: string;
  dateTo?: string;
};

export type TrashResponse = {
  records: TrashRecord[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  canRestore: boolean;
  canPermanentDelete: boolean;
};

export const trashApi = {
  list: (params: TrashParams = {}) => {
    const sp = new URLSearchParams();
    if (params.page) sp.set("page", String(params.page));
    if (params.limit) sp.set("limit", String(params.limit));
    if (params.type && params.type !== "all") sp.set("type", params.type);
    if (params.dateFrom) sp.set("dateFrom", params.dateFrom);
    if (params.dateTo) sp.set("dateTo", params.dateTo);
    const qs = sp.toString();
    return request<TrashResponse>(`/api/trash${qs ? `?${qs}` : ""}`);
  },
  restore: (type: TrashRecordType, id: string) =>
    request<{ success: boolean; restored: number }>("/api/trash", {
      method: "POST",
      body: { type, id, action: "restore" },
    }),
  requestRestore: (type: TrashRecordType, id: string) =>
    request<{ success: boolean; message: string }>("/api/trash", {
      method: "POST",
      body: { type, id, action: "request_restore" },
    }),
  requestRestoreAll: (type: string, dateFrom?: string, dateTo?: string) =>
    request<{ success: boolean; message: string }>("/api/trash", {
      method: "POST",
      body: { type, action: "request_restore_all", dateFrom, dateTo },
    }),
  permanentDelete: (type: TrashRecordType, id: string, confirmation: "PERMANENT DELETE") =>
    request<{ success: boolean; deleted: number }>("/api/trash", {
      method: "DELETE",
      body: { type, id, confirmation },
    }),
  restoreAll: (type: string, dateFrom?: string, dateTo?: string) =>
    request<{ success: boolean; message: string }>("/api/trash", {
      method: "POST",
      body: { type, action: "restore_all", dateFrom, dateTo },
    }),
  permanentDeleteAll: (type: string, confirmation: "PERMANENT DELETE ALL", dateFrom?: string, dateTo?: string) =>
    request<{ success: boolean; message: string }>("/api/trash", {
      method: "DELETE",
      body: { type, action: "delete_all", confirmation, dateFrom, dateTo },
    }),
};

// ─── Page-specific Stats API ─────────────────────────────────────────────────

export type DailyReportStats = {
  totalReports: number;
  todayReports: number;
  pendingReports: number;
  dueToday: number;
};

export type CustomerFollowupStats = {
  totalFollowUps: number;
  todayFollowUps: number;
  pendingFollowUps: number;
  dueToday: number;
  totalCustomers: number;
};

export const dailyReportApi = {
  stats: () => request<DailyReportStats>("/api/daily-report/stats"),
};

export const customerFollowupsApi = {
  stats: (params: { dateFrom?: string; dateTo?: string } = {}) => {
    const sp = new URLSearchParams();
    if (params.dateFrom) sp.set("dateFrom", params.dateFrom);
    if (params.dateTo) sp.set("dateTo", params.dateTo);
    const qs = sp.toString();
    return request<CustomerFollowupStats>(`/api/customer-followups/stats${qs ? `?${qs}` : ""}`);
  },
};

// ─── Deals, Marketing, Products APIs ──────────────────────────────────────────

export type DealItem = {
  id?: string;
  productId?: string | null;
  productName: string;
  sku?: string | null;
  quantity: number;
  unitPrice: number;
  unitCost?: number | null;
};

export type DealRecord = {
  id: string;
  customerId: string | null;
  customer?: { id: string; name: string; phone: string | null; email: string | null } | null;
  stage: "NEW_LEAD" | "QUOTED" | "FOLLOW_UP_NEEDED" | "PENDING" | "WON" | "LOST";
  quotedAmount: number | null;
  wonAt: string | null;
  lostAt: string | null;
  lostReason: string | null;
  fulfillmentStatus: "NOT_APPLICABLE" | "PENDING" | "PROCESSING" | "FULFILLED" | "CANCELLED";
  source: string;
  sourceChannel: string | null;
  note: string | null;
  createdAt: string;
  updatedAt: string;
  items: DealItem[];
};

export type DealsResponse = {
  deals: DealRecord[];
};

export type DealInput = {
  customerId?: string | null;
  stage?: "NEW_LEAD" | "QUOTED" | "FOLLOW_UP_NEEDED" | "PENDING" | "WON" | "LOST";
  quotedAmount?: number | null;
  wonAt?: string | null;
  lostAt?: string | null;
  lostReason?: string | null;
  fulfillmentStatus?: "NOT_APPLICABLE" | "PENDING" | "PROCESSING" | "FULFILLED" | "CANCELLED";
  source?: string;
  sourceChannel?: string | null;
  note?: string | null;
  items?: DealItem[];
};

export const dealsApi = {
  list: (params: { stage?: string; customerId?: string; dateFrom?: string; dateTo?: string } = {}) => {
    const sp = new URLSearchParams();
    if (params.stage) sp.set("stage", params.stage);
    if (params.customerId) sp.set("customerId", params.customerId);
    if (params.dateFrom) sp.set("dateFrom", params.dateFrom);
    if (params.dateTo) sp.set("dateTo", params.dateTo);
    const qs = sp.toString();
    return request<DealsResponse>(`/api/deals${qs ? `?${qs}` : ""}`);
  },
  create: (data: DealInput) =>
    request<{ deal: DealRecord }>("/api/deals", { method: "POST", body: data }),
  update: (id: string, data: Partial<DealInput>) =>
    request<{ deal: DealRecord }>("/api/deals", { method: "PATCH", body: { id, ...data } }),
  delete: (id: string, reason?: string) => {
    const sp = new URLSearchParams({ id });
    if (reason) sp.set("reason", reason);
    return request<{ success: boolean }>(`/api/deals?${sp.toString()}`, { method: "DELETE" });
  },
};

export type MarketingMetricRecord = {
  id: string;
  metricDate: string;
  channel: string;
  campaignName: string | null;
  spend: number;
  impressions: number | null;
  reach: number | null;
  clicks: number | null;
  leads: number | null;
  adDrivenOrders: number | null;
  adDrivenRevenue: number | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
};

export type MarketingMetricsResponse = {
  metrics: MarketingMetricRecord[];
};

export type MarketingMetricInput = {
  metricDate: string;
  channel: string;
  campaignName?: string | null;
  spend: number;
  impressions?: number | null;
  reach?: number | null;
  clicks?: number | null;
  leads?: number | null;
  adDrivenOrders?: number | null;
  adDrivenRevenue?: number | null;
  notes?: string | null;
};

export const marketingMetricsApi = {
  list: (params: { dateFrom?: string; dateTo?: string } = {}) => {
    const sp = new URLSearchParams();
    if (params.dateFrom) sp.set("dateFrom", params.dateFrom);
    if (params.dateTo) sp.set("dateTo", params.dateTo);
    const qs = sp.toString();
    return request<MarketingMetricsResponse>(`/api/marketing-metrics${qs ? `?${qs}` : ""}`);
  },
  create: (data: MarketingMetricInput) =>
    request<{ metric: MarketingMetricRecord }>("/api/marketing-metrics", { method: "POST", body: data }),
  update: (id: string, data: Partial<MarketingMetricInput>) =>
    request<{ metric: MarketingMetricRecord }>("/api/marketing-metrics", { method: "PATCH", body: { id, ...data } }),
  delete: (id: string, reason?: string) => {
    const sp = new URLSearchParams({ id });
    if (reason) sp.set("reason", reason);
    return request<{ success: boolean }>(`/api/marketing-metrics?${sp.toString()}`, { method: "DELETE" });
  },
};

export type ProductRecord = {
  id: string;
  name: string;
  sku: string | null;
  category: string | null;
  sellingPrice: number | null;
  unitCost: number | null;
  stockQty: number;
  lowStockThreshold: number;
  description: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ProductsResponse = {
  products: ProductRecord[];
};

export type ProductInput = {
  name: string;
  sku?: string | null;
  category?: string | null;
  sellingPrice?: number | null;
  unitCost?: number | null;
  stockQty?: number;
  lowStockThreshold?: number;
  description?: string | null;
};

export const productsApi = {
  list: (params: { search?: string; lowStock?: boolean } = {}) => {
    const sp = new URLSearchParams();
    if (params.search) sp.set("search", params.search);
    if (params.lowStock) sp.set("lowStock", "true");
    const qs = sp.toString();
    return request<ProductsResponse>(`/api/products${qs ? `?${qs}` : ""}`);
  },
  create: (data: ProductInput) =>
    request<{ product: ProductRecord }>("/api/products", { method: "POST", body: data }),
  update: (id: string, data: Partial<ProductInput>) =>
    request<{ product: ProductRecord }>("/api/products", { method: "PATCH", body: { id, ...data } }),
  delete: (id: string, reason?: string) => {
    const sp = new URLSearchParams({ id });
    if (reason) sp.set("reason", reason);
    return request<{ success: boolean }>(`/api/products?${sp.toString()}`, { method: "DELETE" });
  },
};

// ─── Brainstorm & Planning API ───────────────────────────────────────────────

export type PlanningPriority = {
  title: string;
  impact: "high" | "medium" | "low";
  rationale: string;
  action: string;
  actionHref: string;
};

export type PlanningStep = {
  horizon: "Next 30 days" | "Next 60 days" | "Next 90 days";
  goal: string;
  actions: string[];
};

export type PlanningInsightsResponse = {
  source: "ai" | "heuristic" | "local";
  hasData: boolean;
  executiveSummary: string;
  futureOutlook: string;
  snapshot: {
    periodDays: number;
    revenue: number;
    expenses: number;
    profit: number;
    margin: number;
    demandCount: number;
    pendingDeals: number;
    highPriorityLeads: number;
    receivables: number;
    overdueDebt: number;
    upcomingExpiries: number;
    lowStockCount: number;
    lowStockTop: string | null;
    maintenanceProjects: number;
    projectedRevenue30: number;
    projectedExpenses30: number;
    projectedProfit30: number;
  };
  scenarios: { name: string; revenue: number; expenses: number; profit: number; description: string }[];
  priorities: PlanningPriority[];
  plan: PlanningStep[];
};

export const planningApi = {
  insights: (params: { dateFrom?: string; dateTo?: string } = {}) =>
    request<PlanningInsightsResponse>(`/api/planning/insights${buildDateRangeQuery(params)}`),
};

