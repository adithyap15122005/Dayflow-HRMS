import "server-only";

import { prisma } from "@/lib/db";
import { EMPLOYED_STATUSES } from "@/lib/domain/constants";
import {
  buildAttentionQueue,
  nonWorkingReason,
  type AttentionFlag,
} from "@/lib/domain/rules";
import {
  addWorkDays,
  eachWorkDate,
  periodOf,
  startOfMonth,
  startOfWeek,
  type WorkDate,
} from "@/lib/domain/time";
import {
  findChronicLate,
  findUnclosedRecords,
  getAttendanceSeries,
  getAttendanceTrend,
  getLiveWorkforce,
  summariseAttendance,
} from "./attendance";
import { listActivity } from "./audit";
import { getLeaveBalances, getPendingLeave, getUpcomingLeave } from "./leave";
import { approvedLeaveDates } from "./leave-calendar";
import { getHolidaySet, getOrgContext } from "./org";
import { findMissingSalaryStructures, getHeadcountStats } from "./people";
import { getPayrollOverview, listPayslips } from "./payroll";
import type { Actor } from "@/lib/domain/rules";

/** Absence rate per department over a trailing window. */
async function departmentAbsence(today: WorkDate, windowDays: number) {
  const from = addWorkDays(today, -(windowDays - 1));
  const employees = await prisma.employee.findMany({
    where: { status: { in: EMPLOYED_STATUSES } },
    select: {
      id: true,
      weeklyOffCsv: true,
      department: { select: { name: true } },
    },
  });
  const ids = employees.map((e) => e.id);

  const [attendance, holidays, leaveMap] = await Promise.all([
    prisma.attendance.findMany({
      where: { employeeId: { in: ids }, workDate: { gte: from, lte: today } },
      select: { employeeId: true, workDate: true, status: true },
    }),
    getHolidaySet(from, today),
    approvedLeaveDates(ids, from, today),
  ]);

  const key = (e: string, d: string) => `${e}|${d}`;
  const statusByKey = new Map(
    attendance.map((a) => [key(a.employeeId, a.workDate), a.status]),
  );
  const days = eachWorkDate(from, today);
  const buckets = new Map<string, { expected: number; absent: number }>();

  for (const employee of employees) {
    const name = employee.department?.name ?? "Unassigned";
    const bucket = buckets.get(name) ?? { expected: 0, absent: 0 };
    for (const day of days) {
      const reason = nonWorkingReason({
        date: day,
        weeklyOffCsv: employee.weeklyOffCsv,
        holidayNames: holidays,
        approvedLeaveDates: leaveMap.get(employee.id) ?? new Set(),
      });
      if (reason === "WEEK_OFF" || reason === "HOLIDAY") continue;
      bucket.expected += 1;
      const status = statusByKey.get(key(employee.id, day)) ?? reason ?? "ABSENT";
      if (status === "ABSENT") bucket.absent += 1;
      else if (status === "HALF_DAY") bucket.absent += 0.5;
    }
    buckets.set(name, bucket);
  }

  return [...buckets.entries()]
    .map(([department, v]) => ({
      department,
      expected: v.expected,
      absent: v.absent,
      ratePct: v.expected > 0 ? Math.round((v.absent / v.expected) * 1000) / 10 : 0,
    }))
    .sort((a, b) => b.ratePct - a.ratePct);
}

export type CommandCentre = Awaited<ReturnType<typeof getCommandCentre>>;

/**
 * Everything the HR command centre renders, in one round of queries.
 *
 * Nothing here is estimated or randomised: each number is a count or an average
 * over rows in the database, and each attention flag names the rule that produced
 * it so an HR user can audit the screen.
 */
export async function getCommandCentre() {
  const org = await getOrgContext();
  const today = org.today;

  const [
    live,
    trend,
    pendingLeave,
    chronicLate,
    unclosed,
    missingSalary,
    absence,
    headcount,
    payroll,
    activity,
    upcoming,
  ] = await Promise.all([
    getLiveWorkforce(org),
    getAttendanceTrend(30, {}, org),
    getPendingLeave(50),
    findChronicLate(14, 3, org),
    findUnclosedRecords(25, org),
    findMissingSalaryStructures(),
    departmentAbsence(today, 30),
    getHeadcountStats(),
    getPayrollOverview(org),
    listActivity({ take: 12 }),
    getUpcomingLeave(null, org, 6),
  ]);

  const attention: AttentionFlag[] = buildAttentionQueue(
    {
      today,
      pendingLeave: pendingLeave.map((p) => ({
        id: p.id,
        createdAt: new Date(p.createdAt),
        employeeName: p.employeeName,
      })),
      chronicLate,
      missingCheckout: unclosed.map((u) => ({
        employeeId: u.employeeId,
        name: u.name,
        workDate: u.workDate,
      })),
      missingSalary,
      highAbsence: absence.map((a) => ({ department: a.department, ratePct: a.ratePct })),
      unaccountedToday: live.rows
        .filter((r) => r.status === "ABSENT" && !r.checkInAt)
        .map((r) => ({ employeeId: r.employeeId, name: r.name })),
      payrollPeriod: payroll.currentPeriodLabel,
      payrollStatus: payroll.currentRun?.status ?? null,
    },
    new Date(),
  );

  // Week-to-date average hours, so the header states a real productivity figure.
  const weekStart = startOfWeek(today);
  const weekRows = await prisma.attendance.aggregate({
    where: { workDate: { gte: weekStart, lte: today }, checkOutAt: { not: null } },
    _sum: { workedMinutes: true },
    _count: { _all: true },
  });

  return {
    org,
    today,
    live,
    trend,
    attention,
    pendingLeave,
    unclosed,
    absence,
    headcount,
    payroll,
    upcoming,
    activity: activity.map((a) => ({
      id: a.id,
      action: a.action,
      actorName: a.actorName,
      summary: a.summary,
      createdAt: a.createdAt.toISOString(),
      employeeId: a.employeeId,
    })),
    weekAverageMinutes:
      weekRows._count._all > 0
        ? Math.round((weekRows._sum.workedMinutes ?? 0) / weekRows._count._all)
        : 0,
    completedDaysThisWeek: weekRows._count._all,
  };
}

export type EmployeeHome = Awaited<ReturnType<typeof getEmployeeHome>>;

/** The employee overview: "what do I need to know about today?" */
export async function getEmployeeHome(actor: Actor, employeeId: string) {
  const org = await getOrgContext();
  const today = org.today;
  const year = Number(today.slice(0, 4));

  const [monthDays, weekDays, balances, myLeave, upcoming, payslips, activity, employee] =
    await Promise.all([
      getAttendanceSeries(employeeId, startOfMonth(today), today, org),
      getAttendanceSeries(employeeId, startOfWeek(today), addWorkDays(startOfWeek(today), 6), org),
      getLeaveBalances(employeeId, year),
      prisma.leaveRequest.findMany({
        where: { employeeId },
        include: { leaveType: true },
        orderBy: { createdAt: "desc" },
        take: 5,
      }),
      getUpcomingLeave(employeeId, org, 3),
      listPayslips(actor, { employeeId, take: 6 }),
      listActivity({ employeeId, take: 8 }),
      prisma.employee.findUnique({
        where: { id: employeeId },
        select: {
          firstName: true,
          lastName: true,
          jobTitle: true,
          shiftStart: true,
          shiftEnd: true,
          avatarColor: true,
          manager: { select: { firstName: true, lastName: true, jobTitle: true, avatarColor: true } },
          department: { select: { name: true } },
        },
      }),
    ]);

  const monthTotals = summariseAttendance(monthDays);
  const weekTotals = summariseAttendance(
    weekDays.filter((d) => d.workDate <= today),
  );

  const teamOnLeaveToday = employee?.department
    ? await prisma.leaveRequest.findMany({
        where: {
          status: "APPROVED",
          startDate: { lte: today },
          endDate: { gte: today },
          employee: { department: { name: employee.department.name } },
          NOT: { employeeId },
        },
        include: {
          leaveType: { select: { name: true } },
          employee: {
            select: { id: true, firstName: true, lastName: true, avatarColor: true },
          },
        },
        take: 5,
      })
    : [];

  return {
    org,
    today,
    employee,
    monthDays,
    monthTotals,
    weekDays,
    weekTotals,
    balances,
    requests: myLeave.map((r) => ({
      id: r.id,
      leaveType: r.leaveType.name,
      tone: r.leaveType.tone,
      startDate: r.startDate,
      endDate: r.endDate,
      workingDays: r.workingDays,
      status: r.status,
      reason: r.reason,
      decisionComment: r.decisionComment,
      createdAt: r.createdAt.toISOString(),
    })),
    upcoming,
    payslips,
    activity: activity.map((a) => ({
      id: a.id,
      action: a.action,
      actorName: a.actorName,
      summary: a.summary,
      createdAt: a.createdAt.toISOString(),
    })),
    teamOnLeaveToday: teamOnLeaveToday.map((r) => ({
      id: r.id,
      name: `${r.employee.firstName} ${r.employee.lastName}`,
      avatarColor: r.employee.avatarColor,
      leaveType: r.leaveType.name,
      endDate: r.endDate,
    })),
    nextPayrollPeriod: periodOf(today),
  };
}
