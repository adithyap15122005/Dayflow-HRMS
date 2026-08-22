"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Bell, Check, Inbox } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/states";
import { SegmentedLinks } from "@/components/ui/tabs";
import { useToast } from "@/components/ui/toast";
import { api, describeError } from "@/lib/client/api";
import { cn } from "@/lib/cn";
import { formatRelative, formatWorkDate, toWorkDate } from "@/lib/domain/time";

export type NotificationRow = {
  id: string;
  type: string;
  title: string;
  body: string;
  href: string | null;
  readAt: string | null;
  createdAt: string;
};

const TYPE_META: Record<string, { dot: string; label: string }> = {
  LEAVE_SUBMITTED: { dot: "bg-warning", label: "Leave request" },
  LEAVE_APPROVED: { dot: "bg-success", label: "Leave approved" },
  LEAVE_REJECTED: { dot: "bg-danger", label: "Leave rejected" },
  LEAVE_CANCELLED: { dot: "bg-ink-4", label: "Leave withdrawn" },
  PAYSLIP_READY: { dot: "bg-brand", label: "Payslip" },
  SALARY_UPDATED: { dot: "bg-brand", label: "Compensation" },
  PROFILE_UPDATED: { dot: "bg-info", label: "Profile" },
  ATTENDANCE_MISSING: { dot: "bg-warning", label: "Attendance" },
  ANNOUNCEMENT: { dot: "bg-tone-violet", label: "Announcement" },
};

/**
 * Notification centre.
 *
 * Grouped by day, with unread state that is genuinely persisted — marking read
 * writes to the database and the badge in the shell updates on refresh.
 */
export function NotificationCentre({
  initial,
  unread,
  filter,
  timezone,
  today,
}: {
  initial: NotificationRow[];
  unread: number;
  filter: "all" | "unread";
  timezone: string;
  today: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const [rows, setRows] = useState(initial);
  const [count, setCount] = useState(unread);
  const [busy, setBusy] = useState(false);

  async function markAll() {
    setBusy(true);
    try {
      const result = await api.post<{ updated: number; unread: number }>(
        "/api/notifications/read",
        { all: true },
      );
      setRows((current) =>
        current.map((row) => ({ ...row, readAt: row.readAt ?? new Date().toISOString() })),
      );
      setCount(result.unread);
      toast.success(
        result.updated > 0 ? `${result.updated} marked as read` : "Nothing left to read",
      );
      router.refresh();
    } catch (caught) {
      toast.error(describeError(caught).message);
    } finally {
      setBusy(false);
    }
  }

  async function markOne(id: string) {
    setRows((current) =>
      current.map((row) =>
        row.id === id ? { ...row, readAt: row.readAt ?? new Date().toISOString() } : row,
      ),
    );
    setCount((c) => Math.max(0, c - 1));
    try {
      await api.post("/api/notifications/read", { ids: [id] });
      router.refresh();
    } catch {
      // The optimistic state is harmless; the next load re-reads the truth.
    }
  }

  // Group by the org-local calendar day the notification was created on.
  const groups = new Map<string, NotificationRow[]>();
  for (const row of rows) {
    const day = toWorkDate(new Date(row.createdAt), timezone);
    const bucket = groups.get(day) ?? [];
    bucket.push(row);
    groups.set(day, bucket);
  }

  return (
    <Card>
      <CardHeader
        icon={<Bell className="size-4" />}
        title="Notifications"
        subtitle={
          count > 0
            ? `${count} unread. Approvals, payslips and announcements all land here.`
            : "You are all caught up."
        }
        actions={
          <div className="flex items-center gap-2">
            <SegmentedLinks
              label="Filter"
              active={filter}
              hrefFor={(id) => (id === "all" ? "/notifications" : "/notifications?filter=unread")}
              options={[
                { id: "all", label: "All" },
                { id: "unread", label: `Unread${count > 0 ? ` (${count})` : ""}` },
              ]}
            />
            {count > 0 ? (
              <Button variant="secondary" size="sm" loading={busy} onClick={() => void markAll()}>
                <Check className="size-3.5" />
                Mark all read
              </Button>
            ) : null}
          </div>
        }
      />

      {rows.length === 0 ? (
        <EmptyState
          icon={<Inbox className="size-5" />}
          title={filter === "unread" ? "Nothing unread" : "No notifications yet"}
          description={
            filter === "unread"
              ? "Every notification has been read. Switch to All to see the history."
              : "Dayflow notifies you when leave is decided, a payslip is ready, HR updates your record, or an announcement goes out."
          }
        />
      ) : (
        <div className="divide-y divide-line">
          {[...groups.entries()].map(([day, items]) => (
            <section key={day}>
              <h3 className="sticky top-15 z-1 border-b border-line bg-surface-2/95 px-4 py-1.5 text-[0.6875rem] font-semibold tracking-wider text-ink-3 uppercase backdrop-blur-sm sm:px-5">
                {day === today ? "Today" : formatWorkDate(day, "long")}
              </h3>
              <ul className="divide-y divide-line">
                {items.map((row) => {
                  const meta = TYPE_META[row.type] ?? { dot: "bg-ink-4", label: row.type };
                  const isUnread = !row.readAt;
                  return (
                    <li
                      key={row.id}
                      className={cn(
                        "flex gap-3 px-4 py-3.5 transition-colors sm:px-5",
                        isUnread && "bg-brand-soft/35",
                      )}
                    >
                      <span
                        aria-hidden
                        className={cn("mt-1.5 size-2 shrink-0 rounded-full", meta.dot)}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                          <p className="text-[0.875rem] font-semibold text-ink">{row.title}</p>
                          <Badge tone="neutral" size="sm">
                            {meta.label}
                          </Badge>
                          {isUnread ? (
                            <Badge tone="brand" size="sm" dot>
                              New
                            </Badge>
                          ) : null}
                        </div>
                        <p className="mt-1 text-[0.8125rem] leading-relaxed text-ink-2">
                          {row.body}
                        </p>
                        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
                          <span className="text-[0.6875rem] text-ink-4">
                            {formatRelative(row.createdAt)}
                          </span>
                          {row.href ? (
                            <Link
                              href={row.href}
                              onClick={() => isUnread && void markOne(row.id)}
                              className="text-[0.75rem] font-medium text-brand hover:underline"
                            >
                              Open
                            </Link>
                          ) : null}
                          {isUnread ? (
                            <button
                              type="button"
                              onClick={() => void markOne(row.id)}
                              className="text-[0.75rem] font-medium text-ink-3 hover:text-ink"
                            >
                              Mark read
                            </button>
                          ) : null}
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      )}
    </Card>
  );
}
