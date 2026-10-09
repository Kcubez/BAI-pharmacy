'use client';

import { useSession, signOut } from '@/lib/auth-client';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import {
  LogOut,
  LayoutDashboard,
  Users,
  User as UserIcon,
  Menu,
  MessageSquare,
  Settings,
  UserCircle,
  TrendingUp,
  Megaphone,
  Package,
  Database,
  Wallet,
  Trash2,
  Upload,
  Lightbulb,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Sheet, SheetContent, SheetTrigger, SheetTitle } from '@/components/ui/sheet';
import { Separator } from '@/components/ui/separator';
import { ThemeToggle } from '@/components/theme-toggle';
import { useEffect, useRef, useState } from 'react';
import { useLiveEvents } from '@/hooks/use-live-events';
import { PharmacyCommandPalette } from '@/components/pharmacy-command-palette';
import { queryClient } from '@/lib/query-client';
import { toast } from 'sonner';

type NavItem = {
  title: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  adminOnly: boolean;
};

type NavGroup = {
  label: string;
  items: NavItem[];
};

const ADMIN_ALLOWED_PATHS = ['/admin/users', '/trash'];
const ADMIN_ONLY_PATHS = ['/admin/users'];

function isAdminAllowedPath(pathname: string) {
  return ADMIN_ALLOWED_PATHS.some(
    (path) => pathname === path || pathname.startsWith(`${path}/`),
  );
}

function isAdminOnlyPath(pathname: string) {
  return ADMIN_ONLY_PATHS.some(
    (path) => pathname === path || pathname.startsWith(`${path}/`),
  );
}

function WorkspaceLoadingShell({ message }: { message: string }) {
  return (
    <div
      className="min-h-screen bg-background text-foreground flex flex-col md:flex-row"
      aria-busy="true"
      aria-live="polite"
    >
      <aside className="hidden md:flex w-64 shrink-0 flex-col gap-6 bg-[#020617] p-5">
        <div className="h-10 w-44 animate-pulse rounded-lg bg-slate-800" />
        <div className="space-y-3">
          <div className="h-3 w-24 animate-pulse rounded bg-slate-800" />
          <div className="h-10 animate-pulse rounded-lg bg-slate-800/70" />
          <div className="h-10 animate-pulse rounded-lg bg-slate-800/70" />
        </div>
      </aside>
      <main className="flex flex-1 items-center justify-center p-6">
        <p className="text-sm text-muted-foreground">{message}</p>
      </main>
    </div>
  );
}

export function DashboardLayoutClient({ children }: { children: React.ReactNode }) {
  const { data: session, isPending: isSessionPending } = useSession();
  const router = useRouter();
  const pathname = usePathname();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const isAdmin = session?.user?.role === 'admin';
  const isAdminOnRestrictedRoute = isAdmin && !isAdminAllowedPath(pathname);
  const isBusinessOwnerOnAdminRoute =
    !isSessionPending && Boolean(session) && !isAdmin && isAdminOnlyPath(pathname);
  const isRoleRestrictedRoute = isAdminOnRestrictedRoute || isBusinessOwnerOnAdminRoute;

  // Live updates over SSE (server pushes on import / Telegram ingestion).
  useLiveEvents(!isSessionPending && !isAdmin && !isBusinessOwnerOnAdminRoute);

  // Query cache has no per-user keys, so a different login in the same tab
  // would briefly see the previous account's rows (and PATCH them into a
  // 404). Drop the whole cache whenever the session user changes.
  const sessionUserId = session?.user?.id;
  const prevUserIdRef = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (prevUserIdRef.current !== undefined && prevUserIdRef.current !== sessionUserId) {
      queryClient.clear();
    }
    prevUserIdRef.current = sessionUserId;
  }, [sessionUserId]);

  useEffect(() => {
    if (isAdminOnRestrictedRoute) {
      router.replace('/admin/users');
    } else if (isBusinessOwnerOnAdminRoute) {
      router.replace('/pharmacy');
    }
  }, [isAdminOnRestrictedRoute, isBusinessOwnerOnAdminRoute, router]);

  const handleSignOut = async () => {
    const isAdmin = session?.user?.role === 'admin';
    setIsSigningOut(true);

    try {
      const { error } = await signOut();
      if (error) {
        toast.error(error.message ?? 'Unable to sign out. Please try again.');
        setIsSigningOut(false);
        return;
      }

      toast.success(isAdmin ? 'Admin signed out successfully' : 'Signed out successfully');
      // Never leave the previous account's rows in cache: the next login in
      // this tab must start from loading state, not stale deals/customers.
      queryClient.clear();
      router.push(isAdmin ? '/admin/login' : '/login');
      router.refresh();
    } catch {
      toast.error('Unable to sign out. Please try again.');
      setIsSigningOut(false);
    }
  };

  // Legacy commerce reference pages (empty for pharma data) — hidden from
  // nav, routes kept for reference/rollback. Re-enable by setting true.
  const SHOW_LEGACY_WORKSPACES = false;
  const navGroups: NavGroup[] = [
    {
      label: 'Pharmacy CEO',
      items: [
        { title: 'CEO Overview', href: '/pharmacy', icon: LayoutDashboard, adminOnly: false },
        { title: 'Sales Analysis', href: '/pharmacy/sales', icon: TrendingUp, adminOnly: false },
        { title: 'AR & Collection', href: '/pharmacy/ar', icon: Wallet, adminOnly: false },
        { title: 'Inventory & Reorder', href: '/pharmacy/inventory', icon: Package, adminOnly: false },
        { title: 'Supplier Payables', href: '/pharmacy/payables', icon: UserCircle, adminOnly: false },
        { title: 'Team KPI', href: '/pharmacy/team', icon: Users, adminOnly: false },
        { title: 'Pharmacy Import', href: '/pharmacy/import', icon: Upload, adminOnly: false },
      ],
    },
    ...(SHOW_LEGACY_WORKSPACES
      ? [
          {
            label: 'Intelligence Workspaces',
            items: [
              { title: 'Finance', href: '/finance', icon: Wallet, adminOnly: false },
              { title: 'Sales', href: '/sales', icon: TrendingUp, adminOnly: false },
              { title: 'Marketing', href: '/marketing', icon: Megaphone, adminOnly: false },
              { title: 'Customer Service', href: '/customer-service', icon: UserCircle, adminOnly: false },
              { title: 'Product & Inventory', href: '/inventory', icon: Package, adminOnly: false },
            ],
          } as NavGroup,
        ]
      : []),
    {
      label: 'Operations',
      items: [
        { title: 'Data Feed', href: '/data-feed', icon: MessageSquare, adminOnly: false },
        { title: 'Brainstorm & Planning', href: '/planning', icon: Lightbulb, adminOnly: false },
        { title: 'Trash', href: '/trash', icon: Trash2, adminOnly: false },
      ],
    },
    {
      label: 'Admin',
      items: [
        { title: 'Settings', href: '/settings', icon: Settings, adminOnly: false },
        { title: 'User Management', href: '/admin/users', icon: Users, adminOnly: true },
        { title: 'Trash', href: '/trash', icon: Trash2, adminOnly: true },
      ],
    },
  ];

  const filteredNavGroups = navGroups
    .map(group => ({
      ...group,
      items: group.items.filter(item =>
        isAdmin ? item.adminOnly : !item.adminOnly
      ),
    }))
    .filter(group => group.items.length > 0);

  // Do not render a role's workspace before the session role has loaded or
  // while a role-based redirect is in progress.
  if (isSigningOut || isSessionPending || isRoleRestrictedRoute) {
    return (
      <WorkspaceLoadingShell
        message={
          isSigningOut
            ? 'Signing out…'
            : isAdminOnRestrictedRoute
              ? 'Opening User Management…'
              : isBusinessOwnerOnAdminRoute
                ? 'Opening your workspace…'
                : 'Loading workspace…'
        }
      />
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col md:flex-row">
      <PharmacyCommandPalette />
      {/* Mobile Header - MOT Business AI Style */}
      <header className="md:hidden flex items-center justify-between gap-2 px-4 h-14 border-b-2 border-slate-800 bg-[#020617] text-white backdrop-blur-xl sticky top-0 z-40 shadow-lg">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-8 h-8 rounded-lg bg-sky-600 text-white flex items-center justify-center shadow-md shadow-sky-500/20">
            <Database className="w-4 h-4" aria-hidden />
          </div>
          <span className="font-bold text-base whitespace-nowrap text-white">
            {process.env.NEXT_PUBLIC_APP_NAME ?? 'BAI-Pharmacy'}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <ThemeToggle />
          <Sheet open={isMobileMenuOpen} onOpenChange={setIsMobileMenuOpen}>
            <SheetTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Open navigation"
                  className="cursor-pointer text-white hover:bg-white/10"
                />
              }
            >
              <Menu className="w-5 h-5" aria-hidden />
            </SheetTrigger>
            <SheetContent
              side="left"
              className="bg-[#020617] text-white border-r-2 border-slate-800 p-0 w-72"
            >
              <SheetTitle className="sr-only">Primary navigation</SheetTitle>
              <div className="flex items-center gap-2.5 px-5 h-14 border-b-2 border-slate-800">
                <div className="w-8 h-8 rounded-lg bg-sky-600 text-white flex items-center justify-center shadow-md shadow-sky-500/20">
                  <Database className="w-4 h-4" aria-hidden />
                </div>
                <div className="min-w-0">
                  <h1 className="font-bold text-sm tracking-tight whitespace-nowrap text-white">
                    {process.env.NEXT_PUBLIC_APP_NAME ?? 'Business AI Integration'}
                  </h1>
                  <p className="text-[10px] text-sky-400 font-medium">Product Sales Edition</p>
                </div>
              </div>
              <div className="p-4">
                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-3 px-3">
                  Intelligence Workspaces
                </p>
                <nav className="space-y-1" aria-label="Primary">
                  {filteredNavGroups.map(group =>
                    group.items.map(item => {
                      const isActive = pathname === item.href;
                      const Icon = item.icon;
                      return (
                        <Link
                          key={item.href}
                          href={item.href}
                          onClick={() => setIsMobileMenuOpen(false)}
                          aria-current={isActive ? 'page' : undefined}
                          className={`flex items-center gap-3 px-3 py-3 rounded-lg text-sm font-medium transition-all duration-200 ${
                            isActive
                              ? 'bg-white/12 border-l-3 border-l-sky-500 text-slate-100'
                              : 'text-slate-400 hover:bg-white/8'
                          }`}
                        >
                          <Icon className={`w-5 h-5 ${isActive ? 'text-slate-100' : 'text-slate-400'}`} aria-hidden />
                          <span>{item.title}</span>
                        </Link>
                      );
                    })
                  )}
                </nav>
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </header>

      {/* Desktop Sidebar - MOT Business AI Style */}
      <aside
        className="hidden md:flex flex-col w-64 shrink-0 bg-[#020617] text-white h-screen sticky top-0 shadow-xl"
        aria-label="Primary"
      >
        {/* Header Section with Branding */}
        <div className="px-5 py-6 border-b-2 border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-sky-600 flex items-center justify-center shadow-lg shadow-sky-500/20">
              <Database className="w-5 h-5 text-white" aria-hidden />
            </div>
            <div className="min-w-0">
              <h1 className="font-bold text-base tracking-tight whitespace-nowrap text-white">
                {process.env.NEXT_PUBLIC_APP_NAME ?? 'Business AI Integration'}
              </h1>
              <p className="text-xs text-sky-400 font-medium tracking-wide">Product Sales Edition</p>
            </div>
          </div>
        </div>

        {/* Navigation Section */}
        <div className="p-4 flex-1 overflow-y-auto">
          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-3 px-3">
            Intelligence Workspaces
          </p>
          <nav className="space-y-1" aria-label="Primary">
            {filteredNavGroups.map(group =>
              group.items.map(item => {
                const isActive = pathname === item.href;
                const Icon = item.icon;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    aria-current={isActive ? 'page' : undefined}
                    className={`sidebar-item flex items-center gap-3 px-3 py-3 rounded-lg text-sm font-medium transition-all duration-200 ${
                      isActive
                        ? 'bg-white/12 border-l-3 border-l-sky-500 text-slate-100'
                        : 'text-slate-400 hover:bg-white/8'
                    }`}
                  >
                    <Icon
                      className={`w-5 h-5 text-center ${isActive ? 'text-slate-100' : 'text-slate-400'}`}
                      aria-hidden
                    />
                    <span>{item.title}</span>
                  </Link>
                );
              })
            )}
          </nav>
        </div>

        {/* User Profile Section */}
        <div className="p-3 border-t-2 border-slate-800">
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  variant="ghost"
                  className="w-full justify-start gap-3 h-auto p-2.5 hover:bg-white/8 rounded-lg cursor-pointer text-white min-w-0"
                />
              }
            >
              <Avatar className="h-9 w-9 bg-sky-900 text-sky-300 border-2 border-sky-700 shrink-0">
                <AvatarImage src={session?.user?.image ?? ''} alt={session?.user?.name ?? ''} />
                <AvatarFallback className="bg-sky-900 text-sky-300 text-sm font-semibold">
                  {session?.user?.name?.[0]?.toUpperCase() ?? 'U'}
                </AvatarFallback>
              </Avatar>
              <div className="flex flex-col items-start text-left flex-1 min-w-0 overflow-hidden">
                <span className="font-medium text-sm text-white truncate w-full block">
                  {session?.user?.name}
                </span>
                <span className="text-[11px] text-sky-400 truncate w-full block">
                  {session?.user?.email}
                </span>
              </div>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              side="top"
              className="w-60 mb-1"
            >
              <DropdownMenuLabel className="font-normal">
                <p className="text-sm font-semibold text-foreground">{session?.user?.name}</p>
                <p className="text-xs text-muted-foreground mt-0.5 truncate">
                  {session?.user?.email}
                </p>
                <div className="mt-2 inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-medium bg-sky-50 text-sky-700 border border-sky-200">
                  Role:{' '}
                  <span className="font-semibold">
                    {session?.user?.role}
                  </span>
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem className="cursor-pointer">
                <UserIcon className="w-4 h-4" />
                Profile
              </DropdownMenuItem>
              <DropdownMenuItem className="cursor-pointer">
                <Settings className="w-4 h-4" />
                Settings
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                variant="destructive"
                onClick={handleSignOut}
                className="cursor-pointer"
              >
                <LogOut className="w-4 h-4" />
                Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <Separator className="my-2 bg-slate-800" />

          <div className="flex items-center justify-between px-1">
            <span className="text-[10px] uppercase text-slate-500 font-semibold">
              Theme
            </span>
            <ThemeToggle />
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main
        id="main-content"
        className="flex-1 min-w-0 overflow-x-hidden p-4 sm:p-6 md:p-8 bg-background"
        tabIndex={-1}
      >
        <div className="mx-auto max-w-[1600px] page-transition">{children}</div>
      </main>
    </div>
  );
}
