import "server-only";

import { prisma } from "@/lib/db";
import {
  BLOCKING_LEAVE_STATUSES,
  isManagement,
  type LeaveStatus,
} from "@/lib/domain/constants";
import {
  canCancelLeave,
  canDecideLeave,
  countLeaveWorkingDays,
  formatDays,
  validateLeaveRequest,
  type Actor,
} from "@/lib/domain/rules";
import {
  addWorkDays,
  eachWorkDate,
  formatWorkDateRange,
  type WorkDate,
} from "@/lib/domain/time";
import { conflict, forbidden, invalidState, notFound, validation } from "@/lib/errors";
import { managementUserIds, notify, notifyMany, recordEvent } from "./audit";
import { getHolidaySet, getOrgContext, type OrgContext } from "./org";

export type LeaveTypeRow = {
  id: string;
  code: string;
  name: string;
  tone: string;
  isPaid: boolean;
  requiresReason: boolean;
  defaultAnnualDays: number;
};

export async function listLeaveTypes(): Promise<LeaveTypeRow[]> {
  const rows = await prisma.leaveType.findMany({ orderBy: { sortOrder: "asc" } });
  return rows.map((r) => ({
    id: r.id,
    code: r.code,
    name: r.name,
    tone: r.tone,
    isPaid: r.isPaid,
    requiresReason: r.requiresReason,
    defaultAnnualDays: r.defaultAnnualDays,
  }));
}

export type LeaveBalanceRow = {
  leaveTypeId: string;
  code: string;
  name: string;
  tone: string;
  isPaid: boolean;
  entitledDays: number;
  usedDays: number;
  pendingDays: number;
  /** Null when the type has no entitlement cap (e.g. unpaid leave). */
  remainingDays: number | null;
  /** Null when the type has no entitlement cap. */
  cap: number | null;
};

/**
 * Balances for one employee.
 *
 * `remaining = entitled − approved − pending`. Counting pending requests against
 * the balance is what stops an employee from queueing three overlapping requests
 * that would each individually pass validation. An uncapped type reports `null`
 * rather than infinity, so the value stays serialisable and every consumer has to
 * handle "no limit" explicitly.
 */
export async function getLeaveBalances(
  employeeId: string,
  year: number,
): Promise<LeaveBalanceRow[]> {
  const [types, balances, pending] = await Promise.all([
    prisma.leaveType.findMany({ orderBy: { sortOrder: "asc" } }),
    prisma.leaveBalance.findMany({ where: { employeeId, year } }),
    prisma.leaveRequest.groupBy({
      by: ["leaveTypeId"],
      where: {
        employeeId,
        status: "PENDING",
        startDate: { gte: `${year}-01-01`, lte: `${year}-12-31` },
      },
      _sum: { workingDays: true },
    }),
  ]);

  const balanceByType = new Map(balances.map((b) => [b.leaveTypeId, b]));
  const pendingByType = new Map(
    pending.map((p) => [p.leaveTypeId, p._sum.workingDays ?? 0]),
  );

  return types.map((type): LeaveBalanceRow => {
    const balance = balanceByType.get(type.id);
    const entitledDays = balance?.entitledDays ?? type.defaultAnnualDays;
    const usedDays = balance?.usedDays ?? 0;
    const pendingDays = pendingByType.get(type.id) ?? 0;
    const uncapped = entitledDays <= 0;
    return {
      leaveTypeId: type.id,
      code: type.code,
      name: type.name,
      tone: type.tone,
      isPaid: type.isPaid,
      entitledDays,
      usedDays,
      pendingDays,
      remainingDays: uncapped
        ? null
        : Math.max(0, Math.round((entitledDays - usedDays - pendingDays) * 10) / 10),
      cap: uncapped ? null : entitledDays,
    };
  });
}

/* ------------------------------------------------------------- submissions */

export async function submitLeaveRequest(
  actor: Actor,
  input: {
    employeeId: string;
    leaveTypeId: string;
    startDate: WorkDate;
    endDate: WorkDate;
    halfDay: boolean;
    reason: string;
  },
) {
  const isSelf = actor.employeeId === input.employeeId;
  if (!isSelf && !isManagement(actor.role)) {
    throw forbidden("You can only apply for your own leave.");
  }

  const org = await getOrgContext();
  const employee = await prisma.employee.findUnique({
    where: { id: input.employeeId },
    select: {
      id: true,
      userId: true,
      firstName: true,
      lastName: true,
      weeklyOffCsv: true,
      status: true,
      manager: { select: { userId: true } },
    },
  });
  if (!employee) throw notFound("Employee");
  if (employee.status === "INACTIVE") {
    throw invalidState("This employee is inactive and cannot request leave.");
  }

  const leaveType = await prisma.leaveType.findUnique({
    where: { id: input.leaveTypeId },
  });
  if (!leaveType) throw validation("Choose a valid leave type.", { leaveTypeId: "Unknown leave type." });

  const year = Number(input.startDate.slice(0, 4));
  const [holidays, existing, balances] = await Promise.all([
    getHolidaySet(input.startDate, input.endDate),
    prisma.leaveRequest.findMany({
      where: {
        employeeId: input.employeeId,
        status: { in: BLOCKING_LEAVE_STATUSES },
      },
      select: { id: true, startDate: true, endDate: true, status: true },
    }),
    getLeaveBalances(input.employeeId, year),
  ]);

  const balance = balances.find((b) => b.leaveTypeId === input.leaveTypeId);
  const remaining = balance?.remainingDays ?? null;

  const verdict = validateLeaveRequest(
    { startDate: input.startDate, endDate: input.endDate, halfDay: input.halfDay },
    {
      today: org.today,
      weeklyOffCsv: employee.weeklyOffCsv,
      holidays,
      existing: existing.map((e) => ({ ...e, status: e.status as LeaveStatus })),
      remainingDays: remaining,
      requiresReason: leaveType.requiresReason,
      reason: input.reason,
    },
  );

  if (!verdict.ok) {
    throw validation(verdict.message, verdict.field ? { [verdict.field]: verdict.message } : undefined, verdict.hint);
  }

  const request = await prisma.leaveRequest.create({
    data: {
      employeeId: input.employeeId,
      leaveTypeId: input.leaveTypeId,
      startDate: input.startDate,
      endDate: input.endDate,
      halfDay: input.halfDay,
      workingDays: verdict.workingDays,
      reason: input.reason.trim(),
      status: "PENDING",
    },
    include: { leaveType: true },
  });

  const who = `${employee.firstName} ${employee.lastName}`;
  const range = formatWorkDateRange(input.startDate, input.endDate);

  await recordEvent({
    actorUserId: actor.userId,
    actorName: who,
    employeeId: employee.id,
    action: "LEAVE_SUBMITTED",
    entityType: "LeaveRequest",
    entityId: request.id,
    summary: `Requested ${formatDays(verdict.workingDays)} of ${leaveType.name} (${range})`,
    meta: { startDate: input.startDate, endDate: input.endDate },
  });

  // Route the approval to the people who can act on it.
  const approverIds = new Set(await managementUserIds());
  if (employee.manager?.userId) approverIds.add(employee.manager.userId);
  approverIds.delete(actor.userId);
  await notifyMany([...approverIds], {
    type: "LEAVE_SUBMITTED",
    title: `${who} requested ${leaveType.name.toLowerCase()}`,
    body: `${formatDays(verdict.workingDays)} • ${range}`,
    href: `/leave?request=${request.id}`,
  });

  return request;
}

export async function decideLeaveRequest(
  actor: Actor,
  actorName: string,
  requestId: string,
  decision: "APPROVED" | "REJECTED",
  comment: string,
) {
  const request = await prisma.leaveRequest.findUnique({
    where: { id: requestId },
    include: {
      leaveType: true,
      employee: { select: { id: true, userId: true, firstName: true, lastName: true } },
    },
  });
  if (!request) throw notFound("Leave request");

  const verdict = canDecideLeave(actor, request);
  if (!verdict.ok) throw forbidden(verdict.reason);

  if (decision === "REJECTED" && comment.trim().length < 5) {
    throw validation(
      "Add a short comment so the employee understands the rejection.",
      { comment: "A comment of at least 5 characters is required to reject." },
    );
  }

  const year = Number(request.startDate.slice(0, 4));

  const updated = await prisma.$transaction(async (tx) => {
    // Re-read inside the transaction so two approvers clicking at once cannot
    // both consume the balance.
    const fresh = await tx.leaveRequest.findUnique({ where: { id: requestId } });
    if (!fresh || fresh.status !== "PENDING") {
      throw conflict("Someone else already decided this request.", "Refresh the queue to see the latest state.");
    }

    if (decision === "APPROVED") {
      const balance = await tx.leaveBalance.findUnique({
        where: {
          employeeId_leaveTypeId_year: {
            employeeId: request.employeeId,
            leaveTypeId: request.leaveTypeId,
            year,
          },
        },
      });
      if (balance) {
        const entitled = balance.entitledDays;
        const nextUsed = Math.round((balance.usedDays + request.workingDays) * 10) / 10;
        if (entitled > 0 && nextUsed > entitled + 1e-9) {
          throw conflict(
            `Approving this would use ${formatDays(nextUsed)} of a ${formatDays(entitled)} entitlement.`,
            "Reject the request or increase the entitlement in Settings first.",
          );
        }
        await tx.leaveBalance.update({
          where: { id: balance.id },
          data: { usedDays: nextUsed },
        });
      } else {
        await tx.leaveBalance.create({
          data: {
            employeeId: request.employeeId,
            leaveTypeId: request.leaveTypeId,
            year,
            entitledDays: request.leaveType.defaultAnnualDays,
            usedDays: request.workingDays,
          },
        });
      }

      // Approved leave owns the attendance record for those days.
      for (const day of eachWorkDate(request.startDate, request.endDate)) {
        await tx.attendance.upsert({
          where: { employeeId_workDate: { employeeId: request.employeeId, workDate: day } },
          create: {
            employeeId: request.employeeId,
            workDate: day,
            status: "LEAVE",
            source: "SYSTEM",
            note: `${request.leaveType.name} approved by ${actorName}`,
          },
          update: {},
        });
      }
    }

    return tx.leaveRequest.update({
      where: { id: requestId },
      data: {
        status: decision,
        decidedById: actor.employeeId,
        decidedAt: new Date(),
        decisionComment: comment.trim() || null,
      },
      include: { leaveType: true },
    });
  });

  const range = formatWorkDateRange(request.startDate, request.endDate);
  const who = `${request.employee.firstName} ${request.employee.lastName}`;

  await recordEvent({
    actorUserId: actor.userId,
    actorName,
    employeeId: request.employeeId,
    action: decision === "APPROVED" ? "LEAVE_APPROVED" : "LEAVE_REJECTED",
    entityType: "LeaveRequest",
    entityId: requestId,
    summary: `${decision === "APPROVED" ? "Approved" : "Rejected"} ${who}'s ${request.leaveType.name} (${range})`,
    meta: { decision, comment: comment.trim() || null },
  });

  await notify({
    userId: request.employee.userId,
    type: decision === "APPROVED" ? "LEAVE_APPROVED" : "LEAVE_REJECTED",
    title: `${request.leaveType.name} ${decision === "APPROVED" ? "approved" : "rejected"}`,
    body: `${range} • ${actorName}${comment.trim() ? ` — “${comment.trim()}”` : ""}`,
    href: `/leave?request=${requestId}`,
  });

  return updated;
}

export async function cancelLeaveRequest(
  actor: Actor,
  actorName: string,
  requestId: string,
) {
  const request = await prisma.leaveRequest.findUnique({
    where: { id: requestId },
    include: {
      leaveType: true,
      employee: { select: { userId: true, firstName: true, lastName: true } },
    },
  });
  if (!request) throw notFound("Leave request");

  const verdict = canCancelLeave(actor, request);
  if (!verdict.ok) throw forbidden(verdict.reason);

  const updated = await prisma.leaveRequest.update({
    where: { id: requestId },
    data: { status: "CANCELLED", decidedAt: new Date(), decidedById: actor.employeeId },
  });

  await recordEvent({
    actorUserId: actor.userId,
    actorName,
    employeeId: request.employeeId,
    action: "LEAVE_CANCELLED",
    entityType: "LeaveRequest",
    entityId: requestId,
    summary: `Withdrew ${request.leaveType.name} request (${formatWorkDateRange(request.startDate, request.endDate)})`,
  });

  return updated;
}

/* ------------------------------------------------------------------ reads */

export type LeaveListItem = {
  id: string;
  employeeId: string;
  employeeName: string;
  employeeCode: string;
  avatarColor: string;
  jobTitle: string;
  department: string | null;
  leaveTypeId: string;
  leaveType: string;
  tone: string;
  startDate: WorkDate;
  endDate: WorkDate;
  workingDays: number;
  halfDay: boolean;
  reason: string;
  status: LeaveStatus;
  decisionComment: string | null;
  decidedByName: string | null;
  decidedAt: string | null;
  createdAt: string;
  /** Hours the request has been pending, for aging badges. */
  ageHours: number;
};

export async function listLeaveRequests(
  actor: Actor,
  query: {
    scope: "me" | "org";
    status?: LeaveStatus;
    employeeId?: string;
    departmentId?: string;
    leaveTypeId?: string;
    from?: WorkDate;
    to?: WorkDate;
    take: number;
  },
): Promise<LeaveListItem[]> {
  const orgScope = query.scope === "org";
  if (orgScope && !isManagement(actor.role)) {
    throw forbidden("Only HR and administrators can view organisation-wide leave.");
  }

  let employeeId = query.employeeId;
  if (!orgScope) {
    if (!actor.employeeId) return [];
    employeeId = actor.employeeId;
  } else if (employeeId && !isManagement(actor.role)) {
    throw forbidden("You can only view your own leave requests.");
  }

  const rows = await prisma.leaveRequest.findMany({
    where: {
      ...(employeeId ? { employeeId } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.leaveTypeId ? { leaveTypeId: query.leaveTypeId } : {}),
      ...(query.departmentId ? { employee: { departmentId: query.departmentId } } : {}),
      ...(query.from ? { endDate: { gte: query.from } } : {}),
      ...(query.to ? { startDate: { lte: query.to } } : {}),
    },
    include: {
      leaveType: true,
      decidedBy: { select: { firstName: true, lastName: true } },
      employee: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          employeeCode: true,
          avatarColor: true,
          jobTitle: true,
          department: { select: { name: true } },
        },
      },
    },
    orderBy: [{ createdAt: "desc" }],
    take: query.take,
  });

  const now = Date.now();
  return rows.map((r) => ({
    id: r.id,
    employeeId: r.employee.id,
    employeeName: `${r.employee.firstName} ${r.employee.lastName}`,
    employeeCode: r.employee.employeeCode,
    avatarColor: r.employee.avatarColor,
    jobTitle: r.employee.jobTitle,
    department: r.employee.department?.name ?? null,
    leaveTypeId: r.leaveTypeId,
    leaveType: r.leaveType.name,
    tone: r.leaveType.tone,
    startDate: r.startDate,
    endDate: r.endDate,
    workingDays: r.workingDays,
    halfDay: r.halfDay,
    reason: r.reason,
    status: r.status as LeaveStatus,
    decisionComment: r.decisionComment,
    decidedByName: r.decidedBy
      ? `${r.decidedBy.firstName} ${r.decidedBy.lastName}`
      : null,
    decidedAt: r.decidedAt?.toISOString() ?? null,
    createdAt: r.createdAt.toISOString(),
    ageHours: Math.round((now - r.createdAt.getTime()) / 3600_000),
  }));
}

export async function getPendingLeave(take = 50) {
  return listLeaveRequests(
    { userId: "system", role: "ADMIN", employeeId: null },
    { scope: "org", status: "PENDING", take },
  );
}

/** Approved leave starting on or after today, for the "upcoming" panels. */
export async function getUpcomingLeave(
  employeeId: string | null,
  org?: OrgContext,
  take = 5,
) {
  const context = org ?? (await getOrgContext());
  const rows = await prisma.leaveRequest.findMany({
    where: {
      status: "APPROVED",
      endDate: { gte: context.today },
      ...(employeeId ? { employeeId } : {}),
    },
    include: {
      leaveType: true,
      employee: {
        select: { id: true, firstName: true, lastName: true, avatarColor: true },
      },
    },
    orderBy: { startDate: "asc" },
    take,
  });
  return rows.map((r) => ({
    id: r.id,
    employeeId: r.employee.id,
    employeeName: `${r.employee.firstName} ${r.employee.lastName}`,
    avatarColor: r.employee.avatarColor,
    leaveType: r.leaveType.name,
    tone: r.leaveType.tone,
    startDate: r.startDate,
    endDate: r.endDate,
    workingDays: r.workingDays,
    startsInDays: Math.max(
      0,
      eachWorkDate(context.today, r.startDate).length - 1,
    ),
  }));
}

/** Leave days taken per type, for the reports charts. */
export async function getLeaveUtilisation(
  from: WorkDate,
  to: WorkDate,
  departmentId?: string,
) {
  const rows = await prisma.leaveRequest.findMany({
    where: {
      status: "APPROVED",
      startDate: { lte: to },
      endDate: { gte: from },
      ...(departmentId ? { employee: { departmentId } } : {}),
    },
    include: {
      leaveType: true,
      employee: { select: { department: { select: { name: true } } } },
    },
  });

  const byType = new Map<string, { name: string; tone: string; days: number; requests: number }>();
  const byDepartment = new Map<string, number>();

  for (const row of rows) {
    const type = byType.get(row.leaveType.code) ?? {
      name: row.leaveType.name,
      tone: row.leaveType.tone,
      days: 0,
      requests: 0,
    };
    type.days += row.workingDays;
    type.requests += 1;
    byType.set(row.leaveType.code, type);

    const dept = row.employee.department?.name ?? "Unassigned";
    byDepartment.set(dept, (byDepartment.get(dept) ?? 0) + row.workingDays);
  }

  return {
    byType: [...byType.values()].sort((a, b) => b.days - a.days),
    byDepartment: [...byDepartment.entries()]
      .map(([department, days]) => ({ department, days }))
      .sort((a, b) => b.days - a.days),
    totalDays: rows.reduce((sum, r) => sum + r.workingDays, 0),
    totalRequests: rows.length,
  };
}

/** Working-day count preview for the leave form, so the UI never guesses. */
export async function previewLeaveDays(
  employeeId: string,
  startDate: WorkDate,
  endDate: WorkDate,
  halfDay: boolean,
) {
  const employee = await prisma.employee.findUnique({
    where: { id: employeeId },
    select: { weeklyOffCsv: true },
  });
  if (!employee) throw notFound("Employee");
  const holidays = await getHolidaySet(startDate, endDate);
  return countLeaveWorkingDays({ startDate, endDate, halfDay }, employee.weeklyOffCsv, holidays);
}

export async function getLeaveRequest(actor: Actor, id: string) {
  const request = await prisma.leaveRequest.findUnique({
    where: { id },
    include: {
      leaveType: true,
      employee: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          employeeCode: true,
          jobTitle: true,
          avatarColor: true,
          department: { select: { name: true } },
        },
      },
    },
  });
  if (!request) throw notFound("Leave request");
  if (!isManagement(actor.role) && actor.employeeId !== request.employeeId) {
    throw forbidden("You can only view your own leave requests.");
  }
  return request;
}

export const leaveWindowDays = (start: WorkDate, end: WorkDate) =>
  eachWorkDate(start, end).length;

export const nextYearStart = (today: WorkDate) =>
  addWorkDays(`${Number(today.slice(0, 4)) + 1}-01-01`, 0);
