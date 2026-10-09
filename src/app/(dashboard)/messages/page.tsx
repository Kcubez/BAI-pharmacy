'use client';

import { useState, useEffect, useCallback } from 'react';
import { useMessages, useMessageStats, useDeleteMessage } from '@/hooks/use-messages';
import { useSenders } from '@/hooks/use-senders';
import { formatDistanceToNow } from 'date-fns';
import {
  MessageSquare,
  CalendarDays,
  Users,
  TrendingUp,
  Search,
  Trash2,
  Inbox,
  Radio,
  ClipboardList,
  PhoneCall,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import type { TelegramSender } from '@/lib/api';

export default function MessagesPage() {
  const [limit, setLimit] = useState(10);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [selectedSenderId, setSelectedSenderId] = useState<string | undefined>(undefined);

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
      setLimit(10); // Reset limit to 10 on search
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  const { data: messagesData, isLoading: messagesLoading, isError: messagesError, refetch: refetchMessages } = useMessages({
    page: 1, // Always load page 1, expanding the list in-place via limit
    limit,
    search: debouncedSearch || undefined,
    senderId: selectedSenderId,
  });

  const { data: stats, isLoading: statsLoading } = useMessageStats();
  const { data: senders, isLoading: sendersLoading } = useSenders();
  const deleteMessage = useDeleteMessage();

  const handleSenderFilter = useCallback((senderId: string | undefined) => {
    setSelectedSenderId(senderId);
    setLimit(10);
  }, []);

  const statCards = [
    {
      title: 'Total Feed Items',
      value: stats?.totalMessages ?? 0,
      icon: MessageSquare,
      color: 'text-blue-600 dark:text-blue-400',
      bg: 'bg-blue-500/10',
      border: 'border-blue-500/20',
    },
    {
      title: "Today's Feed",
      value: stats?.todayMessages ?? 0,
      icon: CalendarDays,
      color: 'text-emerald-600 dark:text-emerald-400',
      bg: 'bg-emerald-500/10',
      border: 'border-emerald-500/20',
    },
    {
      title: 'Business Reports',
      value: stats?.businessReports ?? 0,
      icon: ClipboardList,
      color: 'text-cyan-600 dark:text-cyan-400',
      bg: 'bg-cyan-500/10',
      border: 'border-cyan-500/20',
    },
    {
      title: 'Future Plans',
      value: stats?.futurePlans ?? 0,
      icon: PhoneCall,
      color: 'text-purple-600 dark:text-purple-400',
      bg: 'bg-purple-500/10',
      border: 'border-purple-500/20',
    },
    {
      title: 'Total Senders',
      value: stats?.totalSenders ?? 0,
      icon: Users,
      color: 'text-rose-600 dark:text-rose-400',
      bg: 'bg-rose-500/10',
      border: 'border-rose-500/20',
    },
    {
      title: 'This Week',
      value: stats?.weekMessages ?? 0,
      icon: TrendingUp,
      color: 'text-amber-600 dark:text-amber-400',
      bg: 'bg-amber-500/10',
      border: 'border-amber-500/20',
    },
  ];

  return (
    <div className="min-h-[calc(100vh-7rem)] space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <h1 className="text-3xl font-bold  text-foreground font-heading">
              Data Feed
            </h1>
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20">
              <Radio className="w-3 h-3 text-emerald-600 dark:text-emerald-400 animate-pulse" />
              <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400">Live</span>
            </div>
          </div>
          <p className="text-muted-foreground">
            Real-time structured intake from your Telegram bot
          </p>
        </div>
        <div className="relative w-full sm:w-80">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <Input
            placeholder="Search feed items..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 bg-card/50 border-border text-foreground placeholder:text-muted-foreground focus-visible:ring-ring"
          />
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        {statCards.map((stat, i) => (
          <Card
            key={i}
            className={`glass-card glass-card-hover border-border/70 shadow-sm ${stat.border} transition-all duration-300`}
          >
            <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
              <CardTitle className="text-xs font-semibold uppercase  text-muted-foreground font-heading">
                {stat.title}
              </CardTitle>
              <div className={`p-2 rounded-lg ${stat.bg}`}>
                <stat.icon className={`h-4 w-4 ${stat.color}`} />
              </div>
            </CardHeader>
            <CardContent>
              {statsLoading ? (
                <Skeleton className="h-8 w-20 bg-muted" />
              ) : (
                <div className="text-3xl font-bold text-foreground">
                  {stat.value.toLocaleString()}
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Main Content: Senders + Messages */}
      <div className="flex flex-col lg:flex-row gap-6">
        {/* Senders Sidebar */}
        <div className="w-full lg:w-72 shrink-0">
          <div className="glass-card border-border/70 rounded-lg p-3 space-y-1 lg:sticky lg:top-6">
            <h3 className="text-xs font-semibold text-slate-500 uppercase  px-3 py-2">
              Senders
            </h3>

            {/* All Messages button */}
            <button
              onClick={() => handleSenderFilter(undefined)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200 text-left ${
                !selectedSenderId
                  ? 'bg-blue-500/10 text-blue-600 dark:text-blue-400 font-medium'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
              }`}
            >
              <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                !selectedSenderId ? 'bg-blue-500/20' : 'bg-muted'
              }`}>
                <Inbox className="w-4 h-4" />
              </div>
              <span className="text-sm">All Messages</span>
              {messagesData && !selectedSenderId && (
                <Badge variant="secondary" className="ml-auto bg-muted text-foreground text-xs">
                  {messagesData.total}
                </Badge>
              )}
            </button>

            {/* Senders List */}
            {sendersLoading ? (
              Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3 px-3 py-2.5">
                  <Skeleton className="w-8 h-8 rounded-full bg-muted" />
                  <div className="flex-1">
                    <Skeleton className="h-4 w-24 bg-muted mb-1" />
                    <Skeleton className="h-3 w-16 bg-muted" />
                  </div>
                </div>
              ))
            ) : senders && senders.length > 0 ? (
              senders.map((sender: TelegramSender) => (
                <SenderItem
                  key={sender.id}
                  sender={sender}
                  isSelected={selectedSenderId === sender.id}
                  onClick={() => handleSenderFilter(
                    selectedSenderId === sender.id ? undefined : sender.id
                  )}
                />
              ))
            ) : (
              <p className="text-xs text-muted-foreground px-3 py-4 text-center">
                No senders yet
              </p>
            )}
          </div>
        </div>

        {/* Messages Feed */}
        <div className="flex-1 min-w-0">
          <div className="space-y-3">
            {messagesLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <MessageSkeleton key={i} />
              ))
            ) : messagesError ? (
              <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-border/70 bg-muted/50 p-10 text-center">
                <p className="text-sm font-semibold text-red-600 dark:text-red-400">Couldn&apos;t load messages. Check your connection and try again.</p>
                <Button variant="outline" size="sm" onClick={() => void refetchMessages()}>Retry</Button>
              </div>
            ) : messagesData && messagesData.messages.length > 0 ? (
              messagesData.messages.map((message) => (
                <div
                  key={message.id}
                  className="group bg-muted/50 border border-border/70 rounded-lg p-4 hover:bg-muted/60 hover:border-border/50 transition-all duration-200"
                >
                  <div className="flex items-start gap-3">
                    {/* Sender Avatar */}
                    <Avatar className="h-10 w-10 border border-border bg-muted shrink-0">
                      <AvatarFallback className="bg-blue-500/20 text-blue-600 dark:text-blue-400 text-sm font-medium">
                        {message.sender?.displayName?.[0]?.toUpperCase() ?? 'T'}
                      </AvatarFallback>
                    </Avatar>

                    {/* Message Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-medium text-foreground/85 text-sm">
                          {message.sender?.displayName ?? 'Unknown'}
                        </span>
                        {message.sender?.username && (
                          <span className="text-xs text-muted-foreground">
                            @{message.sender.username}
                          </span>
                        )}
                        <span className="text-xs text-muted-foreground ml-auto shrink-0">
                          {formatDistanceToNow(new Date(message.receivedAt), {
                            addSuffix: true,
                          })}
                        </span>
                      </div>

                      <p className="text-foreground text-sm leading-relaxed line-clamp-2 break-words">
                        {message.text}
                      </p>

                      <div className="flex items-center justify-between mt-3 pt-2 border-t border-border/60">
                        {message.chatTitle ? (
                          <span className="text-xs text-muted-foreground flex items-center gap-1">
                            <span>💬</span>
                            <span className="truncate max-w-[150px] sm:max-w-[200px]">{message.chatTitle}</span>
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground">Direct Message</span>
                        )}

                        <Dialog>
                          <DialogTrigger
                            render={
                              <button
                                type="button"
                                className="text-xs font-semibold text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 dark:text-blue-700 hover:bg-blue-500/10 h-7 px-3 rounded-lg transition-all cursor-pointer"
                              >
                                Details
                              </button>
                            }
                          />
                          <DialogContent className="bg-card border border-border text-foreground rounded-lg p-6 sm:max-w-md max-h-[85vh] overflow-y-auto">
                            <DialogHeader className="mb-4">
                              <DialogTitle className="text-foreground text-lg font-bold">Message Details</DialogTitle>
                              <DialogDescription className="text-slate-500 text-xs">
                                Full transcript from Telegram bot
                              </DialogDescription>
                            </DialogHeader>
                            <div className="space-y-4">
                              <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50 border border-border">
                                <Avatar className="h-10 w-10 border border-border bg-muted shrink-0">
                                  <AvatarFallback className="bg-blue-500/20 text-blue-600 dark:text-blue-400 text-sm font-medium">
                                    {message.sender?.displayName?.[0]?.toUpperCase() ?? 'T'}
                                  </AvatarFallback>
                                </Avatar>
                                <div className="min-w-0">
                                  <p className="font-medium text-foreground/85 text-sm truncate">
                                    {message.sender?.displayName ?? 'Unknown'}
                                  </p>
                                  {message.sender?.username && (
                                    <p className="text-xs text-muted-foreground truncate">
                                      @{message.sender.username}
                                    </p>
                                  )}
                                </div>
                              </div>

                              <div className="space-y-1.5 bg-muted/30 p-3 rounded-lg border border-border/70 text-xs text-muted-foreground">
                                <div className="flex justify-between">
                                  <span>Message ID:</span>
                                  <span className="font-mono text-foreground">{message.telegramMsgId}</span>
                                </div>
                                <div className="flex justify-between">
                                  <span>Chat Room:</span>
                                  <span className="text-foreground">{message.chatTitle || 'Direct Message'}</span>
                                </div>
                                <div className="flex justify-between">
                                  <span>Received At:</span>
                                  <span className="text-foreground">{new Date(message.receivedAt).toLocaleString()}</span>
                                </div>
                              </div>

                              <div className="space-y-2">
                                <label className="text-xs font-semibold uppercase  text-slate-500">Message Text</label>
                                <div className="p-4 rounded-lg bg-card border border-border text-foreground text-sm leading-relaxed whitespace-pre-wrap break-words max-h-60 overflow-y-auto font-sans">
                                  {message.text}
                                </div>
                              </div>
                            </div>
                          </DialogContent>
                        </Dialog>
                      </div>
                    </div>

                    {/* Delete button with custom AlertDialog */}
                    <AlertDialog>
                      <AlertDialogTrigger
                        render={
                          <button
                            type="button"
                            className="opacity-0 group-hover:opacity-100 transition-opacity p-2 rounded-lg hover:bg-red-500/10 text-slate-500 hover:text-red-600 dark:hover:text-red-400 dark:text-red-600 focus:opacity-100 focus:outline-none focus:ring-2 focus:ring-red-500/30 transition-colors"
                            title="Delete message"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        }
                      />
                      <AlertDialogContent className="bg-card border-border text-foreground">
                        <AlertDialogHeader>
                          <AlertDialogTitle>Message ဖျက်မည်လား?</AlertDialogTitle>
                          <AlertDialogDescription className="text-muted-foreground text-sm space-y-2">
                              <span className="block">ဤ message ကို ဖျက်လိုက်ပါက အောက်ပါ data တွေ အားလုံး တပြိုင်နက် ဖျက်သွားမည်:</span>
                              <ul className="list-disc list-inside space-y-1 text-xs pl-1">
                                <li>Telegram message မှတ်တမ်း</li>
                                <li>ဤ message မှ ထုတ်ယူထားသော Demand Records</li>
                                <li>ဤ message မှ ထုတ်ယူထားသော Business Reports</li>
                                <li>Pending import (confirm မလုပ်ရသေးသော) တွေ</li>
                                <li>File မှ extract လုပ်ထားသော QA Documents</li>
                              </ul>
                              <span className="block font-medium text-red-600 dark:text-red-400 text-xs pt-1">
                                ဒီလုပ်ဆောင်ချက်ကို ပြန်မဖြည့်နိုင်ပါ။
                              </span>
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel className="border-border text-foreground">မဖျက်ဘူး</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={() => deleteMessage.mutate(message.id)}
                            className="bg-red-600 hover:bg-red-700 text-white"
                          >
                            ဖျက်မည်
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </div>
              ))
            ) : (
              <EmptyState search={debouncedSearch} selectedSenderId={selectedSenderId} />
            )}
          </div>

          {/* See More Button */}
          {messagesData && (
            <div className="flex flex-col items-center justify-center gap-3 mt-8">
              {messagesData.total > limit && (
                <Button
                  variant="outline"
                  onClick={() => setLimit((prev) => prev + 10)}
                  className="bg-blue-600/10 hover:bg-blue-600/20 text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 dark:text-blue-700 border-blue-500/20 rounded-lg px-8 py-2 font-medium transition-all cursor-pointer"
                >
                  See More
                </Button>
              )}
              <span className="text-xs text-muted-foreground">
                Showing {Math.min(limit, messagesData.total)} of {messagesData.total} messages
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Sub Components ─────────────────────────────────────────────────────────

function SenderItem({
  sender,
  isSelected,
  onClick,
}: {
  sender: TelegramSender;
  isSelected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200 text-left ${
        isSelected
          ? 'bg-blue-500/10 text-blue-600 dark:text-blue-400'
          : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
      }`}
    >
      <Avatar className="h-8 w-8 border border-border">
        <AvatarFallback
          className={`text-xs font-medium ${
            isSelected
              ? 'bg-blue-500/20 text-blue-600 dark:text-blue-400'
              : 'bg-muted text-muted-foreground'
          }`}
        >
          {sender.displayName?.[0]?.toUpperCase() ?? 'U'}
        </AvatarFallback>
      </Avatar>
      <div className="flex-1 min-w-0">
        <p className={`text-sm truncate ${isSelected ? 'font-medium' : ''}`}>
          {sender.displayName || 'Awaiting Bot Link'}
        </p>
        {sender.username && (
          <p className="text-xs text-muted-foreground truncate">@{sender.username}</p>
        )}
      </div>
      <Badge
        variant="secondary"
        className={`text-xs shrink-0 ${
          isSelected
            ? 'bg-blue-500/20 text-blue-600 dark:text-blue-400'
            : 'bg-muted text-slate-500'
        }`}
      >
        {sender.messageCount}
      </Badge>
    </button>
  );
}

function MessageSkeleton() {
  return (
    <div className="glass-card border-border/70 rounded-lg p-4">
      <div className="flex items-start gap-3">
        <Skeleton className="w-10 h-10 rounded-full bg-muted" />
        <div className="flex-1 space-y-2">
          <div className="flex items-center gap-2">
            <Skeleton className="h-4 w-28 bg-muted" />
            <Skeleton className="h-3 w-16 bg-muted" />
          </div>
          <Skeleton className="h-4 w-full bg-muted" />
          <Skeleton className="h-4 w-2/3 bg-muted" />
        </div>
      </div>
    </div>
  );
}

function EmptyState({
  search,
  selectedSenderId,
}: {
  search: string;
  selectedSenderId: string | undefined;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div className="w-16 h-16 rounded-lg bg-muted/50 flex items-center justify-center mb-4">
        <MessageSquare className="w-8 h-8 text-slate-600" />
      </div>
      {search ? (
        <>
          <h3 className="text-lg font-medium text-foreground/85 mb-1">
            No results found
          </h3>
          <p className="text-sm text-muted-foreground max-w-sm">
            No messages matching &quot;{search}&quot;. Try a different search term.
          </p>
        </>
      ) : selectedSenderId ? (
        <>
          <h3 className="text-lg font-medium text-foreground/85 mb-1">
            No messages from this sender
          </h3>
          <p className="text-sm text-muted-foreground max-w-sm">
            This sender hasn&apos;t sent any messages yet, or all messages have been deleted.
          </p>
        </>
      ) : (
        <>
          <h3 className="text-lg font-medium text-foreground/85 mb-1">
            No messages yet
          </h3>
          <p className="text-sm text-muted-foreground max-w-sm">
            Set up your Telegram bot webhook to start receiving data from your business owners.
          </p>
        </>
      )}
    </div>
  );
}
