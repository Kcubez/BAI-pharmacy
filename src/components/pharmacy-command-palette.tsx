"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { Command } from "cmdk";
import {
  ArrowDownUp,
  LayoutDashboard,
  Moon,
  Package,
  RefreshCw,
  Sun,
  TrendingUp,
  Truck,
  Upload,
  Users,
  Wallet,
} from "lucide-react";
import { useTheme } from "next-themes";
import { toast } from "sonner";
import { pharmacyKeys } from "@/hooks/use-pharmacy";

/**
 * ⌘K command palette: jump to pharmacy pages + quick actions.
 * cmdk handles filtering, keyboard nav and focus trap internally.
 */
export function PharmacyCommandPalette() {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const queryClient = useQueryClient();
  const { theme, setTheme } = useTheme();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const go = useCallback(
    (href: string) => {
      setOpen(false);
      router.push(href);
    },
    [router],
  );

  const pages = [
    { title: "CEO Overview", href: "/pharmacy", Icon: LayoutDashboard },
    { title: "Sales Analysis", href: "/pharmacy/sales", Icon: TrendingUp },
    { title: "AR & Collection", href: "/pharmacy/ar", Icon: Wallet },
    { title: "Inventory & Reorder", href: "/pharmacy/inventory", Icon: Package },
    { title: "Supplier Payables", href: "/pharmacy/payables", Icon: Truck },
    { title: "Team KPI", href: "/pharmacy/team", Icon: Users },
    { title: "Pharmacy Import", href: "/pharmacy/import", Icon: Upload },
  ];

  return (
    <Command.Dialog
      open={open}
      onOpenChange={setOpen}
      label="Command palette"
      className="fixed left-1/2 top-[20%] z-[100] w-[min(640px,calc(100vw-2rem))] -translate-x-1/2 overflow-hidden rounded-xl border border-border bg-popover text-popover-foreground shadow-2xl"
      overlayClassName="fixed inset-0 z-[99] bg-black/50 backdrop-blur-sm"
    >
      <div className="flex items-center gap-2 border-b border-border px-4">
        <ArrowDownUp className="h-4 w-4 text-muted-foreground" />
        <Command.Input
          placeholder="Go to page or run action… (customers, AR, import)"
          className="h-12 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
        />
      </div>
      <Command.List className="max-h-[320px] overflow-y-auto p-2">
        <Command.Empty className="py-6 text-center text-sm text-muted-foreground">
          No matches.
        </Command.Empty>
        <Command.Group heading="Pages" className="px-2 py-1.5 text-[10px] font-extrabold uppercase tracking-wider text-muted-foreground">
          {pages.map((p) => (
            <Command.Item
              key={p.href}
              value={p.title}
              onSelect={() => go(p.href)}
              className="flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium data-[selected=true]:bg-muted"
            >
              <p.Icon className="h-4 w-4 text-muted-foreground" />
              {p.title}
            </Command.Item>
          ))}
        </Command.Group>
        <Command.Group heading="Actions" className="px-2 py-1.5 text-[10px] font-extrabold uppercase tracking-wider text-muted-foreground">
          <Command.Item
            value="Refresh dashboard data"
            onSelect={() => {
              setOpen(false);
              void queryClient.invalidateQueries({ queryKey: pharmacyKeys.all });
              toast.success("Dashboard refreshing…");
            }}
            className="flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium data-[selected=true]:bg-muted"
          >
            <RefreshCw className="h-4 w-4 text-muted-foreground" />
            Refresh dashboard data
          </Command.Item>
          <Command.Item
            value="Toggle theme"
            onSelect={() => {
              setOpen(false);
              setTheme(theme === "dark" ? "light" : "dark");
            }}
            className="flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium data-[selected=true]:bg-muted"
          >
            {theme === "dark" ? (
              <Sun className="h-4 w-4 text-muted-foreground" />
            ) : (
              <Moon className="h-4 w-4 text-muted-foreground" />
            )}
            Toggle theme
          </Command.Item>
          <Command.Item
            value="Collection priority"
            onSelect={() => go("/pharmacy/ar")}
            className="flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium data-[selected=true]:bg-muted"
          >
            <Users className="h-4 w-4 text-muted-foreground" />
            Collection priority (AR)
          </Command.Item>
        </Command.Group>
      </Command.List>
      <div className="flex items-center gap-4 border-t border-border px-4 py-2 text-[10px] font-semibold text-muted-foreground">
        <span><kbd className="rounded border border-border bg-muted px-1">↑↓</kbd> navigate</span>
        <span><kbd className="rounded border border-border bg-muted px-1">↵</kbd> open</span>
        <span><kbd className="rounded border border-border bg-muted px-1">esc</kbd> close</span>
      </div>
    </Command.Dialog>
  );
}
