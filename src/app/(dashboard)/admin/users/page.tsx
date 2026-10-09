'use client';

import {
  useUsers,
  useDeleteUser,
  useBanUser,
  useUnbanUser,
  useCreateUser,
} from '@/hooks/use-users';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  createUserSchema,
  updateUserSchema,
  type CreateUserFormValues,
  type UpdateUserFormValues,
} from '@/lib/validations';
import { format } from 'date-fns';
import { useQueryClient } from '@tanstack/react-query';
import { userKeys } from '@/hooks/use-users';
import {
  Shield,
  MoreVertical,
  Plus,
  Search,
  Trash2,
  Ban,
  Unlock,
  Edit,
  Loader2,
  Users,
  Eye,
  EyeOff,
  Bot,
  MessageSquare,
  UserCheck,
  Building2,
  Database,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';
import { AdminUser } from '@/lib/api';
import { DestructiveConfirmDialog } from '@/components/ui/destructive-confirm-dialog';

export default function AdminUsersPage() {
  const { data: users, isLoading, isError, refetch } = useUsers();
  const [searchTerm, setSearchTerm] = useState('');
  const deleteUser = useDeleteUser();
  const banUser = useBanUser();
  const unbanUser = useUnbanUser();
  const createUser = useCreateUser();
  const queryClient = useQueryClient();

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<AdminUser | null>(null);
  const [showCreatePassword, setShowCreatePassword] = useState(false);
  const [userPendingDeletion, setUserPendingDeletion] = useState<AdminUser | null>(null);

  const createForm = useForm<CreateUserFormValues>({
    resolver: zodResolver(createUserSchema),
    mode: 'onChange',
    defaultValues: { name: '', email: '', password: '', role: 'user' },
  });

  const editForm = useForm<UpdateUserFormValues>({
    resolver: zodResolver(updateUserSchema),
    defaultValues: { name: '', email: '', role: 'user' },
  });

  const onCreateSubmit = async (values: CreateUserFormValues) => {
    await createUser.mutateAsync(values);
    setIsCreateOpen(false);
    createForm.reset();
  };

  const openEditModal = (user: AdminUser) => {
    setEditingUser(user);
    editForm.reset({
      name: user.name,
      email: user.email,
      role: user.role as 'user' | 'admin',
    });
    setIsEditOpen(true);
  };

  const handleUpdate = async (values: UpdateUserFormValues) => {
    if (!editingUser) return;
    try {
      toast.promise(
        fetch(`/api/admin/users/${editingUser.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(values),
        }).then(res => {
          if (!res.ok) throw new Error('Failed to update');
          return res.json();
        }),
        {
          loading: 'Updating user...',
          success: () => {
            setIsEditOpen(false);
            setEditingUser(null);
            queryClient.invalidateQueries({ queryKey: userKeys.lists() });
            return 'User updated successfully';
          },
          error: 'Failed to update user',
        }
      );
    } catch (e) {
      console.error(e);
    }
  };

  const handleDeleteConfirm = async () => {
    if (!userPendingDeletion) return;

    try {
      await deleteUser.mutateAsync(userPendingDeletion.id);
      setUserPendingDeletion(null);
    } catch {
      // The mutation hook shows a toast; keep the dialog open so the admin can retry.
    }
  };

  const filteredUsers =
    users?.filter(
      u =>
        u.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        u.email.toLowerCase().includes(searchTerm.toLowerCase())
    ) ?? [];

  const totalOwners = users?.filter(u => u.role !== 'admin').length ?? 0;
  const connectedBots = users?.filter(u => u.businessOwner?.botConnected).length ?? 0;
  const totalStaff = users?.reduce((sum, u) => sum + (u.businessOwner?.authorizedStaffCount ?? 0), 0) ?? 0;
  const totalMessages = users?.reduce((sum, u) => sum + (u.businessOwner?.messageCount ?? 0), 0) ?? 0;

  return (
    <div className="min-h-[calc(100vh-7rem)] space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-foreground mb-2">Business Owners</h1>
          <p className="text-muted-foreground">Manage owner accounts, platform admins, bot access, and account status.</p>
        </div>
        <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
          <DialogTrigger render={<Button className="bg-blue-600 hover:bg-blue-500 text-white shadow-sm" />}>
            <Plus className="w-4 h-4 mr-2" />
            Add Account
          </DialogTrigger>
          <DialogContent className="bg-card border-border text-foreground">
            <DialogHeader>
              <DialogTitle className="text-foreground">Create New Account</DialogTitle>
              <DialogDescription className="text-muted-foreground">
                Add a business owner or platform admin account manually.
              </DialogDescription>
            </DialogHeader>
            <Form {...createForm}>
              <form onSubmit={createForm.handleSubmit(onCreateSubmit)} className="space-y-4 pt-4">
                <FormField
                  control={createForm.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-foreground">Name</FormLabel>
                      <FormControl>
                        <Input
                          className="bg-muted border-border text-foreground"
                          placeholder="John Doe"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage className="text-red-600 dark:text-red-400" />
                    </FormItem>
                  )}
                />
                <FormField
                  control={createForm.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-foreground">Email</FormLabel>
                      <FormControl>
                        <Input
                          type="email"
                          className="bg-muted border-border text-foreground"
                          placeholder="john@example.com"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage className="text-red-600 dark:text-red-400" />
                    </FormItem>
                  )}
                />
                <FormField
                  control={createForm.control}
                  name="password"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-foreground">Password</FormLabel>
                      <FormControl>
                        <div className="relative">
                          <Input
                            type={showCreatePassword ? "text" : "password"}
                            className="bg-muted border-border text-foreground pr-10"
                            placeholder="••••••••"
                            {...field}
                          />
                          <button
                            type="button"
                            onClick={() => setShowCreatePassword((p) => !p)}
                            aria-label={showCreatePassword ? 'Hide password' : 'Show password'}
                            className="absolute right-3 top-1/2 -translate-y-1/2 rounded text-slate-500 transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2 cursor-pointer"
                          >
                            {showCreatePassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                          </button>
                        </div>
                      </FormControl>
                      <FormDescription>Use at least 8 characters.</FormDescription>
                      <FormMessage className="text-red-600 dark:text-red-400" />
                    </FormItem>
                  )}
                />
                <FormField
                  control={createForm.control}
                  name="role"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-foreground">Role</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger className="bg-muted border-border text-foreground">
                            <SelectValue placeholder="Select a role" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent className="bg-muted border-border text-foreground">
                          <SelectItem value="user">User</SelectItem>
                          <SelectItem value="admin">Admin</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage className="text-red-600 dark:text-red-400" />
                    </FormItem>
                  )}
                />
                <div className="flex justify-end pt-4">
                  <Button
                    type="submit"
                    disabled={createForm.formState.isSubmitting}
                    className="bg-blue-600 hover:bg-blue-500 text-white"
                  >
                    {createForm.formState.isSubmitting && (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    )}
                    Create Account
                  </Button>
                </div>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>

      <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
        <DialogContent className="bg-card border-border text-foreground">
          <DialogHeader>
            <DialogTitle className="text-foreground">Edit Account</DialogTitle>
            <DialogDescription className="text-muted-foreground">
              Update details for {editingUser?.email}.
            </DialogDescription>
          </DialogHeader>
          <Form {...editForm}>
            <form onSubmit={editForm.handleSubmit(handleUpdate)} className="space-y-4 pt-4">
              <FormField
                control={editForm.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-foreground">Name</FormLabel>
                    <FormControl>
                      <Input
                        className="bg-muted border-border text-foreground"
                        placeholder="John Doe"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage className="text-red-600 dark:text-red-400" />
                  </FormItem>
                )}
              />
              <FormField
                control={editForm.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-foreground">Email</FormLabel>
                    <FormControl>
                      <Input
                        type="email"
                        className="bg-muted border-border text-foreground"
                        placeholder="john@example.com"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage className="text-red-600 dark:text-red-400" />
                  </FormItem>
                )}
              />
              <FormField
                control={editForm.control}
                name="role"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-foreground">Role</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger className="bg-muted border-border text-foreground">
                          <SelectValue placeholder="Select a role" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent className="bg-muted border-border text-foreground">
                        <SelectItem value="user">User</SelectItem>
                        <SelectItem value="admin">Admin</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage className="text-red-600 dark:text-red-400" />
                  </FormItem>
                )}
              />
              <div className="flex justify-end pt-4">
                <Button
                  type="submit"
                  disabled={editForm.formState.isSubmitting}
                  className="bg-blue-600 hover:bg-blue-500 text-white"
                >
                  {editForm.formState.isSubmitting && (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  )}
                  Save Changes
                </Button>
              </div>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { label: 'Business Owners', value: totalOwners, icon: Users },
          { label: 'Connected Bots', value: connectedBots, icon: Bot },
          { label: 'Authorized Staff', value: totalStaff, icon: UserCheck },
          { label: 'Bot Messages', value: totalMessages, icon: MessageSquare },
        ].map(item => {
          const Icon = item.icon;
          return (
            <div key={item.label} className="rounded-lg border border-border bg-card p-4 shadow-sm">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{item.label}</p>
                  <p className="mt-2 text-2xl font-bold text-foreground">{item.value.toLocaleString()}</p>
                </div>
                <div className="flex h-10 w-10 items-center justify-center rounded-md bg-blue-500/10 text-blue-600 dark:text-blue-400">
                  <Icon className="h-5 w-5" />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="bg-card border border-border rounded-lg overflow-hidden shadow-sm">
        <div className="p-4 border-b border-border bg-muted/50 flex items-center gap-4">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
            <Input
              placeholder="Search accounts..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="pl-9 bg-muted/50 border-border text-foreground placeholder:text-muted-foreground focus-visible:ring-blue-500"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <Table>
            <TableHeader className="bg-muted/50 hover:bg-muted/50">
              <TableRow className="border-border">
                <TableHead className="text-muted-foreground font-medium">User</TableHead>
                <TableHead className="text-muted-foreground font-medium">Telegram Bot</TableHead>
                <TableHead className="text-muted-foreground font-medium">Workspace Stats</TableHead>
                <TableHead className="text-muted-foreground font-medium">Role</TableHead>
                <TableHead className="text-muted-foreground font-medium">Status</TableHead>
                <TableHead className="text-muted-foreground font-medium whitespace-nowrap">
                  Joined Date
                </TableHead>
                <TableHead className="text-right text-muted-foreground font-medium">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i} className="border-border transition-colors">
                    <TableCell>
                      <Skeleton className="h-10 w-48 bg-muted" />
                    </TableCell>
                    <TableCell>
                      <Skeleton className="h-6 w-16 bg-muted rounded-full" />
                    </TableCell>
                    <TableCell>
                      <Skeleton className="h-6 w-20 bg-muted rounded-full" />
                    </TableCell>
                    <TableCell>
                      <Skeleton className="h-5 w-24 bg-muted" />
                    </TableCell>
                    <TableCell className="text-right">
                      <Skeleton className="h-8 w-8 ml-auto bg-muted" />
                    </TableCell>
                  </TableRow>
                ))
              ) : isError ? (
                <TableRow className="border-border hover:bg-muted/30">
                  <TableCell colSpan={7} className="text-center py-12">
                    <p className="font-semibold text-red-600 dark:text-red-400">Couldn&apos;t load users. Check your connection and try again.</p>
                    <Button variant="outline" size="sm" className="mt-3" onClick={() => void refetch()}>Retry</Button>
                  </TableCell>
                </TableRow>
              ) : filteredUsers.length === 0 ? (
                <TableRow className="border-border hover:bg-muted/30">
                  <TableCell colSpan={7} className="text-center py-12 text-muted-foreground">
                    <div className="flex flex-col items-center justify-center gap-3">
                      <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center">
                        <Users className="w-6 h-6 text-slate-500" />
                      </div>
                      <p>No accounts found matching your search.</p>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                filteredUsers.map(user => (
                  <TableRow
                    key={user.id}
                    className="border-border hover:bg-muted/60 transition-colors"
                  >
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <Avatar className="h-9 w-9 border border-border bg-muted">
                          <AvatarFallback className="bg-blue-500/20 text-blue-600 dark:text-blue-400 text-sm">
                            {user.name?.[0]?.toUpperCase() ?? 'U'}
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex flex-col">
                          <span className="font-medium text-foreground/85">{user.name}</span>
                          <span className="text-xs text-muted-foreground">{user.email}</span>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      {user.role === 'admin' ? (
                        <Badge variant="outline" className="border-slate-300 text-muted-foreground">
                          Platform
                        </Badge>
                      ) : user.businessOwner?.botConnected ? (
                        <Badge className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20">
                          <Bot className="mr-1 h-3 w-3" />
                          Connected
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="border-amber-500/30 text-amber-600 dark:text-amber-400">
                          Not connected
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      {user.role === 'admin' ? (
                        <span className="text-xs text-muted-foreground italic font-normal">N/A (Platform Admin)</span>
                      ) : (
                        <div className="flex flex-col gap-1.5 max-w-[200px] py-1">
                          <div className="flex items-center justify-between text-xs border-b border-slate-100 dark:border-slate-800/40 pb-1">
                            <span className="flex items-center gap-1.5 text-muted-foreground">
                              <Users className="w-3.5 h-3.5 text-sky-500" />
                              Staff
                            </span>
                            <Badge variant="secondary" className="px-1.5 py-0 bg-sky-50 dark:bg-sky-950/30 text-sky-700 dark:text-sky-400 font-bold border-0 text-[10px]">
                              {user.businessOwner?.authorizedStaffCount ?? 0}/{user.businessOwner?.staffCount ?? 0}
                            </Badge>
                          </div>
                          <div className="flex items-center justify-between text-xs border-b border-slate-100 dark:border-slate-800/40 pb-1">
                            <span className="flex items-center gap-1.5 text-muted-foreground">
                              <UserCheck className="w-3.5 h-3.5 text-indigo-500" />
                              Customers
                            </span>
                            <Badge variant="secondary" className="px-1.5 py-0 bg-indigo-50 dark:bg-indigo-950/30 text-indigo-700 dark:text-indigo-400 font-bold border-0 text-[10px]">
                              {user.businessOwner?.customerCount ?? 0}
                            </Badge>
                          </div>
                          <div className="flex items-center justify-between text-xs">
                            <span className="flex items-center gap-1.5 text-muted-foreground">
                              <Database className="w-3.5 h-3.5 text-emerald-500" />
                              Records
                            </span>
                            <Badge variant="secondary" className="px-1.5 py-0 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400 font-bold border-0 text-[10px]">
                              {((user.businessOwner?.demandRecordCount ?? 0) + (user.businessOwner?.businessReportCount ?? 0)).toLocaleString()}
                            </Badge>
                          </div>
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      {user.role === 'admin' ? (
                        <Badge
                          variant="outline"
                          className="bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 border-indigo-500/25 px-2.5 py-1 text-xs font-semibold flex items-center gap-1.5 rounded-md w-fit shadow-sm"
                        >
                          <Shield className="w-3.5 h-3.5" />
                          Platform Admin
                        </Badge>
                      ) : (
                        <Badge
                          variant="outline"
                          className="bg-sky-500/10 text-sky-700 dark:text-sky-300 border-sky-500/25 px-2.5 py-1 text-xs font-semibold flex items-center gap-1.5 rounded-md w-fit shadow-sm"
                        >
                          <Building2 className="w-3.5 h-3.5" />
                          Business Owner
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      {user.banned ? (
                        <div className="flex flex-col">
                          <Badge
                            variant="destructive"
                            className="bg-red-500/20 text-red-600 dark:text-red-400 border-red-500/30 w-fit"
                          >
                            Banned
                          </Badge>
                          <span
                            className="text-[10px] text-slate-500 mt-1 max-w-37.5 truncate"
                            title={user.banReason ?? ''}
                          >
                            {user.banReason}
                          </span>
                        </div>
                      ) : (
                        <Badge
                          variant="outline"
                          className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20"
                        >
                          Active
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {format(new Date(user.createdAt), 'MMM d, yyyy')}
                    </TableCell>
                    <TableCell className="text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger render={<Button
                            variant="ghost"
                            size="icon"
                            className="text-muted-foreground hover:text-foreground hover:bg-muted"
                          />}>
                            <MoreVertical className="w-4 h-4" />
                        </DropdownMenuTrigger>
                        <DropdownMenuContent
                          align="end"
                          className="bg-card border-border text-foreground"
                        >
                          <DropdownMenuLabel>Actions</DropdownMenuLabel>
                          <DropdownMenuSeparator className="bg-muted" />
                          <DropdownMenuItem
                            className="hover:bg-muted cursor-pointer text-foreground"
                            onClick={() => openEditModal(user)}
                          >
                            <Edit className="w-4 h-4 mr-2" /> Edit Details
                          </DropdownMenuItem>

                          {user.banned ? (
                            <DropdownMenuItem
                              className="hover:bg-muted cursor-pointer text-emerald-600 dark:text-emerald-400 focus:text-emerald-700 dark:text-emerald-300 focus:bg-emerald-500/10"
                              onClick={() => unbanUser.mutate(user.id)}
                            >
                              <Unlock className="w-4 h-4 mr-2" /> Unban Account
                            </DropdownMenuItem>
                          ) : (
                            <DropdownMenuItem
                              className="hover:bg-muted cursor-pointer text-amber-600 dark:text-amber-500 focus:text-amber-600 dark:text-amber-400 focus:bg-amber-500/10"
                              onClick={() => {
                                const reason = window.prompt(
                                  'Reason for banning:',
                                  'Violation of terms'
                                );
                                if (reason !== null) banUser.mutate({ id: user.id, reason });
                              }}
                            >
                              <Ban className="w-4 h-4 mr-2" /> Ban Account
                            </DropdownMenuItem>
                          )}

                          <DropdownMenuSeparator className="bg-muted" />
                          <DropdownMenuItem
                            className="text-red-600 dark:text-red-400 focus:text-red-700 dark:text-red-300 hover:bg-red-500/10 cursor-pointer"
                            onClick={() => setUserPendingDeletion(user)}
                          >
                            <Trash2 className="w-4 h-4 mr-2" /> Delete Account
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      {userPendingDeletion && (
        <DestructiveConfirmDialog
          title="Permanently delete account?"
          description={
            <>
              This permanently deletes <strong className="font-semibold text-foreground">{userPendingDeletion.email}</strong>
              {' '}and its associated account data. This action cannot be undone.
            </>
          }
          notice="This permanently deletes the account and its associated data"
          confirmLabel="Delete account"
          confirmationText="DELETE"
          confirmationLabel="Type DELETE to permanently delete this account"
          isPending={deleteUser.isPending}
          onCancel={() => setUserPendingDeletion(null)}
          onConfirm={handleDeleteConfirm}
        />
      )}
    </div>
  );
}
