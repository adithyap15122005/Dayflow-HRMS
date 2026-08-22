import "server-only";

import { prisma } from "@/lib/db";
import {
  isManagement,
  WORKING_ATTENDANCE,
  type AttendanceStatus,
} from "@/lib/domain/constants";
import {
  canCheckIn,
  canCheckOut,
  deriveCompletedStatus,
  earlyExitMinutesFor,
  isWeeklyOff,
  lateMinutesFor,
  nonWorkingReason,
  workedMinutesBetween,
  type Actor,
} from "@/lib/domain/rules";
import {
  addWorkDays,
  endOfMonth,
  eachWorkDate,
  minutesSinceMidnight,
  startOfMonth,
  toWorkDate,
  workDateTimeUtc,
  type WorkDate,
} from "@/lib/domain/time";
import { forbidden, invalidState, notFound } from "@/lib/errors";
import { recordEvent } from "./audit";
import { approvedLeaveDates, approvedLeaveDatesFor } from "./leave-calendar";
import { getHolidaySet, getOrgContext, type OrgContext } from "./org";

export type TodayState = {
  workDate: WorkDate;
  status: AttendanceStatus | "NOT_STARTED";
  checkInAt: string | null;
  checkOutAt: string | null;
  /** Minutes worked so far — live for an open day, final once checked out. */
  workedMinutes: number;
  lateMinutes: number;
  isOpen: boolean;
  nonWorking: "WEEK_OFF" | "HOLIDAY" | "LEAVE" | null;
  shiftStart: string;
  shiftEnd: string;
  standardWorkMinutes: number;
  canCheckIn: boolean;
  canCheckOut: boolean;
  blockedReason: string | null;
};

async function loadEmployeeOrThrow(employeeId: string) {
  const employee = await prisma.employee.findUnique({
    where: { id: employeeId },
    select: {
      id: true,
      userId: true,
      firstName: true,
      lastName: true,
      shiftStart: true,
      shiftEnd: true,
      weeklyOffCsv: true,
      status: true,
      departmentId: true,
    },
  });
  if (!employee) throw notFound("Employee");
  return employee;
}

/** Live "today" panel for one employee. */
export async function getTodayState(
  employeeId: string,
  org?: OrgContext,
): Promise<TodayState> {
  const context = org ?? (await getOrgContext());
  const employee = await loadEmployeeOrThrow(employeeId);
  const today = context.today;

  const [existing, holidays, leaveDays] = await Promise.all([
    prisma.attendance.findUnique({
      where: { employeeId_workDate: { employeeId, workDate: today } },
    }),
    getHolidaySet(today, today),
    approvedLeaveDatesFor(employeeId, today, today),
  ]);

  const nonWorking = nonWorkingReason({
    date: today,
    weeklyOffCsv: employee.weeklyOffCsv,
    holidayNames: holidays,
    approvedLeaveDates: leaveDays,
  });

  const facts = {
    existing: existing
      ? {
          checkInAt: existing.checkInAt,
          checkOutAt: existing.checkOutAt,
          status: existing.status,
        }
      : null,
    nonWorking,
  };
  const inCheck = canCheckIn(facts);
  const outCheck = canCheckOut(facts);

  const isOpen = Boolean(existing?.checkInAt && !existing?.checkOutAt);
  const workedMinutes = existing?.checkOutAt
    ? existing.workedMinutes
    : existing?.checkInAt
      ? workedMinutesBetween(existing.checkInAt, new Date())
      : 0;

  const status: TodayState["status"] = existing
    ? (existing.status as AttendanceStatus)
    : nonWorking
      ? nonWorking
      : "NOT_STARTED";

  return {
    workDate: today,
    status,
    checkInAt: existing?.checkInAt?.toISOString() ?? null,
    checkOutAt: existing?.checkOutAt?.toISOString() ?? null,
    workedMinutes,
    lateMinutes: existing?.lateMinutes ?? 0,
    isOpen,
    nonWorking,
    shiftStart: employee.shiftStart,
    shiftEnd: employee.shiftEnd,
    standardWorkMinutes: context.policy.standardWorkMinutes,
    canCheckIn: inCheck.ok,
    canCheckOut: outCheck.ok,
    // Surface the reason only when neither action is available, so the UI can
    // explain a locked day (already completed, on leave) rather than showing a
    // disabled button with no context.
    blockedReason:
      !inCheck.ok && !outCheck.ok && "reason" in inCheck ? inCheck.reason : null,
  };
}

/* --------------------------------------------------------------- mutations */

export async function checkIn(
  actor: Actor,
  employeeId: string,
  note: string | null,
): Promise<TodayState> {
  if (actor.employeeId !== employeeId) {
    throw forbidden(
      "You can only record your own check-in.",
      "HR can correct someone else's day from Attendance → Adjust.",
    );
  }
  const org = await getOrgContext();
  const employee = await loadEmployeeOrThrow(employeeId);
  const today = org.today;

  const [existing, holidays, leaveDays] = await Promise.all([
    prisma.attendance.findUnique({
      where: { employeeId_workDate: { employeeId, workDate: today } },
    }),
    getHolidaySet(today, today),
    approvedLeaveDatesFor(employeeId, today, today),
  ]);

  const nonWorking = nonWorkingReason({
    date: today,
    weeklyOffCsv: employee.weeklyOffCsv,
    holidayNames: holidays,
    approvedLeaveDates: leaveDays,
  });

  const verdict = canCheckIn({
    existing: existing
      ? { checkInAt: existing.checkInAt, checkOutAt: existing.checkOutAt, status: existing.status }
      : null,
    nonWorking,
  });
  if (!verdict.ok) throw invalidState(verdict.reason, verdict.hint);

  const now = new Date();
  const lateMinutes = lateMinutesFor(
    minutesSinceMidnight(now, org.timezone),
    employee.shiftStart,
    org.policy,
  );

  // A week-off/holiday check-in is legitimate overtime, so it is recorded as
  // PRESENT rather than being blocked; the day keeps its holiday note.
  await prisma.attendance.upsert({
    where: { employeeId_workDate: { employeeId, workDate: today } },
    create: {
      employeeId,
      workDate: today,
      checkInAt: now,
      status: "PRESENT",
      lateMinutes,
      source: "SELF",
      note: note ?? (nonWorking ? `Worked on ${nonWorking.toLowerCase().replace("_", " ")}` : null),
    },
    update: { checkInAt: now, status: "PRESENT", lateMinutes, note: note ?? undefined },
  });

  await recordEvent({
    actorUserId: actor.userId,
    actorName: `${employee.firstName} ${employee.lastName}`,
    employeeId,
    action: "CHECK_IN",
    entityType: "Attendance",
    entityId: today,
    summary: lateMinutes > 0 ? `Checked in ${lateMinutes} min late` : "Checked in",
    meta: { workDate: today, lateMinutes },
  });

  return getTodayState(employeeId, org);
}

export async function checkOut(
  actor: Actor,
  employeeId: string,
  note: string | null,
): Promise<TodayState> {
  if (actor.employeeId !== employeeId) {
    throw forbidden("You can only record your own check-out.");
  }
  const org = await getOrgContext();
  const employee = await loadEmployeeOrThrow(employeeId);
  const today = org.today;

  const existing = await prisma.attendance.findUnique({
    where: { employeeId_workDate: { employeeId, workDate: today } },
  });

  const verdict = canCheckOut({
    existing: existing
      ? { checkInAt: existing.checkInAt, checkOutAt: existing.checkOutAt, status: existing.status }
      : null,
    nonWorking: null,
  });
  if (!verdict.ok) throw invalidState(verdict.reason, verdict.hint);

  const now = new Date();
  const checkInAt = existing!.checkInAt!;
  const workedMinutes = workedMinutesBetween(checkInAt, now);
  const status = deriveCompletedStatus(workedMinutes, org.policy);
  const earlyExitMinutes = earlyExitMinutesFor(
    minutesSinceMidnight(now, org.timezone),
    employee.shiftEnd,
  );

  await prisma.attendance.update({
    where: { employeeId_workDate: { employeeId, workDate: today } },
    data: {
      checkOutAt: now,
      workedMinutes,
      status,
      earlyExitMinutes,
      note: note ?? undefined,
    },
  });

  await recordEvent({
    actorUserId: actor.userId,
    actorName: `${employee.firstName} ${employee.lastName}`,
    employeeId,
    action: "CHECK_OUT",
    entityType: "Attendance",
    entityId: today,
    summary: `Checked out after ${Math.floor(workedMinutes / 60)}h ${workedMinutes % 60}m`,
    meta: { workDate: today, workedMinutes, status },
  });

  return getTodayState(employeeId, org);
}

/** HR correction for any day, including creating a missing record. */
export async function adjustAttendance(
  actor: Actor,
  actorName: string,
  input: {
    employeeId: string;
    workDate: WorkDate;
    status: AttendanceStatus;
    checkIn?: string | null;
    checkOut?: string | null;
    note?: string | null;
  },
) {
  if (!isManagement(actor.role)) {
    throw forbidden("Only HR and administrators can adjust attendance records.");
  }
  const org = await getOrgContext();
  const employee = await loadEmployeeOrThrow(input.employeeId);

  if (input.workDate > org.today) {
    throw invalidState(
      "Attendance cannot be recorded for a future date.",
      `Today in ${org.timezone} is ${org.today}.`,
    );
  }

  const checkInAt = input.checkIn
    ? workDateTimeUtc(input.workDate, input.checkIn, org.timezone)
    : null;
  const checkOutAt = input.checkOut
    ? workDateTimeUtc(input.workDate, input.checkOut, org.timezone)
    : null;

  const workedMinutes =
    checkInAt && checkOutAt ? workedMinutesBetween(checkInAt, checkOutAt) : 0;
  const lateMinutes = input.checkIn
    ? lateMinutesFor(
        Number(input.checkIn.slice(0, 2)) * 60 + Number(input.checkIn.slice(3, 5)),
        employee.shiftStart,
        org.policy,
      )
    : 0;
  const earlyExitMinutes = input.checkOut
    ? earlyExitMinutesFor(
        Number(input.checkOut.slice(0, 2)) * 60 + Number(input.checkOut.slice(3, 5)),
        employee.shiftEnd,
      )
    : 0;

  const record = await prisma.attendance.upsert({
    where: {
      employeeId_workDate: { employeeId: input.employeeId, workDate: input.workDate },
    },
    create: {
      employeeId: input.employeeId,
      workDate: input.workDate,
      status: input.status,
      checkInAt,
      checkOutAt,
      workedMinutes,
      lateMinutes,
      earlyExitMinutes,
      source: "HR_ADJUSTMENT",
      note: input.note ?? null,
    },
    update: {
      status: input.status,
      checkInAt,
      checkOutAt,
      workedMinutes,
      lateMinutes,
      earlyExitMinutes,
      source: "HR_ADJUSTMENT",
      note: input.note ?? null,
    },
  });

  await recordEvent({
    actorUserId: actor.userId,
    actorName,
    employeeId: input.employeeId,
    action: "ATTENDANCE_ADJUSTED",
    entityType: "Attendance",
    entityId: input.workDate,
    summary: `${employee.firstName} ${employee.lastName}'s ${input.workDate} set to ${input.status}`,
    meta: { workDate: input.workDate, status: input.status },
  });

  return record;
}

/* ------------------------------------------------------------------ reads */

export type AttendanceDay = {
  workDate: WorkDate;
  status: AttendanceStatus;
  checkInAt: string | null;
  checkOutAt: string | null;
  workedMinutes: number;
  lateMinutes: number;
  earlyExitMinutes: number;
  note: string | null;
  source: string;
  /** True when no row exists and the status was derived from the calendar. */
  derived: boolean;
};

/**
 * Day-by-day attendance for one employee.
 *
 * Rows only exist for days with real activity; every other day is *derived* from
 * the calendar (week off / holiday / approved leave / absent). That keeps the
 * database small and means history never needs a nightly job to backfill.
 */
export async function getAttendanceSeries(
  employeeId: string,
  from: WorkDate,
  to: WorkDate,
  org?: OrgContext,
): Promise<AttendanceDay[]> {
  const context = org ?? (await getOrgContext());
  const employee = await loadEmployeeOrThrow(employeeId);

  const [rows, holidays, leaveDays] = await Promise.all([
    prisma.attendance.findMany({
      where: { employeeId, workDate: { gte: from, lte: to } },
      orderBy: { workDate: "asc" },
    }),
    getHolidaySet(from, to),
    approvedLeaveDatesFor(employeeId, from, to),
  ]);

  const byDate = new Map(rows.map((r) => [r.workDate, r]));

  return eachWorkDate(from, to).map((workDate): AttendanceDay => {
    const row = byDate.get(workDate);
    if (row) {
      return {
        workDate,
        status: row.status as AttendanceStatus,
        checkInAt: row.checkInAt?.toISOString() ?? null,
        checkOutAt: row.checkOutAt?.toISOString() ?? null,
        workedMinutes: row.checkOutAt
          ? row.workedMinutes
          : row.checkInAt && workDate === context.today
            ? workedMinutesBetween(row.checkInAt, new Date())
            : row.workedMinutes,
        lateMinutes: row.lateMinutes,
        earlyExitMinutes: row.earlyExitMinutes,
        note: row.note,
        source: row.source,
        derived: false,
      };
    }

    const reason = nonWorkingReason({
      date: workDate,
      weeklyOffCsv: employee.weeklyOffCsv,
      holidayNames: holidays,
      approvedLeaveDates: leaveDays,
    });
    // A day in the future is not an absence — it simply has not happened yet, so
    // it is rendered as neutral rather than counted against the employee.
    const status: AttendanceStatus =
      reason ?? (workDate >= context.today ? "WEEK_OFF" : "ABSENT");

    return {
      workDate,
      status,
      checkInAt: null,
      checkOutAt: null,
      workedMinutes: 0,
      lateMinutes: 0,
      earlyExitMinutes: 0,
      note: null,
      source: "SYSTEM",
      derived: true,
    };
  });
}

export type AttendanceTotals = {
  present: number;
  halfDay: number;
  absent: number;
  leave: number;
  weekOff: number;
  holiday: number;
  workedMinutes: number;
  lateDays: number;
  expectedWorkingDays: number;
  attendanceRatePct: number;
  avgWorkedMinutes: number;
};

export function summariseAttendance(days: AttendanceDay[]): AttendanceTotals {
  const totals: AttendanceTotals = {
    present: 0,
    halfDay: 0,
    absent: 0,
    leave: 0,
    weekOff: 0,
    holiday: 0,
    workedMinutes: 0,
    lateDays: 0,
    expectedWorkingDays: 0,
    attendanceRatePct: 0,
    avgWorkedMinutes: 0,
  };

  for (const day of days) {
    totals.workedMinutes += day.workedMinutes;
    if (day.lateMinutes > 0) totals.lateDays += 1;
    switch (day.status) {
      case "PRESENT":
        totals.present += 1;
        break;
      case "HALF_DAY":
        totals.halfDay += 1;
        break;
      case "ABSENT":
        totals.absent += 1;
        break;
      case "LEAVE":
        totals.leave += 1;
        break;
      case "WEEK_OFF":
        totals.weekOff += 1;
        break;
      case "HOLIDAY":
        totals.holiday += 1;
        break;
    }
  }

  totals.expectedWorkingDays =
    totals.present + totals.halfDay + totals.absent + totals.leave;
  const credited = totals.present + totals.halfDay * 0.5;
  totals.attendanceRatePct =
    totals.expectedWorkingDays > 0
      ? Math.round((credited / totals.expectedWorkingDays) * 1000) / 10
      : 0;
  const workedDays = totals.present + totals.halfDay;
  totals.avgWorkedMinutes =
    workedDays > 0 ? Math.round(totals.workedMinutes / workedDays) : 0;

  return totals;
}

/** Organisation-wide snapshot for a single day. */
export type OrgDayRow = {
  employeeId: string;
  employeeCode: string;
  name: string;
  jobTitle: string;
  department: string | null;
  avatarColor: string;
  status: AttendanceStatus;
  checkInAt: string | null;
  checkOutAt: string | null;
  workedMinutes: number;
  lateMinutes: number;
  derived: boolean;
};

export async function getOrgDay(
  workDate: WorkDate,
  filters: { departmentId?: string; status?: AttendanceStatus } = {},
  org?: OrgContext,
): Promise<OrgDayRow[]> {
  const context = org ?? (await getOrgContext());

  const employees = await prisma.employee.findMany({
    where: {
      status: { not: "INACTIVE" },
      ...(filters.departmentId ? { departmentId: filters.departmentId } : {}),
    },
    select: {
      id: true,
      employeeCode: true,
      firstName: true,
      lastName: true,
      jobTitle: true,
      avatarColor: true,
      weeklyOffCsv: true,
      department: { select: { name: true } },
    },
    orderBy: [{ firstName: "asc" }],
  });

  const ids = employees.map((e) => e.id);
  const [rows, holidays, leaveMap] = await Promise.all([
    prisma.attendance.findMany({ where: { employeeId: { in: ids }, workDate } }),
    getHolidaySet(workDate, workDate),
    approvedLeaveDates(ids, workDate, workDate),
  ]);
  const byEmployee = new Map(rows.map((r) => [r.employeeId, r]));

  const result = employees.map((employee): OrgDayRow => {
    const row = byEmployee.get(employee.id);
    const reason = nonWorkingReason({
      date: workDate,
      weeklyOffCsv: employee.weeklyOffCsv,
      holidayNames: holidays,
      approvedLeaveDates: leaveMap.get(employee.id) ?? new Set(),
    });
    const status: AttendanceStatus = row
      ? (row.status as AttendanceStatus)
      : (reason ?? (workDate >= context.today ? "WEEK_OFF" : "ABSENT"));

    return {
      employeeId: employee.id,
      employeeCode: employee.employeeCode,
      name: `${employee.firstName} ${employee.lastName}`,
      jobTitle: employee.jobTitle,
      department: employee.department?.name ?? null,
      avatarColor: employee.avatarColor,
      status,
      checkInAt: row?.checkInAt?.toISOString() ?? null,
      checkOutAt: row?.checkOutAt?.toISOString() ?? null,
      workedMinutes: row?.checkOutAt
        ? row.workedMinutes
        : row?.checkInAt
          ? workedMinutesBetween(row.checkInAt, new Date())
          : 0,
      lateMinutes: row?.lateMinutes ?? 0,
      derived: !row,
    };
  });

  return filters.status ? result.filter((r) => r.status === filters.status) : result;
}

/** Live headline numbers for the HR command centre. */
export async function getLiveWorkforce(org?: OrgContext) {
  const context = org ?? (await getOrgContext());
  const rows = await getOrgDay(context.today, {}, context);

  const workingNow = rows.filter((r) => r.checkInAt && !r.checkOutAt).length;
  const present = rows.filter((r) => WORKING_ATTENDANCE.includes(r.status)).length;
  const onLeave = rows.filter((r) => r.status === "LEAVE").length;
  const late = rows.filter((r) => r.lateMinutes > 0).length;
  const expected = rows.filter(
    (r) => !["WEEK_OFF", "HOLIDAY"].includes(r.status),
  ).length;
  const unaccounted = rows.filter(
    (r) => r.status === "ABSENT" && !r.checkInAt,
  ).length;

  return {
    workDate: context.today,
    headcount: rows.length,
    expected,
    present,
    workingNow,
    onLeave,
    late,
    unaccounted,
    completed: rows.filter((r) => r.checkOutAt).length,
    presenceRatePct: expected > 0 ? Math.round((present / expected) * 100) : 0,
    rows,
  };
}

/** Trailing attendance trend for charts — one point per calendar day. */
export async function getAttendanceTrend(
  days: number,
  filters: { departmentId?: string } = {},
  org?: OrgContext,
) {
  const context = org ?? (await getOrgContext());
  const from = addWorkDays(context.today, -(days - 1));
  const to = context.today;

  const employees = await prisma.employee.findMany({
    where: {
      status: { not: "INACTIVE" },
      ...(filters.departmentId ? { departmentId: filters.departmentId } : {}),
    },
    select: { id: true, weeklyOffCsv: true },
  });
  const ids = employees.map((e) => e.id);

  const [rows, holidays, leaveMap] = await Promise.all([
    prisma.attendance.findMany({
      where: { employeeId: { in: ids }, workDate: { gte: from, lte: to } },
      select: { employeeId: true, workDate: true, status: true, lateMinutes: true },
    }),
    getHolidaySet(from, to),
    approvedLeaveDates(ids, from, to),
  ]);

  const key = (e: string, d: string) => `${e}|${d}`;
  const byKey = new Map(rows.map((r) => [key(r.employeeId, r.workDate), r]));

  return eachWorkDate(from, to).map((workDate) => {
    let present = 0;
    let absent = 0;
    let leave = 0;
    let late = 0;
    let expected = 0;

    for (const employee of employees) {
      const row = byKey.get(key(employee.id, workDate));
      const reason = nonWorkingReason({
        date: workDate,
        weeklyOffCsv: employee.weeklyOffCsv,
        holidayNames: holidays,
        approvedLeaveDates: leaveMap.get(employee.id) ?? new Set(),
      });
      const status = row?.status ?? reason ?? "ABSENT";
      if (status === "WEEK_OFF" || status === "HOLIDAY") continue;
      expected += 1;
      if (status === "PRESENT" || status === "HALF_DAY") present += 1;
      else if (status === "LEAVE") leave += 1;
      else absent += 1;
      if ((row?.lateMinutes ?? 0) > 0) late += 1;
    }

    return {
      workDate,
      present,
      absent,
      leave,
      late,
      expected,
      ratePct: expected > 0 ? Math.round((present / expected) * 100) : 0,
    };
  });
}

/** Rows that need HR attention: checked in on a past day, never checked out. */
export async function findUnclosedRecords(limit = 25, org?: OrgContext) {
  const context = org ?? (await getOrgContext());
  const rows = await prisma.attendance.findMany({
    where: {
      checkInAt: { not: null },
      checkOutAt: null,
      workDate: { lt: context.today },
    },
    orderBy: { workDate: "desc" },
    take: limit,
    include: {
      employee: { select: { id: true, firstName: true, lastName: true, employeeCode: true } },
    },
  });
  return rows.map((r) => ({
    employeeId: r.employee.id,
    name: `${r.employee.firstName} ${r.employee.lastName}`,
    employeeCode: r.employee.employeeCode,
    workDate: r.workDate,
    checkInAt: r.checkInAt?.toISOString() ?? null,
  }));
}

/** Employees with repeated late arrivals in the trailing window. */
export async function findChronicLate(
  windowDays = 14,
  threshold = 3,
  org?: OrgContext,
) {
  const context = org ?? (await getOrgContext());
  const from = addWorkDays(context.today, -(windowDays - 1));
  const rows = await prisma.attendance.findMany({
    where: { workDate: { gte: from, lte: context.today }, lateMinutes: { gt: 0 } },
    select: {
      employeeId: true,
      employee: { select: { firstName: true, lastName: true } },
    },
  });

  const counter = new Map<string, { name: string; lateDays: number }>();
  for (const row of rows) {
    const current = counter.get(row.employeeId) ?? {
      name: `${row.employee.firstName} ${row.employee.lastName}`,
      lateDays: 0,
    };
    current.lateDays += 1;
    counter.set(row.employeeId, current);
  }

  return [...counter.entries()]
    .filter(([, v]) => v.lateDays >= threshold)
    .map(([employeeId, v]) => ({ employeeId, ...v }))
    .sort((a, b) => b.lateDays - a.lateDays);
}

/** Month-to-date view used by the employee dashboard. */
export async function getMonthToDate(employeeId: string, org?: OrgContext) {
  const context = org ?? (await getOrgContext());
  const days = await getAttendanceSeries(
    employeeId,
    startOfMonth(context.today),
    context.today,
    context,
  );
  return { days, totals: summariseAttendance(days) };
}

export function monthBounds(anyDate: WorkDate) {
  return { from: startOfMonth(anyDate), to: endOfMonth(anyDate) };
}

export { toWorkDate, isWeeklyOff };
