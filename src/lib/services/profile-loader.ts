import "server-only";

import { requireActor, type CurrentUser } from "@/lib/auth/guard";
import { isManagement } from "@/lib/domain/constants";
import { formatPeriod, periodOf, startOfMonth, endOfMonth } from "@/lib/domain/time";
import {
  getAttendanceSeries,
  summariseAttendance,
} from "@/lib/services/attendance";
import { listActivity } from "@/lib/services/audit";
import { getLeaveBalances, listLeaveRequests } from "@/lib/services/leave";
import { getOrgContext } from "@/lib/services/org";
import { getSalaryStructure, listPayslips } from "@/lib/services/payroll";
import { getEmployeeProfile, listDepartments, listManagerOptions } from "@/lib/services/people";
import type { Actor } from "@/lib/domain/rules";
import type { ProfileTabData } from "@/components/people/profile-view";

export const PROFILE_TAB_IDS = [
  "overview",
  "personal",
  "employment",
  "attendance",
  "leave",
  "payroll",
  "documents",
  "activity",
] as const;

/**
 * Load exactly the data a profile tab needs.
 *
 * Tabs are URL-driven, so the server can skip work the viewer is not looking at —
 * opening "Personal" does not run attendance or payroll queries at all.
 */
export async function loadProfile(employeeId: string, tabParam: string | undefined) {
  const { user, actor } = await requireActor();
  const tab = (PROFILE_TAB_IDS as readonly string[]).includes(tabParam ?? "")
    ? (tabParam as string)
    : "overview";

  const org = await getOrgContext();
  const profile = await getEmployeeProfile(actor, employeeId);
  const data = await loadTabData(actor, employeeId, tab, org.today, profile.canSeeSalary);

  const needsPickers = profile.editableFields.length > 0;
  const [departments, managers] = needsPickers
    ? await Promise.all([listDepartments(), listManagerOptions()])
    : [[], []];

  return {
    user,
    actor,
    org,
    profile,
    tab: profile.canSeeSalary || tab !== "payroll" ? tab : "overview",
    data,
    departments: departments.map((d) => ({ id: d.id, name: d.name })),
    managers,
  };
}

async function loadTabData(
  actor: Actor,
  employeeId: string,
  tab: string,
  today: string,
  canSeeSalary: boolean,
): Promise<ProfileTabData> {
  const monthFrom = startOfMonth(today);
  const monthTo = endOfMonth(today);

  // An employee viewing their own record must ask for "me" scope: organisation
  // scope is refused outright for non-management rather than silently narrowed.
  const leaveQuery = isManagement(actor.role)
    ? ({ scope: "org", employeeId } as const)
    : ({ scope: "me" } as const);

  const attendanceForMonth = async () => {
    const days = await getAttendanceSeries(employeeId, monthFrom, monthTo);
    return {
      days,
      totals: summariseAttendance(days.filter((d) => d.workDate <= today)),
      monthLabel: formatPeriod(periodOf(today)),
    };
  };

  switch (tab) {
    case "overview": {
      const [attendance, balances, leave, activity] = await Promise.all([
        attendanceForMonth(),
        getLeaveBalances(employeeId, Number(today.slice(0, 4))),
        listLeaveRequests(actor, { ...leaveQuery, take: 8 }),
        listActivity({ employeeId, take: 8 }),
      ]);
      return {
        attendance,
        balances,
        leave,
        activity: activity.map(toActivityItem),
      };
    }
    case "attendance":
      return { attendance: await attendanceForMonth() };
    case "leave": {
      const [balances, leave] = await Promise.all([
        getLeaveBalances(employeeId, Number(today.slice(0, 4))),
        listLeaveRequests(actor, { ...leaveQuery, take: 60 }),
      ]);
      return { balances, leave };
    }
    case "payroll": {
      if (!canSeeSalary) return {};
      const [salary, payslips] = await Promise.all([
        getSalaryStructure(actor, employeeId),
        listPayslips(actor, { employeeId, take: 24 }),
      ]);
      return { salary, payslips };
    }
    case "activity": {
      const activity = await listActivity({ employeeId, take: 60 });
      return { activity: activity.map(toActivityItem) };
    }
    default:
      return {};
  }
}

function toActivityItem(event: {
  id: string;
  action: string;
  actorName: string;
  summary: string;
  createdAt: Date;
  employeeId: string | null;
}) {
  return {
    id: event.id,
    action: event.action,
    actorName: event.actorName,
    summary: event.summary,
    createdAt: event.createdAt.toISOString(),
    employeeId: event.employeeId,
  };
}

export type LoadedProfile = Awaited<ReturnType<typeof loadProfile>>;
export type { CurrentUser };
