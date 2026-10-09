'use client';

import { use, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { formatDistanceToNow, format } from 'date-fns';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import {
  ArrowLeft,
  Phone,
  Mail,
  Building,
  FileText,
  User,
  Clock,
  CheckCircle,
  AlertCircle,
  Trash2,
} from 'lucide-react';
import { formatPhoneNumber } from '@/lib/utils';
import { customersApi } from '@/lib/api';
import { toast } from 'sonner';

const statusColors: Record<string, string> = {
  new: 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20',
  contacted: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20',
  quoted: 'bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20',
  pending: 'bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-500/20',
  closed: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20',
};

const actionIcons: Record<string, typeof CheckCircle> = {
  follow_up: User,
  demand_report: FileText,
  future_plan: AlertCircle,
  update: AlertCircle,
  contact: Phone,
};

export default function CustomerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const queryClient = useQueryClient();
  const [deleteConfirmText, setDeleteConfirmText] = useState('');

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['customer', id],
    queryFn: () => customersApi.get(id),
    refetchInterval: 5000,
    retry: false,
  });

  const isNotFound =
    error instanceof Error && /not found/i.test(error.message);

  // Deleted elsewhere (or never existed) → back to the list. Transient
  // failures (network/500) stay on an error card with Retry instead.
  useEffect(() => {
    if (isError && isNotFound) {
      router.replace('/customers');
    }
  }, [isError, isNotFound, router]);

  const deleteCustomer = useMutation({
    mutationFn: () => customersApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      queryClient.invalidateQueries({ queryKey: ['trash'] });
      toast.success('Customer moved to Trash');
      router.push('/customers');
    },
    onError: (err: Error) => {
      toast.error(err.message || 'Failed to delete customer');
    },
  });

  if (isLoading) {
    return (
      <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
        <Skeleton className="h-8 w-48 bg-muted" />
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <Card className="bg-card border-border">
            <CardHeader><Skeleton className="h-4 w-24 bg-muted" /></CardHeader>
            <CardContent><Skeleton className="h-24 w-full bg-muted" /></CardContent>
          </Card>
          <div className="lg:col-span-2 space-y-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <Card key={i} className="bg-card border-border">
                <CardContent className="pt-4"><Skeleton className="h-16 w-full bg-muted" /></CardContent>
              </Card>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (!data?.customer) {
    // Briefly shown while the redirect to /customers is in flight, or a
    // Retry card for transient load failures.
    if (isError && !isNotFound) {
      return (
        <div className="flex flex-col items-center justify-center gap-3 py-12 text-center">
          <p className="text-sm font-semibold text-red-600 dark:text-red-400">Couldn&apos;t load customer. Check your connection and try again.</p>
          <Button variant="outline" size="sm" onClick={() => void refetch()}>Retry</Button>
        </div>
      );
    }
    return (
      <div className="text-center text-muted-foreground py-12">Redirecting…</div>
    );
  }

  const { customer, timeline } = data;

  return (
    <div className="min-h-[calc(100vh-7rem)] space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex items-center gap-4">
        <Link href="/customers">
          <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-foreground">
            <ArrowLeft className="w-4 h-4 mr-1" />
            Back
          </Button>
        </Link>
        <div className="flex-1">
          <h1 className="text-3xl font-bold  text-foreground">{customer.name}</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Customer since {format(new Date(customer.createdAt), 'MMM d, yyyy')}
          </p>
        </div>
        <Badge variant="outline" className={statusColors[customer.status] || statusColors.new}>
          {customer.status}
        </Badge>
        <AlertDialog>
          <AlertDialogTrigger
            render={
              <Button
                variant="ghost"
                size="sm"
                className="text-muted-foreground hover:text-red-600 dark:hover:text-red-400 dark:text-red-600 hover:bg-red-500/10"
              >
                <Trash2 className="w-4 h-4 mr-1" />
                Delete
              </Button>
            }
          />
          <AlertDialogContent className="bg-card border-border text-foreground">
            <AlertDialogHeader>
              <AlertDialogTitle>Delete {customer.name}?</AlertDialogTitle>
              <AlertDialogDescription className="text-muted-foreground">
                This will move the customer to Trash. Related activity history stays linked, and admins can restore the customer later.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <div className="space-y-2">
              <label className="text-sm font-semibold text-foreground">Type confirm to move this customer to Trash</label>
              <Input
                value={deleteConfirmText}
                onChange={(event) => setDeleteConfirmText(event.target.value)}
                disabled={deleteCustomer.isPending}
                placeholder="confirm"
                className="h-10 font-mono"
              />
            </div>
            <AlertDialogFooter>
              <AlertDialogCancel
                className="border-border text-foreground"
                onClick={() => setDeleteConfirmText('')}
              >
                Cancel
              </AlertDialogCancel>
              <AlertDialogAction
                onClick={() => deleteCustomer.mutate()}
                disabled={deleteCustomer.isPending || deleteConfirmText.toLowerCase() !== 'confirm'}
                className="bg-red-600 hover:bg-red-700 text-white"
              >
                {deleteCustomer.isPending ? 'Deleting…' : 'Move to Trash'}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle className="text-base text-foreground">Customer Info</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {customer.phone && (
              <div className="flex items-center gap-3 text-sm text-foreground/85">
                <Phone className="w-4 h-4 text-muted-foreground" />
                <span>{formatPhoneNumber(customer.phone)}</span>
              </div>
            )}
            {customer.email && (
              <div className="flex items-center gap-3 text-sm text-foreground/85">
                <Mail className="w-4 h-4 text-muted-foreground" />
                <span>{customer.email}</span>
              </div>
            )}
            {customer.company && (
              <div className="flex items-center gap-3 text-sm text-foreground/85">
                <Building className="w-4 h-4 text-muted-foreground" />
                <span>{customer.company}</span>
              </div>
            )}
            {customer.notes && (
              <div className="pt-3 border-t border-border">
                <p className="text-xs text-muted-foreground">{customer.notes}</p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="bg-card border-border lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base text-foreground flex items-center gap-2">
              <Clock className="w-4 h-4 text-muted-foreground" />
              Timeline
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="relative">
              <div className="absolute left-4 top-0 bottom-0 w-px bg-muted" />
              <div className="space-y-4">
                {timeline.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground text-sm">
                    No activity yet. Telegram messages will appear here.
                  </div>
                ) : (
                  timeline.map((item) => {
                    const Icon = item.type === 'activity'
                      ? (actionIcons[item.action || 'update'] || User)
                      : FileText;

                    return (
                      <div key={item.id} className="relative pl-10">
                        <div className={`absolute left-2.5 top-1 w-3 h-3 rounded-full border-2 ${
                          item.type === 'activity'
                            ? 'bg-blue-500 border-blue-400'
                            : 'bg-purple-500 border-purple-400'
                        }`} />

                        <div className="bg-muted/50 rounded-lg p-4 border border-border">
                          <div className="flex items-start justify-between mb-2">
                            <div className="flex items-center gap-2">
                              <Icon className={`w-4 h-4 ${
                                item.type === 'activity' ? 'text-blue-600 dark:text-blue-400' : 'text-purple-600 dark:text-purple-400'
                              }`} />
                              <span className="text-sm font-medium text-foreground">
                                {item.type === 'activity'
                                  ? item.action?.replace('_', ' ').toUpperCase()
                                  : item.reportType?.replace('_', ' ').toUpperCase()
                                }
                              </span>
                            </div>
                            <span className="text-xs text-muted-foreground">
                              {formatDistanceToNow(new Date(item.createdAt), { addSuffix: true })}
                            </span>
                          </div>

                          {item.type === 'demand' && (
                            <div className="mb-2">
                              {item.customerName && (
                                <p className="text-sm text-blue-600 dark:text-blue-400 mb-1">
                                  Customer: {item.customerName}
                                </p>
                              )}
                              <Badge variant="outline" className={`text-xs ${statusColors[item.status || 'new'] || statusColors.new}`}>
                                {item.status}
                              </Badge>
                            </div>
                          )}

                          <p className="text-sm text-foreground/85 mb-2">
                            {item.type === 'activity' ? item.description : item.note}
                          </p>

                          {item.sender && (
                            <div className="flex items-center gap-1 text-xs text-muted-foreground">
                              <User className="w-3 h-3" />
                              {item.sender}
                              {item.senderId && (
                                <span className="text-muted-foreground">• {item.senderId}</span>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
