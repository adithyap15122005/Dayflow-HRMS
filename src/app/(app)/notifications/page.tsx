import type { Metadata } from "next";

import { NotificationCentre } from "@/components/notifications/notification-centre";
import { PageHeader } from "@/components/ui/page";
import { requireVerifiedUser } from "@/lib/auth/guard";
import { prisma } from "@/lib/db";
import { getOrgContext } from "@/lib/services/org";
import { Bell } from "lucide-react";

export const metadata: Metadata = {
  title: "Notifications",
  description: "Approvals, payslips, profile changes and announcements.",
};

export const dynamic = "force-dynamic";

export default async function NotificationsPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>;
}) {
  const user = await requireVerifiedUser();
  const { filter } = await searchParams;
  const unreadOnly = filter === "unread";
  const org = await getOrgContext();

  const [rows, unread] = await Promise.all([
    prisma.notification.findMany({
      // Always scoped to the caller — there is no way to read another inbox.
      where: { userId: user.userId, ...(unreadOnly ? { readAt: null } : {}) },
      orderBy: { createdAt: "desc" },
      take: 80,
    }),
    prisma.notification.count({ where: { userId: user.userId, readAt: null } }),
  ]);

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow={
          <>
            <Bell className="size-3.5" />
            {unread > 0 ? `${unread} unread` : "Nothing unread"}
          </>
        }
        title="Notifications"
        description="Every entry was written by an actual operation in Dayflow — a leave decision, a payroll run, an HR edit, or an announcement."
      />

      <NotificationCentre
        initial={rows.map((row) => ({
          id: row.id,
          type: row.type,
          title: row.title,
          body: row.body,
          href: row.href,
          readAt: row.readAt?.toISOString() ?? null,
          createdAt: row.createdAt.toISOString(),
        }))}
        unread={unread}
        filter={unreadOnly ? "unread" : "all"}
        timezone={org.timezone}
        today={org.today}
      />
    </div>
  );
}
