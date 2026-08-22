"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  ChevronsLeft,
  Command as CommandIcon,
  LogOut,
  Menu,
  PanelLeft,
  Search,
  Sparkles,
  X,
} from "lucide-react";

import { LogoMark, Wordmark } from "@/components/brand/logo";
import { Avatar } from "@/components/ui/avatar";
import { useToast } from "@/components/ui/toast";
import { api } from "@/lib/client/api";
import { usePersistentFlag } from "@/lib/client/use-persistent-flag";
import { cn } from "@/lib/cn";
import { roleLabel } from "@/lib/format";
import type { Role } from "@/lib/domain/constants";

import { CommandPalette } from "./command-palette";
import { NotificationBell } from "./notification-bell";
import {
  mobileNavFor,
  navigationFor,
  type BadgeCounts,
  type NavItem,
} from "./nav-config";

export type ShellUser = {
  fullName: string;
  email: string;
  role: Role;
  jobTitle: string | null;
  department: string | null;
  avatarColor: string;
  employeeId: string | null;
  employeeCode: string | null;
};

const COLLAPSE_KEY = "dayflow.sidebar.collapsed";

export function AppShell({
  user,
  counts,
  children,
}: {
  user: ShellUser;
  counts: BadgeCounts;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const toast = useToast();

  const [collapsed, toggleCollapsed] = usePersistentFlag(COLLAPSE_KEY);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  const groups = useMemo(() => navigationFor(user.role), [user.role]);
  const mobileItems = useMemo(() => mobileNavFor(user.role), [user.role]);

  // Close the mobile drawer on navigation. Adjusting state during render (rather
  // than in an effect) avoids a second render pass with the drawer still open.
  const [lastPath, setLastPath] = useState(pathname);
  if (lastPath !== pathname) {
    setLastPath(pathname);
    setDrawerOpen(false);
  }

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setPaletteOpen(true);
      }
      if (event.key === "Escape") setDrawerOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const badgeFor = (item: NavItem) => (item.badge ? counts[item.badge] : 0);

  async function signOut() {
    setSigningOut(true);
    try {
      await api.post("/api/auth/sign-out");
      toast.info("Signed out");
      router.replace("/sign-in");
      router.refresh();
    } catch {
      toast.error("Sign out failed", "Please try again.");
      setSigningOut(false);
    }
  }

  const activeItem = groups
    .flatMap((g) => g.items)
    .find((item) => pathname === item.href || pathname.startsWith(`${item.href}/`));

  return (
    <div className="flex min-h-dvh bg-canvas">
      {/* ============================================== desktop sidebar */}
      <aside
        className={cn(
          "sticky top-0 hidden h-dvh shrink-0 flex-col bg-sidebar text-white lg:flex",
          "transition-[width] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)]",
          collapsed ? "w-[4.5rem]" : "w-[15.5rem]",
        )}
      >
        <div
          className={cn(
            "flex h-15 items-center border-b border-white/8",
            collapsed ? "justify-center px-2" : "justify-between px-4",
          )}
        >
          {collapsed ? (
            <Link href="/overview" aria-label="Dayflow home">
              <LogoMark tone="brand" />
            </Link>
          ) : (
            <Link href="/overview" className="min-w-0">
              <Wordmark tone="light" />
            </Link>
          )}
          {!collapsed ? (
            <button
              type="button"
              onClick={toggleCollapsed}
              aria-label="Collapse sidebar"
              className="rounded-md p-1.5 text-white/45 transition-colors hover:bg-white/10 hover:text-white"
            >
              <ChevronsLeft className="size-4" />
            </button>
          ) : null}
        </div>

        <nav aria-label="Main" className="flex-1 overflow-y-auto px-2.5 py-4">
          {groups.map((group) => (
            <div key={group.title} className="mb-5 last:mb-0">
              {!collapsed ? (
                <p className="mb-1.5 px-2.5 text-[0.625rem] font-semibold tracking-[0.12em] text-white/35 uppercase">
                  {group.title}
                </p>
              ) : (
                <div aria-hidden className="mx-2.5 mb-2 h-px bg-white/8 first:hidden" />
              )}
              <ul className="space-y-0.5">
                {group.items.map((item) => (
                  <li key={item.href}>
                    <SidebarLink
                      item={item}
                      collapsed={collapsed}
                      active={
                        pathname === item.href || pathname.startsWith(`${item.href}/`)
                      }
                      badge={badgeFor(item)}
                    />
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>

        <div className="border-t border-white/8 p-2.5">
          {collapsed ? (
            <div className="flex flex-col items-center gap-1">
              <Avatar name={user.fullName} tone={user.avatarColor} size="sm" />
              <button
                type="button"
                onClick={toggleCollapsed}
                aria-label="Expand sidebar"
                className="rounded-md p-1.5 text-white/45 transition-colors hover:bg-white/10 hover:text-white"
              >
                <PanelLeft className="size-4" />
              </button>
            </div>
          ) : (
            <div className="rounded-lg bg-white/6 p-2.5">
              <div className="flex items-center gap-2.5">
                <Avatar name={user.fullName} tone={user.avatarColor} size="sm" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[0.8125rem] font-medium text-white">
                    {user.fullName}
                  </p>
                  <p className="truncate text-[0.6875rem] text-white/50">
                    {roleLabel(user.role)}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => void signOut()}
                  disabled={signingOut}
                  aria-label="Sign out"
                  title="Sign out"
                  className="shrink-0 rounded-md p-1.5 text-white/45 transition-colors hover:bg-white/10 hover:text-white disabled:opacity-50"
                >
                  <LogOut className="size-4" />
                </button>
              </div>
            </div>
          )}
        </div>
      </aside>

      {/* ================================================ mobile drawer */}
      {drawerOpen ? (
        <div className="fixed inset-0 z-60 lg:hidden">
          <button
            type="button"
            aria-label="Close navigation"
            onClick={() => setDrawerOpen(false)}
            className="animate-fade-in absolute inset-0 bg-ink/50"
          />
          <div className="animate-rise absolute inset-y-0 left-0 flex w-[17rem] max-w-[85vw] flex-col bg-sidebar text-white shadow-e3">
            <div className="flex h-15 items-center justify-between border-b border-white/8 px-4">
              <Wordmark tone="light" />
              <button
                type="button"
                onClick={() => setDrawerOpen(false)}
                aria-label="Close navigation"
                className="rounded-md p-1.5 text-white/50 hover:bg-white/10 hover:text-white"
              >
                <X className="size-4" />
              </button>
            </div>
            <nav aria-label="Main" className="flex-1 overflow-y-auto px-2.5 py-4">
              {groups.map((group) => (
                <div key={group.title} className="mb-5 last:mb-0">
                  <p className="mb-1.5 px-2.5 text-[0.625rem] font-semibold tracking-[0.12em] text-white/35 uppercase">
                    {group.title}
                  </p>
                  <ul className="space-y-0.5">
                    {group.items.map((item) => (
                      <li key={item.href}>
                        <SidebarLink
                          item={item}
                          collapsed={false}
                          active={
                            pathname === item.href || pathname.startsWith(`${item.href}/`)
                          }
                          badge={badgeFor(item)}
                          showDescription
                        />
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </nav>
            <div className="border-t border-white/8 p-3">
              <button
                type="button"
                onClick={() => void signOut()}
                disabled={signingOut}
                className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-[0.8125rem] font-medium text-white/70 transition-colors hover:bg-white/10 hover:text-white"
              >
                <LogOut className="size-4" />
                Sign out
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* ====================================================== content */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-40 flex h-15 items-center gap-2 border-b border-line bg-surface/85 px-3 backdrop-blur-md sm:px-5">
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            aria-label="Open navigation"
            className="rounded-md p-2 text-ink-2 transition-colors hover:bg-surface-3 lg:hidden"
          >
            <Menu className="size-5" />
          </button>

          <div className="hidden min-w-0 lg:block">
            <p className="truncate text-[0.9375rem] font-semibold text-ink">
              {activeItem?.label ?? "Dayflow"}
            </p>
            <p className="truncate text-[0.75rem] text-ink-3">
              {activeItem?.description ?? "Workforce operations"}
            </p>
          </div>

          <Link href="/overview" className="lg:hidden" aria-label="Dayflow home">
            <LogoMark />
          </Link>

          <div className="ml-auto flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setPaletteOpen(true)}
              className="hidden h-9 items-center gap-2 rounded-md border border-line-2 bg-surface-2 pr-2 pl-3 text-[0.8125rem] text-ink-3 transition-colors hover:border-line-strong hover:text-ink-2 md:flex"
            >
              <Search className="size-3.5" />
              <span>Search people, leave…</span>
              <kbd className="ml-2 flex items-center gap-0.5 rounded border border-line-2 bg-surface px-1.5 py-0.5 font-mono text-[0.625rem] text-ink-4">
                <CommandIcon className="size-2.5" />K
              </kbd>
            </button>
            <button
              type="button"
              onClick={() => setPaletteOpen(true)}
              aria-label="Search"
              className="rounded-md p-2 text-ink-2 transition-colors hover:bg-surface-3 md:hidden"
            >
              <Search className="size-4.5" />
            </button>

            <NotificationBell initialUnread={counts.unreadNotifications} />

            <Link
              href="/profile"
              className="flex items-center gap-2 rounded-md p-1 pr-2 transition-colors hover:bg-surface-3"
              aria-label="Your profile"
            >
              <Avatar name={user.fullName} tone={user.avatarColor} size="sm" />
              <span className="hidden min-w-0 sm:block">
                <span className="block max-w-[9rem] truncate text-[0.8125rem] leading-tight font-medium text-ink">
                  {user.fullName}
                </span>
                <span className="block max-w-[9rem] truncate text-[0.6875rem] leading-tight text-ink-3">
                  {user.jobTitle ?? roleLabel(user.role)}
                </span>
              </span>
            </Link>
          </div>
        </header>

        <main id="main" className="min-w-0 flex-1 px-3 py-5 pb-24 sm:px-5 lg:px-6 lg:pb-8">
          <div className="mx-auto w-full max-w-[86rem]">{children}</div>
        </main>
      </div>

      {/* ================================================= mobile bottom */}
      <nav
        aria-label="Primary"
        className="fixed inset-x-0 bottom-0 z-50 border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md lg:hidden"
      >
        <ul className="grid grid-cols-5">
          {mobileItems.map((item) => {
            const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
            const badge = badgeFor(item);
            const Icon = item.icon;
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "relative flex flex-col items-center gap-1 py-2.5 text-[0.625rem] font-medium transition-colors",
                    active ? "text-brand" : "text-ink-3",
                  )}
                >
                  <span className="relative">
                    <Icon className="size-5" />
                    {badge > 0 ? (
                      <span className="absolute -top-1 -right-1.5 grid min-w-4 place-items-center rounded-full bg-danger px-1 text-[0.5625rem] leading-4 font-semibold text-white">
                        {badge > 9 ? "9+" : badge}
                      </span>
                    ) : null}
                  </span>
                  {item.short}
                  {active ? (
                    <span
                      aria-hidden
                      className="absolute inset-x-4 top-0 h-0.5 rounded-full bg-brand"
                    />
                  ) : null}
                </Link>
              </li>
            );
          })}
          <li>
            <button
              type="button"
              onClick={() => setDrawerOpen(true)}
              className="flex w-full flex-col items-center gap-1 py-2.5 text-[0.625rem] font-medium text-ink-3"
            >
              <Menu className="size-5" />
              More
            </button>
          </li>
        </ul>
      </nav>

      {/* The palette mounts only while open, so its state starts fresh each time
          instead of needing an effect to reset it. */}
      {paletteOpen ? (
        <CommandPalette onClose={() => setPaletteOpen(false)} role={user.role} />
      ) : null}

      {/* Floating entry point to the assistant — the product's signature action. */}
      <Link
        href="/overview#ask-dayflow"
        className="fixed right-4 bottom-20 z-45 flex items-center gap-2 rounded-full bg-sidebar py-2.5 pr-4 pl-3 text-[0.8125rem] font-medium text-white shadow-e3 transition-transform hover:scale-[1.02] lg:bottom-6"
      >
        <Sparkles className="size-4 text-brand-soft2" />
        Ask Dayflow
      </Link>
    </div>
  );
}

function SidebarLink({
  item,
  active,
  collapsed,
  badge,
  showDescription = false,
}: {
  item: NavItem;
  active: boolean;
  collapsed: boolean;
  badge: number;
  showDescription?: boolean;
}) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      title={collapsed ? item.label : undefined}
      className={cn(
        "group relative flex items-center gap-2.5 rounded-lg text-[0.8125rem] font-medium transition-colors",
        collapsed ? "justify-center px-0 py-2.5" : "px-2.5 py-2",
        active
          ? "bg-white/12 text-white"
          : "text-white/60 hover:bg-white/8 hover:text-white",
      )}
    >
      {active ? (
        <span
          aria-hidden
          className="absolute top-1/2 left-0 h-5 w-0.5 -translate-y-1/2 rounded-r-full bg-brand-soft2"
        />
      ) : null}
      <Icon className={cn("size-4.5 shrink-0", active ? "text-white" : "text-white/55")} />
      {!collapsed ? (
        <span className="min-w-0 flex-1">
          <span className="block truncate">{item.label}</span>
          {showDescription ? (
            <span className="block truncate text-[0.6875rem] font-normal text-white/40">
              {item.description}
            </span>
          ) : null}
        </span>
      ) : null}
      {badge > 0 ? (
        collapsed ? (
          <span className="absolute top-1.5 right-2 size-1.5 rounded-full bg-danger" />
        ) : (
          <span className="ml-auto inline-flex min-w-5 shrink-0 items-center justify-center rounded-full bg-danger px-1.5 py-0.5 text-[0.625rem] font-semibold text-white">
            {badge > 99 ? "99+" : badge}
          </span>
        )
      ) : null}
    </Link>
  );
}
