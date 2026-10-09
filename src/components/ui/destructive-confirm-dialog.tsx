'use client';

import { useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { ReactNode } from 'react';

type DestructiveConfirmDialogProps = {
  title: string;
  description: ReactNode;
  confirmLabel?: string;
  confirmationText?: string;
  confirmationLabel?: string;
  notice?: ReactNode;
  cancelLabel?: string;
  isPending?: boolean;
  onCancel: () => void;
  onConfirm: () => void | Promise<void>;
};

export function DestructiveConfirmDialog({
  title,
  description,
  confirmLabel = 'Delete All',
  confirmationText,
  confirmationLabel,
  notice = 'Deleted records move to Trash unless this is a permanent delete',
  cancelLabel = 'Cancel',
  isPending = false,
  onCancel,
  onConfirm,
}: DestructiveConfirmDialogProps) {
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
  const [typedConfirmation, setTypedConfirmation] = useState('');
  const requiresConfirmation = Boolean(confirmationText);
  const canConfirm = !requiresConfirmation || typedConfirmation.toLowerCase() === (confirmationText ?? '').toLowerCase();

  if (!mounted) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 px-4 py-6 backdrop-blur-md animate-in fade-in duration-150">
      <div className="w-full max-w-xl overflow-hidden rounded-lg border border-red-500/25 bg-card text-foreground shadow-2xl shadow-black/40 animate-in zoom-in-95 duration-150">
        <div className="border-b border-border/80 bg-red-500/5 px-6 py-5">
          <div className="flex items-start gap-4">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-red-500/25 bg-red-500/10 text-red-600 dark:text-red-400">
              <AlertTriangle className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <h3 className="text-lg font-semibold tracking-normal text-foreground">{title}</h3>
              <p className="mt-1 text-xs font-medium uppercase text-red-600 dark:text-red-400">
                {notice}
              </p>
            </div>
          </div>
        </div>

        <div className="space-y-5 px-6 py-5">
          <div className="rounded-lg border border-border/80 bg-muted/35 px-4 py-3 text-sm leading-6 text-muted-foreground">
            {description}
          </div>

          {confirmationText && (
            <div className="space-y-2">
              <label className="text-sm font-semibold text-foreground">
                {confirmationLabel || `Type ${confirmationText} to confirm`}
              </label>
              <Input
                value={typedConfirmation}
                onChange={(event) => setTypedConfirmation(event.target.value)}
                disabled={isPending}
                className="h-10 rounded-lg border-red-200 bg-card font-mono text-sm dark:border-red-900/70"
                autoFocus
              />
            </div>
          )}

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button
              variant="outline"
              onClick={onCancel}
              disabled={isPending}
              className="h-10 rounded-lg border-border bg-card px-4 text-foreground hover:bg-muted/60 cursor-pointer"
            >
              {cancelLabel}
            </Button>
            <Button
              onClick={onConfirm}
              disabled={isPending || !canConfirm}
              className="h-10 rounded-lg bg-red-600 px-4 font-semibold text-white hover:bg-red-700 disabled:opacity-60 cursor-pointer"
            >
              {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {confirmLabel}
            </Button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
