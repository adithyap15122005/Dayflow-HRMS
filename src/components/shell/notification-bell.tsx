"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Bell, Check } from "lucide-react";

import { api } from "@/lib/client/api";
import { cn } from "@/lib/cn";
import { formatRelative } from "@/lib/domain/time";

type NotificationRow = {
  id: string;
  type: string;
  title: string;
  body: string;
  href: string | null;
  readAt: string | null;
  createdAt: string;
};

const TYPE_TONE: Record<string, string> = {
  LEAVE_APPROVED: "bg-success",
  LEAVE_REJECTED: "bg-danger",
  LEAVE_SUBMITTED: "bg-warning",
  LEAVE_CANCELLED: "bg-ink-4",
  PAYSLIP_READY: "bg-brand",
  SALARY_UPDATED: "bg-brand",
  PROFILE_UPDATED: "bg-info",
  ATTENDANCE_MISSING: "bg-warning",
  ANNOUNCEMENT: "bg-tone-violet",
};

/**
 * Notification bell.
 *
 * The unread count is rendered from the server on first paint, then refreshed
 * when the panel is opened — no polling loop, so the app stays quiet when idle.
 */
export function NotificationBell({ initialUnread }: { initialUnread: number }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(initialUnread);
  const [rows, setRows] = useState<NotificationRow[] | null>(null);
  const [loading, setLoading] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setUnread(initialUnread);
  }, [initialUnread]);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    void api
      .get<{ notifications: NotificationRow[]; unread: number }>(
        "/api/notifications?take=8",
      )
      .then((data) => {
        setRows(data.notifications);
        setUnread(data.unread);
      })
      .catch(() => setRows([]))
      .finally(() => setLoading(false));
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!panelRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  async function markAllRead() {
    setUnread(0);
    setRows((current) =>
      current?.map((row) => ({ ...row, readAt: row.readAt ?? new Date().toISOString() })) ??
      null,
    );
    try {
      await api.post("/api/notifications/read", { all: true });
      router.refresh();
    } catch {
      // Non-critical: the panel already reflects the intent, and the next open
      // re-reads the server state.
    }
  }

  return (
    <div className="relative" ref={panelRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={unread > 0 ? `Notifications, ${unread} unread` : "Notifications"}
        aria-expanded={open}
        className={cn(
          "relative rounded-md p-2 text-ink-2 transition-colors hover:bg-surface-3",
          open && "bg-surface-3",
        )}
      >
        <Bell className="size-4.5" />
        {unread > 0 ? (
          <span className="absolute top-1 right-1 grid min-w-4 place-items-center rounded-full bg-danger px-1 text-[0.5625rem] leading-4 font-semibold text-white">
            {unread > 9 ? "9+" : unread}
          </span>
        ) : null}
      </button>

      {open ? (
        <div className="animate-rise absolute right-0 z-50 mt-2 w-[min(22rem,calc(100vw-1.5rem))] overflow-hidden rounded-xl border border-line bg-surface shadow-e3">
          <header className="flex items-center justify-between gap-2 border-b border-line px-4 py-3">
            <div>
              <p className="text-[0.875rem] font-semibold">Notifications</p>
              <p className="text-[0.6875rem] text-ink-3">
                {unread > 0 ? `${unread} unread` : "You are all caught up"}
              </p>
            </div>
            {unread > 0 ? (
              <button
                type="button"
                onClick={() => void markAllRead()}
                className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[0.75rem] font-medium text-brand transition-colors hover:bg-brand-soft"
              >
                <Check className="size-3.5" />
                Mark all read
              </button>
            ) : null}
          </header>

          <div className="max-h-[24rem] overflow-y-auto">
            {loading && !rows ? (
              <div className="space-y-3 p-4">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="flex gap-3">
                    <div className="skeleton size-2 shrink-0 rounded-full" />
                    <div className="flex-1 space-y-1.5">
                      <div className="skeleton h-3 w-2/3 rounded" />
                      <div className="skeleton h-2.5 w-full rounded" />
                    </div>
                  </div>
                ))}
              </div>
            ) : rows && rows.length > 0 ? (
              <ul className="divide-y divide-line">
                {rows.map((row) => {
                  const inner = (
                    <>
                      <span
                        aria-hidden
                        className={cn(
                          "mt-1.5 size-2 shrink-0 rounded-full",
                          TYPE_TONE[row.type] ?? "bg-ink-4",
                        )}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="flex items-baseline justify-between gap-2">
                          <span className="truncate text-[0.8125rem] font-medium text-ink">
                            {row.title}
                          </span>
                          <span className="shrink-0 text-[0.625rem] text-ink-4">
                            {formatRelative(row.createdAt)}
                          </span>
                        </span>
                        <span className="mt-0.5 block text-[0.75rem] leading-snug text-ink-2">
                          {row.body}
                        </span>
                      </span>
                    </>
                  );
                  const shell = cn(
                    "flex gap-2.5 px-4 py-3 transition-colors",
                    row.href && "hover:bg-surface-2",
                    !row.readAt && "bg-brand-soft/40",
                  );
                  return (
                    <li key={row.id}>
                      {row.href ? (
                        <Link href={row.href} onClick={() => setOpen(false)} className={shell}>
                          {inner}
                        </Link>
                      ) : (
                        <div className={shell}>{inner}</div>
                      )}
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="px-4 py-10 text-center text-[0.8125rem] text-ink-3">
                Nothing yet. Approvals, payslips and announcements will show up here.
              </p>
            )}
          </div>

          <Link
            href="/notifications"
            onClick={() => setOpen(false)}
            className="block border-t border-line bg-surface-2 px-4 py-2.5 text-center text-[0.8125rem] font-medium text-brand transition-colors hover:bg-brand-soft"
          >
            Open notification centre
          </Link>
        </div>
      ) : null}
    </div>
  );
}
