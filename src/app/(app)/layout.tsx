import { redirect } from "next/navigation";
import type { ReactNode } from "react";

import { AppShell } from "@/components/shell/app-shell";
import { getCurrentUser } from "@/lib/auth/guard";
import { prisma } from "@/lib/db";
import { EMPLOYED_STATUSES, isManagement } from "@/lib/domain/constants";
import { getOrgContext } from "@/lib/services/org";

/**
 * Authenticated shell.
 *
 * Middleware has already rejected requests without a valid token; this layout is
 * the real gate — it re-reads the user, so a revoked account or changed role
 * takes effect immediately, and it refuses to render the app for an unverified
 * address.
 */
export default async function AppLayout({ children }: { children: ReactNode }) {
  const user = await getCurrentUser();
  // `?expired` tells the proxy to drop the stale cookie, so a revoked or
  // deactivated token cannot bounce between here and the sign-in screen.
  if (!user) redirect("/sign-in?expired=1");
  if (!user.emailVerified) redirect("/sign-in?expired=1&unverified=1");

  const management = isManagement(user.role);
  const org = await getOrgContext();

  const [unreadNotifications, pendingLeave, unclosed, missingSalary] = await Promise.all([
    prisma.notification.count({ where: { userId: user.userId, readAt: null } }),
    management
      ? prisma.leaveRequest.count({ where: { status: "PENDING" } })
      : prisma.leaveRequest.count({
          where: { employeeId: user.employeeId ?? "__none__", status: "PENDING" },
        }),
    management
      ? prisma.attendance.count({
          where: {
            checkInAt: { not: null },
            checkOutAt: null,
            workDate: { lt: org.today },
          },
        })
      : Promise.resolve(0),
    management
      ? prisma.employee.count({
          where: { status: { in: EMPLOYED_STATUSES }, salaryStructure: null },
        })
      : Promise.resolve(0),
  ]);

  return (
    <AppShell
      user={{
        fullName: user.fullName,
        email: user.email,
        role: user.role,
        jobTitle: user.jobTitle,
        department: user.departmentName,
        avatarColor: user.avatarColor,
        employeeId: user.employeeId,
        employeeCode: user.employeeCode,
      }}
      counts={{
        unreadNotifications,
        pendingLeave,
        // The overview badge counts open HR work items, matching the rules that
        // drive the attention queue on that page.
        attention: management ? pendingLeave + unclosed + missingSalary : 0,
      }}
    >
      {children}
    </AppShell>
  );
}
