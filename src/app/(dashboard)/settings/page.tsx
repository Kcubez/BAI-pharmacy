'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Bot,
  Key,
  Save,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Eye,
  EyeOff,
  Copy,
  ExternalLink,
  Sparkles,
  Users,
  Shield,
  ShieldAlert,
  Edit2,
  Mail,
  Check,
  Trash2,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { useSettingsSenders, useUpdateSenderSettings, useCreateSenderSettings, useDeleteSenderSettings } from '@/hooks/use-senders';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import type { TelegramSender } from '@/lib/api';

type BotSettingsData = {
  botToken: string;
  geminiApiKey: string;
  geminiModel: string;
  isActive: boolean;
  updatedAt?: string;
};

function useBotSettings() {
  return useQuery({
    queryKey: ['bot-settings'],
    queryFn: async (): Promise<BotSettingsData> => {
      const res = await fetch('/api/settings/bot', { cache: "no-store" });
      if (!res.ok) throw new Error('Failed to fetch settings');
      const data = await res.json();
      return data.settings;
    },
  });
}

function useSaveBotSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: { botToken: string; geminiApiKey: string; activate?: boolean }) => {
      const res = await fetch('/api/settings/bot', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: 'Failed to save' }));
        throw new Error(err.message);
      }
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['bot-settings'] });
      if (data.webhookRegistered) {
        toast.success('Bot saved & webhook registered!', {
          description: `Webhook: ${data.webhookUrl}`,
          duration: 5000,
        });
      } else {
        toast.success('Bot settings saved successfully');
      }
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to save settings');
    },
  });
}

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState<'bot' | 'senders'>('bot');
  const { data: settings, isLoading: isSettingsLoading, isError: isSettingsError, refetch: refetchSettings } = useBotSettings();
  const saveMutation = useSaveBotSettings();

  const [botTokenDraft, setBotTokenDraft] = useState<string | null>(null);
  const [geminiApiKeyDraft, setGeminiApiKeyDraft] = useState<string | null>(null);
  const [showToken, setShowToken] = useState(false);
  const [showGeminiKey, setShowGeminiKey] = useState(false);
  const botToken = botTokenDraft ?? settings?.botToken ?? '';
  const geminiApiKey = geminiApiKeyDraft ?? settings?.geminiApiKey ?? '';
  const hasChanges = botTokenDraft !== null || geminiApiKeyDraft !== null;

  const handleSave = () => {
    saveMutation.mutate(
      { botToken, geminiApiKey },
      {
        onSuccess: () => {
          setBotTokenDraft(null);
          setGeminiApiKeyDraft(null);
        },
      }
    );
  };

  const activateWebhook = () => {
    saveMutation.mutate({ botToken, geminiApiKey, activate: true });
  };

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast.success(`${label} copied to clipboard`);
  };

  return (
    <div className="min-h-[calc(100vh-7rem)] space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* Header */}
      <div>
        <div className="flex items-center gap-3 mb-2">
          <h1 className="text-3xl font-bold text-foreground font-heading">Settings</h1>
          {settings?.isActive && activeTab === 'bot' && (
            <Badge className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20">
              <CheckCircle2 className="w-3 h-3 mr-1" />
              Bot Connected
            </Badge>
          )}
          {settings && !settings.isActive && !isSettingsLoading && activeTab === 'bot' && (
            <Badge className="bg-muted text-muted-foreground border-border">
              <AlertCircle className="w-3 h-3 mr-1" />
              Not Configured
            </Badge>
          )}
        </div>
        <p className="text-muted-foreground">
          {activeTab === 'bot'
            ? 'Configure Telegram intake and Gemini AI parsing settings'
            : 'Manage staff Telegram access, verification status, and department access levels'}
        </p>
      </div>

      {/* Tabs Selector */}
      <div className="flex border-b border-border/60">
        <button
          onClick={() => setActiveTab('bot')}
          className={`px-5 py-2.5 font-medium text-sm flex items-center gap-2 border-b-2 transition-all duration-200 ${
            activeTab === 'bot'
              ? 'border-blue-500 text-blue-600 dark:text-blue-400 font-semibold'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          <Bot className="w-4 h-4" />
          Bot Configuration
        </button>
        <button
          onClick={() => setActiveTab('senders')}
          className={`px-5 py-2.5 font-medium text-sm flex items-center gap-2 border-b-2 transition-all duration-200 ${
            activeTab === 'senders'
              ? 'border-blue-500 text-blue-600 dark:text-blue-400 font-semibold'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          <Users className="w-4 h-4" />
          Staff Bot Access
        </button>
      </div>

      {/* Tab Content */}
      {activeTab === 'bot' ? (
        <div className="space-y-6">
          {isSettingsError && (
            <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-border/70 bg-muted/50 p-8 text-center sm:flex-row">
              <p className="text-sm font-semibold text-red-600 dark:text-red-400">Couldn&apos;t load bot settings. Check your connection and try again.</p>
              <Button variant="outline" size="sm" onClick={() => void refetchSettings()}>Retry</Button>
            </div>
          )}
          {/* Bot Token Card */}
          <Card className="glass-card border-border/70 shadow-sm">
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-lg bg-blue-500/10">
                  <Bot className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                </div>
                <div>
                  <CardTitle className="text-foreground text-lg">Telegram Bot Token</CardTitle>
                  <CardDescription className="text-muted-foreground">
                    Get your bot token from{' '}
                    <a
                      href="https://t.me/BotFather"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 inline-flex items-center gap-1 font-medium"
                    >
                      @BotFather
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="text-sm font-medium text-foreground/85 mb-2 block">Bot Token</label>
                <div className="relative">
                  <Key className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                  {isSettingsLoading ? (
                    <div className="h-10 bg-muted rounded-md animate-pulse" />
                  ) : (
                    <Input
                      type={showToken ? 'text' : 'password'}
                      value={botToken}
                      onChange={(e) => {
                        setBotTokenDraft(e.target.value);
                      }}
                      placeholder="123456789:ABCdefGHIjklMNO..."
                      className="pl-9 pr-20 bg-card/50 border-border text-foreground placeholder:text-muted-foreground focus-visible:ring-ring font-mono text-sm"
                    />
                  )}
                  <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => setShowToken(!showToken)}
                      className="p-1.5 rounded-md text-slate-500 hover:text-foreground hover:bg-muted/50 transition-colors"
                    >
                      {showToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                    {botToken && (
                      <button
                        type="button"
                        onClick={() => copyToClipboard(botToken, 'Bot token')}
                        className="p-1.5 rounded-md text-slate-500 hover:text-foreground hover:bg-muted/50 transition-colors"
                      >
                        <Copy className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
                <p className="text-xs text-muted-foreground mt-1.5">
                  Your bot token is stored securely and never exposed in the frontend
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Gemini Card */}
          <Card className="glass-card border-border/70 shadow-sm">
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-lg bg-violet-500/10">
                  <Sparkles className="w-5 h-5 text-violet-600 dark:text-violet-400" />
                </div>
                <div>
                  <CardTitle className="text-foreground text-lg">Gemini AI Parser</CardTitle>
                  <CardDescription className="text-muted-foreground">
                    Used to extract demand-sheet records with {settings?.geminiModel || 'gemini-3.1-flash-lite-preview'}
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="text-sm font-medium text-foreground/85 mb-2 block">
                  Gemini API Key
                </label>
                <div className="relative">
                  <Key className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                  {isSettingsLoading ? (
                    <div className="h-10 bg-muted rounded-md animate-pulse" />
                  ) : (
                    <Input
                      type={showGeminiKey ? 'text' : 'password'}
                      value={geminiApiKey}
                      onChange={(e) => {
                        setGeminiApiKeyDraft(e.target.value);
                      }}
                      placeholder="AIza..."
                      className="pl-9 pr-20 bg-card/50 border-border text-foreground placeholder:text-muted-foreground focus-visible:ring-ring font-mono text-sm"
                    />
                  )}
                  <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => setShowGeminiKey(!showGeminiKey)}
                      className="p-1.5 rounded-md text-slate-500 hover:text-foreground hover:bg-muted/50 transition-colors"
                    >
                      {showGeminiKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                    {geminiApiKey && (
                      <button
                        type="button"
                        onClick={() => copyToClipboard(geminiApiKey, 'Gemini API key')}
                        className="p-1.5 rounded-md text-slate-500 hover:text-foreground hover:bg-muted/50 transition-colors"
                      >
                        <Copy className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
                <p className="text-xs text-muted-foreground mt-1.5">
                  Telegram reports use Gemini first; if the API fails, the app falls back to local parsing.
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Save Button */}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-2 pb-8">
            <div>
              {hasChanges && (
                <p className="text-sm text-amber-600 dark:text-amber-400 flex items-center gap-1.5 animate-in fade-in duration-200">
                  <AlertCircle className="w-3.5 h-3.5" />
                  You have unsaved changes
                </p>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {!settings?.isActive && Boolean(botToken) && (
                <Button variant="outline" onClick={activateWebhook} disabled={saveMutation.isPending}>
                  {saveMutation.isPending ? <Loader2 className="animate-spin" data-icon="inline-start" /> : <CheckCircle2 data-icon="inline-start" />}
                  Verify & activate webhook
                </Button>
              )}
              <Button
                onClick={handleSave}
                disabled={!hasChanges || saveMutation.isPending}
                className="bg-blue-600 hover:bg-blue-500 text-white shadow-sm px-6 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {saveMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
                Save Settings
              </Button>
            </div>
          </div>
        </div>
      ) : (
        <TelegramSendersList />
      )}
    </div>
  );
}

function TelegramSendersList() {
  const { data: senders, isLoading, error } = useSettingsSenders();
  const updateSender = useUpdateSenderSettings();
  const createSender = useCreateSenderSettings();
  const deleteSender = useDeleteSenderSettings();
  const [isCreateOpen, setIsCreateOpen] = useState<boolean>(false);
  const [createEmail, setCreateEmail] = useState<string>('');
  const [createAllowedDeps, setCreateAllowedDeps] = useState<string[]>([]);
  const [deletingSender, setDeletingSender] = useState<TelegramSender | null>(null);

  const handleCreateSender = () => {
    if (!createEmail) {
      toast.error('Email is required');
      return;
    }
    if (createAllowedDeps.length === 0) {
      toast.error('Please select at least one department');
      return;
    }
    createSender.mutate(
      { email: createEmail, allowedDepartments: createAllowedDeps },
      {
        onSuccess: () => {
          setIsCreateOpen(false);
          setCreateEmail('');
          setCreateAllowedDeps([]);
        },
      }
    );
  };
  const [editingSender, setEditingSender] = useState<TelegramSender | null>(null);
  const [isAuthorizedDraft, setIsAuthorizedDraft] = useState<boolean>(false);
  const [allowedDepsDraft, setAllowedDepsDraft] = useState<string[]>([]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-400 rounded-lg text-sm flex items-center gap-2">
        <AlertCircle className="w-4 h-4" />
        Failed to load Telegram senders: {error.message}
      </div>
    );
  }

  const openEditModal = (sender: TelegramSender) => {
    setEditingSender(sender);
    setIsAuthorizedDraft(sender.isAuthorized ?? false);
    setAllowedDepsDraft(sender.allowedDepartments ?? []);
  };

  const handleToggleDepartment = (dep: string) => {
    setAllowedDepsDraft((prev) =>
      prev.includes(dep) ? prev.filter((d) => d !== dep) : [...prev, dep]
    );
  };

  const handleSavePermissions = () => {
    if (!editingSender) return;

    updateSender.mutate(
      {
        id: editingSender.id,
        data: {
          isAuthorized: isAuthorizedDraft,
          allowedDepartments: allowedDepsDraft,
        },
      },
      {
        onSuccess: () => {
          setEditingSender(null);
        },
      }
    );
  };

  const DEPARTMENTS = [
    { key: 'Pharmacy', label: 'Pharmacy Operations', desc: 'Allows importing pharmacy workbooks through Telegram' },
    { key: 'QA', label: 'Pharmacy Q&A', desc: 'Allows asking Gemini about pharmacy sales, stock, AR, payables, and expiry' },
  ];

  return (
    <div className="space-y-6">
      <Card className="glass-card border-border/70 shadow-sm overflow-hidden">
        <CardHeader className="pb-3 border-b border-border/40 bg-muted/20 flex flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle className="text-foreground text-lg flex items-center gap-2">
              <Shield className="w-5 h-5 text-blue-600 dark:text-blue-400" />
              Staff Access Controls
            </CardTitle>
            <CardDescription className="text-muted-foreground mt-1">
              Approve verified staff accounts and authorize their data feeding capabilities by department.
            </CardDescription>
          </div>
          <Button
            onClick={() => setIsCreateOpen(true)}
            size="sm"
            className="bg-blue-600 hover:bg-blue-700 text-white font-medium flex items-center gap-1.5"
          >
            <Users className="w-4 h-4" />
            Pre-register Staff Email
          </Button>
        </CardHeader>
        <CardContent className="p-0">
          {!senders || senders.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center px-4">
              <div className="w-12 h-12 rounded-lg bg-muted/60 flex items-center justify-center mb-3">
                <Users className="w-6 h-6 text-slate-500" />
              </div>
              <h3 className="text-sm font-semibold text-foreground/80 mb-1">No staff bot linkings yet</h3>
              <p className="text-xs text-muted-foreground max-w-xs">
                When staff link their Telegram account and verify their email, they will appear here.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader className="bg-muted/30">
                  <TableRow className="hover:bg-transparent border-b border-border/40">
                    <TableHead className="w-[200px]">Telegram User</TableHead>
                    <TableHead>Verified Email</TableHead>
                    <TableHead>Authorization</TableHead>
                    <TableHead>Allowed Departments</TableHead>
                    <TableHead className="w-[80px] text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {senders.map((sender) => (
                    <TableRow key={sender.id} className="hover:bg-muted/10 border-b border-border/40">
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-3">
                          <Avatar className="h-8 w-8 border border-border">
                            <AvatarFallback className="text-xs font-semibold bg-slate-500/10 text-slate-500">
                              {sender.telegramUserId ? (sender.displayName?.[0]?.toUpperCase() ?? 'U') : '?'}
                            </AvatarFallback>
                          </Avatar>
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-foreground truncate">
                              {sender.telegramUserId ? sender.displayName : 'Awaiting Bot Link'}
                            </p>
                            {sender.telegramUserId && sender.username ? (
                              <p className="text-xs text-muted-foreground truncate">
                                @{sender.username}
                              </p>
                            ) : !sender.telegramUserId && (
                              <p className="text-xs text-muted-foreground truncate italic">
                                Not linked to Telegram
                              </p>
                            )}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        {sender.email ? (
                          <div className="flex flex-col gap-1">
                            <div className="flex items-center gap-1.5 text-sm text-foreground/85">
                              <Mail className="w-3.5 h-3.5 text-slate-500" />
                              <span>{sender.email}</span>
                            </div>
                            {!sender.isVerified && (
                              <span className="text-[10px] text-amber-500 font-medium italic">
                                Awaiting link/verification
                              </span>
                            )}
                          </div>
                        ) : (
                          <Badge variant="outline" className="bg-slate-500/5 text-slate-500 border-slate-500/10 text-xs">
                            No Email
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        {sender.isAuthorized ? (
                          <Badge className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20 text-xs">
                            Authorized
                          </Badge>
                        ) : (
                          <Badge variant="secondary" className="bg-rose-500/5 text-rose-500 dark:text-rose-400 border-rose-500/10 text-xs">
                            Blocked
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {sender.allowedDepartments && sender.allowedDepartments.length > 0 ? (
                            sender.allowedDepartments.map((d) => (
                              <Badge
                                key={d}
                                variant="secondary"
                                className="bg-blue-500/5 text-blue-600 dark:text-blue-400 border-blue-500/10 text-[10px]"
                              >
                                {d === 'Sales' && 'Sales & Marketing'}
                                {d === 'IT' && 'IT & Projects'}
                                {d === 'Finance' && 'Finance & Operations'}
                                {d === 'QA' && 'QA / Support'}
                              </Badge>
                            ))
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => openEditModal(sender)}
                            className="h-8 w-8 hover:bg-muted/70 cursor-pointer"
                          >
                            <Edit2 className="w-3.5 h-3.5 text-muted-foreground hover:text-foreground" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setDeletingSender(sender)}
                            className="h-8 w-8 hover:bg-rose-500/10 hover:text-rose-600 cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5 text-muted-foreground hover:text-rose-600" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Permissions Dialog */}
      <Dialog open={editingSender !== null} onOpenChange={(open) => !open && setEditingSender(null)}>
        <DialogContent className="max-w-md bg-card border-border text-foreground">
          <DialogHeader>
            <DialogTitle className="text-lg">Edit Permissions</DialogTitle>
            <DialogDescription className="text-muted-foreground">
              Modify bot authorization and allowed departments for{' '}
              <span className="font-semibold text-foreground">{editingSender?.displayName}</span>.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-5 pt-3">
            {/* Verification Status Banner */}
            {editingSender && !editingSender.isVerified && (
              <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg text-xs text-amber-600 dark:text-amber-400 flex items-start gap-2">
                <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" />
                <div>
                  <span className="font-semibold">Note:</span> This sender has not verified their email via OTP yet. You can still pre-approve their access, but they must complete verification to feed data.
                </div>
              </div>
            )}

            {/* Is Authorized Toggle */}
            <div className="flex items-center justify-between p-3 bg-muted/20 border border-border/50 rounded-lg">
              <div>
                <label className="text-sm font-semibold text-foreground block">Authorize Bot Access</label>
                <span className="text-xs text-muted-foreground">
                  Toggle whether this sender is permitted to interact with the bot
                </span>
              </div>
              <input
                type="checkbox"
                checked={isAuthorizedDraft}
                onChange={(e) => setIsAuthorizedDraft(e.target.checked)}
                className="w-9 h-5 rounded-full bg-slate-300 dark:bg-slate-700 checked:bg-blue-600 appearance-none cursor-pointer relative after:content-[''] after:absolute after:h-4 after:w-4 after:left-0.5 after:top-0.5 after:bg-white after:rounded-full after:transition-all checked:after:translate-x-4 transition-colors"
              />
            </div>

            {/* Department Access List */}
            <div className="space-y-2">
              <label className="text-sm font-semibold text-foreground block">
                Allowed Departments
              </label>
              <div className="space-y-2">
                {DEPARTMENTS.map((dep) => {
                  const isChecked = allowedDepsDraft.includes(dep.key);
                  return (
                    <div
                      key={dep.key}
                      onClick={() => handleToggleDepartment(dep.key)}
                      className={`p-3 border rounded-lg flex items-center justify-between cursor-pointer transition-all duration-200 ${
                        isChecked
                          ? 'border-blue-500 bg-blue-500/5'
                          : 'border-border/60 hover:bg-muted/20'
                      }`}
                    >
                      <div className="pr-4">
                        <p className={`text-sm font-medium ${isChecked ? 'text-blue-600 dark:text-blue-400' : 'text-foreground/90'}`}>
                          {dep.label}
                        </p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {dep.desc}
                        </p>
                      </div>
                      <div
                        className={`w-5 h-5 rounded border flex items-center justify-center transition-all ${
                          isChecked
                            ? 'border-blue-500 bg-blue-500 text-white'
                            : 'border-slate-400 dark:border-slate-600'
                        }`}
                      >
                        {isChecked && <Check className="w-3.5 h-3.5" />}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 pt-4 border-t border-border/50">
            <Button
              variant="outline"
              onClick={() => setEditingSender(null)}
              className="border-border hover:bg-muted"
            >
              Cancel
            </Button>
            <Button
              onClick={handleSavePermissions}
              disabled={updateSender.isPending}
              className="bg-blue-600 hover:bg-blue-500 text-white"
            >
              {updateSender.isPending ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Check className="w-4 h-4 mr-2" />
              )}
              Save Permissions
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Pre-register Staff Email Dialog */}
      <Dialog open={isCreateOpen} onOpenChange={(open) => !open && setIsCreateOpen(false)}>
        <DialogContent className="max-w-md bg-card border-border text-foreground">
          <DialogHeader>
            <DialogTitle className="text-lg">Pre-register Staff Bot Access</DialogTitle>
            <DialogDescription className="text-muted-foreground">
              Add a staff email and pre-configure their department access. They will be authorized immediately after linking their Telegram account.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-5 pt-3">
            {/* Email Input */}
            <div className="space-y-2">
              <label className="text-sm font-semibold text-foreground block">
                Staff Email Address
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                <Input
                  type="email"
                  placeholder="staff@company.com"
                  value={createEmail}
                  onChange={(e) => setCreateEmail(e.target.value)}
                  className="pl-10 bg-background border-border text-foreground"
                />
              </div>
            </div>

            {/* Department Access List */}
            <div className="space-y-2">
              <label className="text-sm font-semibold text-foreground block">
                Allowed Departments
              </label>
              <div className="space-y-2">
                {DEPARTMENTS.map((dep) => {
                  const isChecked = createAllowedDeps.includes(dep.key);
                  return (
                    <div
                      key={dep.key}
                      onClick={() => {
                        setCreateAllowedDeps((prev) =>
                          prev.includes(dep.key) ? prev.filter((d) => d !== dep.key) : [...prev, dep.key]
                        );
                      }}
                      className={`p-3 border rounded-lg flex items-center justify-between cursor-pointer transition-all duration-200 ${
                        isChecked
                          ? 'border-blue-500 bg-blue-500/5'
                          : 'border-border/60 hover:bg-muted/20'
                      }`}
                    >
                      <div className="pr-4">
                        <p className={`text-sm font-medium ${isChecked ? 'text-blue-600 dark:text-blue-400' : 'text-foreground/90'}`}>
                          {dep.label}
                        </p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {dep.desc}
                        </p>
                      </div>
                      <div
                        className={`w-5 h-5 rounded border flex items-center justify-center transition-all ${
                          isChecked
                            ? 'border-blue-500 bg-blue-500 text-white'
                            : 'border-slate-400 dark:border-slate-600'
                        }`}
                      >
                        {isChecked && <Check className="w-3.5 h-3.5" />}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 pt-4 border-t border-border/50">
            <Button
              variant="outline"
              onClick={() => setIsCreateOpen(false)}
              className="border-border hover:bg-muted"
            >
              Cancel
            </Button>
            <Button
              onClick={handleCreateSender}
              disabled={createSender.isPending}
              className="bg-blue-600 hover:bg-blue-500 text-white"
            >
              {createSender.isPending ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Check className="w-4 h-4 mr-2" />
              )}
              Pre-register Staff
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deletingSender !== null} onOpenChange={(open) => !open && setDeletingSender(null)}>
        <DialogContent className="max-w-md bg-card border-border text-foreground">
          <DialogHeader>
            <DialogTitle className="text-lg flex items-center gap-2 text-rose-600 dark:text-rose-400">
              <ShieldAlert className="w-5 h-5" />
              Remove Staff Bot Access?
            </DialogTitle>
            <DialogDescription className="text-muted-foreground mt-1">
              Are you sure you want to remove bot access for{' '}
              <span className="font-semibold text-foreground">{deletingSender?.email || deletingSender?.displayName}</span>?
              This action will revoke all permissions and unlink their Telegram bot session.
            </DialogDescription>
          </DialogHeader>

          <div className="flex items-center justify-end gap-2 pt-4 border-t border-border/50">
            <Button
              variant="outline"
              onClick={() => setDeletingSender(null)}
              className="border-border hover:bg-muted"
            >
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (deletingSender) {
                  deleteSender.mutate(deletingSender.id, {
                    onSuccess: () => setDeletingSender(null),
                  });
                }
              }}
              disabled={deleteSender.isPending}
              className="bg-rose-600 hover:bg-rose-700 text-white font-medium flex items-center gap-1.5"
            >
              {deleteSender.isPending ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Trash2 className="w-4 h-4 mr-2" />
              )}
              Remove Access
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
