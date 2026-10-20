"use client";

import { useId, useState } from "react";
import Link from "next/link";
import { ChevronDown, ChevronUp, Trash2 } from "lucide-react";
import { usePharmacyDeleteAll, usePharmacyResetPreview } from "@/hooks/use-pharmacy";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { DestructiveConfirmDialog } from "@/components/ui/destructive-confirm-dialog";

const labels: Record<string, string> = {
  purchaseOrders: "Purchase orders", purchaseInvoices: "Purchase invoices", salesLines: "Sales lines",
  receivables: "Receivables", stockSnapshots: "Stock snapshots", stockMovements: "Stock movements",
  expiryLots: "Expiry lots", stockReturns: "Returns", storeInLots: "Store-in lots",
  suppliers: "Suppliers", products: "Products",
};

export function PharmacyDataManagement({ importPending = false }: { importPending?: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const panelId = useId();
  return (
    <div className="flex flex-col gap-4">
      <Button
        variant="ghost"
        size="sm"
        className="self-start"
        aria-expanded={expanded}
        aria-controls={panelId}
        onClick={() => setExpanded(open => !open)}
      >
        {expanded ? "Hide data management" : "View data management"}
        {expanded ? <ChevronUp data-icon="inline-end" /> : <ChevronDown data-icon="inline-end" />}
      </Button>
      {expanded && <div id={panelId}><PharmacyDataManagementPanel importPending={importPending} /></div>}
    </div>
  );
}

function PharmacyDataManagementPanel({ importPending }: { importPending: boolean }) {
  const preview = usePharmacyResetPreview();
  const reset = usePharmacyDeleteAll();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [moved, setMoved] = useState<number | null>(null);
  const counts = preview.data?.counts ?? {};
  const unavailable = preview.isPending || preview.isError || preview.isFetching || !preview.data?.total || importPending || reset.isPending;

  async function confirmReset() {
    try {
      const result = await reset.mutateAsync("all");
      setMoved(result.total);
      setConfirmOpen(false);
    } catch {
      // The mutation displays the error toast. Keep confirmation available for retry.
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Data Management</CardTitle>
        <CardDescription>
          Move all pharmacy records for your account to Trash, including Products and Suppliers.
          Other accounts are unaffected. All dates are included, regardless of dashboard filters.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {moved !== null && (
          <Alert role="status">
            <AlertTitle>{moved.toLocaleString()} records moved to Trash</AlertTitle>
            <AlertDescription>
              အပြီးဖျက်ပြီး အသစ်ပြန်တင်လိုပါက Trash မှာ Permanently Delete ဆက်လုပ်ပါ။ Restore အတွက် admin approval လိုအပ်ပါတယ်။
            </AlertDescription>
          </Alert>
        )}
        {preview.isPending ? <Skeleton className="h-32 w-full" /> : preview.isError ? (
          <Alert variant="destructive">
            <AlertTitle>Could not load record counts</AlertTitle>
            <AlertDescription>
              <Button variant="outline" size="sm" onClick={() => preview.refetch()}>Retry counts</Button>
            </AlertDescription>
          </Alert>
        ) : (
          <>
            <p className="text-sm font-medium tabular-nums">{preview.data?.total.toLocaleString()} active records</p>
            <dl className="grid grid-cols-1 gap-x-8 gap-y-2 sm:grid-cols-2">
              {Object.entries(labels).map(([key, label]) => (
                <div key={key} className="flex items-baseline justify-between gap-3 text-sm">
                  <dt className="text-muted-foreground">{label}</dt>
                  <dd className="tabular-nums">{(counts[key] ?? 0).toLocaleString()}</dd>
                </div>
              ))}
            </dl>
            {preview.data?.total === 0 && <p className="text-sm text-muted-foreground">No active pharmacy records remain. Previously deleted records may still be in Trash.</p>}
          </>
        )}
      </CardContent>
      <CardFooter className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Button variant="destructive" disabled={Boolean(unavailable)} onClick={() => setConfirmOpen(true)}>
          <Trash2 data-icon="inline-start" />Move all pharmacy data to Trash
        </Button>
        <Button variant="outline" render={<Link href="/trash" />}>Open Trash</Button>
      </CardFooter>
      {confirmOpen && (
        <DestructiveConfirmDialog
          title="Move all pharmacy data to Trash?"
          description={<div className="flex flex-col gap-2">
            <p>This moves {preview.data?.total.toLocaleString()} active records from your account to Trash.</p>
            <p>Includes {(counts.products ?? 0).toLocaleString()} Products and {(counts.suppliers ?? 0).toLocaleString()} Suppliers, plus all purchases, sales, receivables, stock, expiry and returns records.</p>
            <p>သင့် account ရဲ့ ကာလအားလုံးအတွက် သက်ရောက်ပါမယ်။ အပြီးဖျက်ခြင်းကို Trash မှာ သီးခြားလုပ်ရပါမယ်။</p>
          </div>}
          notice="Records move to Trash. Restore requires admin approval."
          confirmationText="RESET"
          confirmationLabel="Type RESET to confirm"
          confirmLabel="Move to Trash"
          isPending={reset.isPending}
          onCancel={() => setConfirmOpen(false)}
          onConfirm={confirmReset}
        />
      )}
    </Card>
  );
}
