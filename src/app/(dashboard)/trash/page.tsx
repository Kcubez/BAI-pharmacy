"use client";

import { useMemo, useState } from "react";
import { RotateCcw, SearchX, Trash2, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DestructiveConfirmDialog } from "@/components/ui/destructive-confirm-dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  usePermanentDeleteTrashRecord,
  useRequestTrashRestore,
  useRestoreTrashRecord,
  useRestoreAllTrash,
  usePermanentDeleteAllTrash,
  useRequestRestoreAllTrash,
  useTrash,
} from "@/hooks/use-trash";
import type { TrashRecord, TrashRecordType } from "@/lib/api";

const typeLabels: Record<TrashRecordType | "all", string> = {
  all: "All Records",
  customers: "Customer Service",
  sales: "Legacy Sales",
  finance: "Finance",
  financeEntries: "Finance Ledger",
  products: "Products",
  deals: "Deals",
  expenses: "Expenses",
  marketing: "Marketing",
  pharma_supplier: "Pharma Suppliers",
  pharma_product: "Pharma Products",
  pharma_po: "Pharma Purchase Orders",
  pharma_invoice: "Pharma Invoices",
  pharma_sales: "Pharma Sales Lines",
  pharma_receivable: "Pharma Receivables",
  pharma_stock: "Pharma Stock Snapshots",
  pharma_movement: "Pharma Stock Movement",
  pharma_expiry: "Pharma Expiry Lots",
  pharma_return: "Pharma Returns",
  pharma_storein: "Pharma Store-in Lots",
};

const typeBadgeVariant: Record<TrashRecordType, "default" | "secondary" | "outline" | "destructive"> = {
  customers: "secondary",
  sales: "default",
  finance: "outline",
  financeEntries: "outline",
  products: "secondary",
  deals: "default",
  expenses: "outline",
  marketing: "secondary",
  pharma_supplier: "secondary",
  pharma_product: "secondary",
  pharma_po: "default",
  pharma_invoice: "default",
  pharma_sales: "default",
  pharma_receivable: "outline",
  pharma_stock: "outline",
  pharma_movement: "outline",
  pharma_expiry: "destructive",
  pharma_return: "destructive",
  pharma_storein: "destructive",
};

export default function TrashPage() {
  const [type, setType] = useState<TrashRecordType | "all">("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [page, setPage] = useState(1);
  const [pendingPermanentDelete, setPendingPermanentDelete] = useState<TrashRecord | null>(null);
  const [showRestoreAllConfirm, setShowRestoreAllConfirm] = useState(false);
  const [showDeleteAllConfirm, setShowDeleteAllConfirm] = useState(false);
  const [showRequestAllConfirm, setShowRequestAllConfirm] = useState(false);

  const params = useMemo(
    () => ({
      page,
      limit: 25,
      type,
      dateFrom: dateFrom || undefined,
      dateTo: dateTo || undefined,
    }),
    [dateFrom, dateTo, page, type],
  );

  const { data, isLoading, isError, refetch } = useTrash(params);
  const restoreMutation = useRestoreTrashRecord();
  const requestRestoreMutation = useRequestTrashRestore();
  const permanentDeleteMutation = usePermanentDeleteTrashRecord();
  const restoreAllMutation = useRestoreAllTrash();
  const deleteAllMutation = usePermanentDeleteAllTrash();
  const requestRestoreAllMutation = useRequestRestoreAllTrash();

  const handleTypeChange = (value: string | null) => {
    setType((value || "all") as TrashRecordType | "all");
    setPage(1);
  };

  const handleRestoreAll = async () => {
    await restoreAllMutation.mutateAsync({ type, dateFrom: dateFrom || undefined, dateTo: dateTo || undefined });
    setShowRestoreAllConfirm(false);
  };

  const handleDeleteAll = async () => {
    await deleteAllMutation.mutateAsync({ type, dateFrom: dateFrom || undefined, dateTo: dateTo || undefined });
    setShowDeleteAllConfirm(false);
  };

  const handleRequestAll = async () => {
    await requestRestoreAllMutation.mutateAsync({ type, dateFrom: dateFrom || undefined, dateTo: dateTo || undefined });
    setShowRequestAllConfirm(false);
  };

  const handlePermanentDelete = async () => {
    if (!pendingPermanentDelete) return;
    await permanentDeleteMutation.mutateAsync({
      type: pendingPermanentDelete.type,
      id: pendingPermanentDelete.id,
    });
    setPendingPermanentDelete(null);
  };

  const records = data?.records ?? [];
  const canRestore = Boolean(data?.canRestore);
  const canPermanentDelete = Boolean(data?.canPermanentDelete);
  const totalPages = data?.totalPages ?? 1;

  return (
    <div className="min-h-[calc(100vh-7rem)] text-slate-950 dark:text-slate-50">
      <div className="flex flex-col gap-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-3xl font-bold text-foreground font-heading">Trash</h1>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
              Deleted business records stay here until restored. Restore needs admin approval — permanent delete is self-service.
            </p>
          </div>
          {canPermanentDelete && (
            <Button
              variant="outline"
              size="sm"
              className="h-9 gap-1 rounded-lg border-red-200 text-red-700 hover:bg-red-50 dark:border-red-900 dark:text-red-300 dark:hover:bg-red-950/40 cursor-pointer font-bold"
              disabled={records.length === 0 || deleteAllMutation.isPending}
              onClick={() => setShowDeleteAllConfirm(true)}
            >
              <Trash2 className="h-3.5 w-3.5" />
              Delete All
            </Button>
          )}
        </div>

        <div className="rounded-lg border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="flex flex-col gap-3 border-b border-slate-200 p-4 dark:border-slate-800 md:flex-row md:items-end">
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold uppercase text-slate-500">Record Type</label>
              <Select value={type} onValueChange={handleTypeChange}>
                <SelectTrigger className="h-9 w-full min-w-52 bg-card md:w-56">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-card">
                  <SelectItem value="all">{typeLabels.all}</SelectItem>
                  <SelectItem value="customers">{typeLabels.customers}</SelectItem>
                  <SelectItem value="sales">{typeLabels.sales}</SelectItem>
                  <SelectItem value="finance">{typeLabels.finance}</SelectItem>
                  <SelectItem value="financeEntries">{typeLabels.financeEntries}</SelectItem>
                  <SelectItem value="products">{typeLabels.products}</SelectItem>
                  <SelectItem value="deals">{typeLabels.deals}</SelectItem>
                  <SelectItem value="expenses">{typeLabels.expenses}</SelectItem>
                  <SelectItem value="marketing">{typeLabels.marketing}</SelectItem>
                  <SelectItem value="pharma_supplier">{typeLabels.pharma_supplier}</SelectItem>
                  <SelectItem value="pharma_product">{typeLabels.pharma_product}</SelectItem>
                  <SelectItem value="pharma_po">{typeLabels.pharma_po}</SelectItem>
                  <SelectItem value="pharma_invoice">{typeLabels.pharma_invoice}</SelectItem>
                  <SelectItem value="pharma_sales">{typeLabels.pharma_sales}</SelectItem>
                  <SelectItem value="pharma_receivable">{typeLabels.pharma_receivable}</SelectItem>
                  <SelectItem value="pharma_stock">{typeLabels.pharma_stock}</SelectItem>
                  <SelectItem value="pharma_movement">{typeLabels.pharma_movement}</SelectItem>
                  <SelectItem value="pharma_expiry">{typeLabels.pharma_expiry}</SelectItem>
                  <SelectItem value="pharma_return">{typeLabels.pharma_return}</SelectItem>
                  <SelectItem value="pharma_storein">{typeLabels.pharma_storein}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold uppercase text-slate-500">Deleted From</label>
              <Input
                type="date"
                value={dateFrom}
                onChange={(event) => {
                  setDateFrom(event.target.value);
                  setPage(1);
                }}
                className="h-9 w-full bg-card md:w-40"
              />
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold uppercase text-slate-500">Deleted To</label>
              <Input
                type="date"
                value={dateTo}
                onChange={(event) => {
                  setDateTo(event.target.value);
                  setPage(1);
                }}
                className="h-9 w-full bg-card md:w-40"
              />
            </div>

            {canRestore && (
              <div className="flex items-center gap-2 md:ml-auto w-full md:w-auto mt-4 md:mt-0">
                {canRestore && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-9 gap-1 rounded-lg border-emerald-200 text-emerald-700 hover:bg-emerald-50 dark:border-emerald-900 dark:text-emerald-300 dark:hover:bg-emerald-950/40 cursor-pointer w-full md:w-auto font-bold"
                    disabled={records.length === 0 || restoreAllMutation.isPending}
                    onClick={() => setShowRestoreAllConfirm(true)}
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                    Restore All
                  </Button>
                )}
              </div>
            )}

            {!canRestore && (
              <div className="flex items-center gap-2 md:ml-auto w-full md:w-auto mt-4 md:mt-0">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-9 gap-1 rounded-lg border-amber-200 text-amber-700 hover:bg-amber-50 dark:border-amber-900 dark:text-amber-300 dark:hover:bg-amber-950/40 cursor-pointer w-full md:w-auto font-bold"
                  disabled={records.length === 0 || requestRestoreAllMutation.isPending}
                  onClick={() => setShowRequestAllConfirm(true)}
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  Request All
                </Button>
              </div>
            )}
          </div>

          <div className="min-h-96">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-4">Record</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Record Date</TableHead>
                  <TableHead>Deleted At</TableHead>
                  <TableHead className="text-right pr-4">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={5} className="h-40 text-center text-sm text-muted-foreground">
                      Loading deleted records...
                    </TableCell>
                  </TableRow>
                ) : isError ? (
                  <TableRow>
                    <TableCell colSpan={5} className="h-56 text-center text-sm">
                      <p className="font-semibold text-red-600 dark:text-red-400">Couldn&apos;t load trash. Check your connection and try again.</p>
                      <Button variant="outline" size="sm" className="mt-3" onClick={() => void refetch()}>Retry</Button>
                    </TableCell>
                  </TableRow>
                ) : records.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="h-56">
                      <div className="flex flex-col items-center justify-center gap-2 text-center text-muted-foreground">
                        <SearchX className="h-8 w-8" />
                        <p className="text-sm font-medium">No deleted records found.</p>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  records.map((record) => (
                    <TableRow key={`${record.type}:${record.id}`}>
                      <TableCell className="max-w-md pl-4">
                        <div className="min-w-0">
                          <p className="truncate font-medium text-slate-950 dark:text-slate-50">{record.title}</p>
                          <div className="flex min-w-0 items-center gap-2">
                            <p className="truncate text-xs text-slate-500">{record.subtitle}</p>
                            {record.restoreRequestCount > 0 && (
                              <Badge variant="outline" className="h-5 shrink-0 border-amber-300 text-amber-700 dark:border-amber-800 dark:text-amber-300">
                                {record.restoreRequestCount} request{record.restoreRequestCount === 1 ? "" : "s"}
                              </Badge>
                            )}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant={typeBadgeVariant[record.type]}>{typeLabels[record.type]}</Badge>
                      </TableCell>
                      <TableCell className="text-slate-600 dark:text-slate-400">
                        {record.recordDate || "-"}
                      </TableCell>
                      <TableCell className="text-slate-600 dark:text-slate-400">
                        {record.deletedAt ? new Date(record.deletedAt).toLocaleString() : "-"}
                      </TableCell>
                      <TableCell className="pr-4">
                        <div className="flex justify-end gap-2">
                          {canRestore ? (
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-8 gap-1 rounded-lg"
                              disabled={restoreMutation.isPending && restoreMutation.variables?.id === record.id}
                              onClick={() => restoreMutation.mutate({ type: record.type, id: record.id })}
                            >
                              {restoreMutation.isPending && restoreMutation.variables?.id === record.id ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <RotateCcw className="h-3.5 w-3.5" />
                              )}
                              Restore
                            </Button>
                          ) : (
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-8 gap-1 rounded-lg"
                              disabled={(requestRestoreMutation.isPending && requestRestoreMutation.variables?.id === record.id) || record.restoreRequested}
                              onClick={() => requestRestoreMutation.mutate({ type: record.type, id: record.id })}
                            >
                              {requestRestoreMutation.isPending && requestRestoreMutation.variables?.id === record.id ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <RotateCcw className="h-3.5 w-3.5" />
                              )}
                              {record.restoreRequested ? "Requested" : "Request"}
                            </Button>
                          )}

                          {canPermanentDelete && (
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-8 gap-1 rounded-lg border-red-200 text-red-700 hover:bg-red-50 dark:border-red-900 dark:text-red-300 dark:hover:bg-red-950/40"
                              onClick={() => setPendingPermanentDelete(record)}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                              Delete
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          <div className="flex items-center justify-between border-t border-slate-200 px-4 py-3 text-sm dark:border-slate-800">
            <span className="text-slate-500">
              {data?.total ?? 0} deleted record{(data?.total ?? 0) === 1 ? "" : "s"}
            </span>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage((value) => Math.max(1, value - 1))}
              >
                Previous
              </Button>
              <span className="min-w-20 text-center text-xs font-medium text-slate-500">
                {page} / {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= totalPages}
                onClick={() => setPage((value) => value + 1)}
              >
                Next
              </Button>
            </div>
          </div>
        </div>
      </div>

      {pendingPermanentDelete && (
        <DestructiveConfirmDialog
          title="Permanently delete record?"
          description={
            <span>
              This will permanently remove <strong>{pendingPermanentDelete.title}</strong> from the database.
              This cannot be restored from Trash.
            </span>
          }
          confirmLabel="Permanent Delete"
          confirmationText="PERMANENT DELETE"
          confirmationLabel="Type PERMANENT DELETE to confirm"
          isPending={permanentDeleteMutation.isPending}
          onCancel={() => setPendingPermanentDelete(null)}
          onConfirm={handlePermanentDelete}
        />
      )}

      {showRestoreAllConfirm && (
        <DestructiveConfirmDialog
          title="Restore all matching records?"
          description={
            <span>
              This will restore all <strong>{typeLabels[type]}</strong> records in the selected date range back to the active dashboard.
            </span>
          }
          confirmLabel="Restore All"
          confirmationText="confirm"
          confirmationLabel="Type confirm to restore all matching records"
          isPending={restoreAllMutation.isPending}
          onCancel={() => setShowRestoreAllConfirm(false)}
          onConfirm={handleRestoreAll}
        />
      )}

      {showDeleteAllConfirm && (
        <DestructiveConfirmDialog
          title="Permanently delete all matching records?"
          description={
            <span>
              This will permanently remove all <strong>{typeLabels[type]}</strong> records in the selected date range from the database. <strong>This action cannot be undone.</strong>
            </span>
          }
          confirmLabel="Permanent Delete All"
          confirmationText="PERMANENT DELETE ALL"
          confirmationLabel="Type PERMANENT DELETE ALL to confirm"
          isPending={deleteAllMutation.isPending}
          onCancel={() => setShowDeleteAllConfirm(false)}
          onConfirm={handleDeleteAll}
        />
      )}

      {showRequestAllConfirm && (
        <DestructiveConfirmDialog
          title="Request restore for all matching records?"
          description={
            <span>
              This will request an admin to restore all <strong>{typeLabels[type]}</strong> records in the selected date range back to active.
            </span>
          }
          confirmLabel="Request All"
          confirmationText="confirm"
          confirmationLabel="Type confirm to request restore for all matching records"
          isPending={requestRestoreAllMutation.isPending}
          onCancel={() => setShowRequestAllConfirm(false)}
          onConfirm={handleRequestAll}
        />
      )}
    </div>
  );
}
