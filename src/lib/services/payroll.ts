import "server-only";

import { prisma } from "@/lib/db";
import { EMPLOYED_STATUSES, isManagement } from "@/lib/domain/constants";
import {
  annualCtc,
  canEditCompensation,
  canRunPayroll,
  canViewCompensation,
  computePayslip,
  grossMonthly,
  monthlyDeductions,
  nonWorkingReason,
  validateSalaryStructure,
  type Actor,
  type PayslipLine,
  type SalaryComponents,
} from "@/lib/domain/rules";
import {
  eachWorkDate,
  endOfMonth,
  formatPeriod,
  periodOf,
  startOfMonth,
} from "@/lib/domain/time";
import { conflict, forbidden, invalidState, notFound, validation } from "@/lib/errors";
import { notify, recordEvent } from "./audit";
import { approvedLeaveDates } from "./leave-calendar";
import { getHolidaySet, getOrgContext, type OrgContext } from "./org";

const round2 = (n: number) => Math.round(n * 100) / 100;

export type SalaryView = SalaryComponents & {
  currency: string;
  effectiveFrom: string;
  revision: number;
  updatedByName: string | null;
  gross: number;
  deductions: number;
  netMonthly: number;
  annualCtc: number;
};

function toView(row: {
  currency: string;
  effectiveFrom: string;
  revision: number;
  updatedByName: string | null;
  basic: number;
  hra: number;
  specialAllowance: number;
  transportAllow: number;
  providentFund: number;
  professionalTax: number;
  healthInsurance: number;
}): SalaryView {
  const components: SalaryComponents = {
    basic: row.basic,
    hra: row.hra,
    specialAllowance: row.specialAllowance,
    transportAllow: row.transportAllow,
    providentFund: row.providentFund,
    professionalTax: row.professionalTax,
    healthInsurance: row.healthInsurance,
  };
  const gross = grossMonthly(components);
  const deductions = monthlyDeductions(components);
  return {
    ...components,
    currency: row.currency,
    effectiveFrom: row.effectiveFrom,
    revision: row.revision,
    updatedByName: row.updatedByName,
    gross,
    deductions,
    netMonthly: round2(gross - deductions),
    annualCtc: annualCtc(components),
  };
}

export async function getSalaryStructure(
  actor: Actor,
  employeeId: string,
): Promise<SalaryView | null> {
  if (!canViewCompensation(actor, employeeId)) {
    throw forbidden(
      "Salary details are private to the employee and HR.",
      "You can always see your own compensation under Payroll.",
    );
  }
  const row = await prisma.salaryStructure.findUnique({ where: { employeeId } });
  return row ? toView(row) : null;
}

export async function upsertSalaryStructure(
  actor: Actor,
  actorName: string,
  employeeId: string,
  input: SalaryComponents & { effectiveFrom?: string },
) {
  if (!canEditCompensation(actor)) {
    throw forbidden("Only HR and administrators can change salary structures.");
  }

  const verdict = validateSalaryStructure(input);
  if (!verdict.ok) {
    throw validation(
      verdict.message,
      verdict.field ? { [verdict.field]: verdict.message } : undefined,
    );
  }

  const employee = await prisma.employee.findUnique({
    where: { id: employeeId },
    select: { id: true, userId: true, firstName: true, lastName: true },
  });
  if (!employee) throw notFound("Employee");

  const org = await getOrgContext();
  const existing = await prisma.salaryStructure.findUnique({ where: { employeeId } });
  const effectiveFrom = input.effectiveFrom ?? startOfMonth(org.today);

  const saved = await prisma.salaryStructure.upsert({
    where: { employeeId },
    create: {
      employeeId,
      currency: org.currency,
      effectiveFrom,
      basic: input.basic,
      hra: input.hra,
      specialAllowance: input.specialAllowance,
      transportAllow: input.transportAllow,
      providentFund: input.providentFund,
      professionalTax: input.professionalTax,
      healthInsurance: input.healthInsurance,
      revision: 1,
      updatedByName: actorName,
    },
    update: {
      effectiveFrom,
      basic: input.basic,
      hra: input.hra,
      specialAllowance: input.specialAllowance,
      transportAllow: input.transportAllow,
      providentFund: input.providentFund,
      professionalTax: input.professionalTax,
      healthInsurance: input.healthInsurance,
      revision: (existing?.revision ?? 0) + 1,
      updatedByName: actorName,
    },
  });

  const before = existing ? grossMonthly(existing) : 0;
  const after = grossMonthly(saved);
  const delta = round2(after - before);

  await recordEvent({
    actorUserId: actor.userId,
    actorName,
    employeeId,
    action: "SALARY_UPDATED",
    entityType: "SalaryStructure",
    entityId: saved.id,
    summary: existing
      ? `Revised ${employee.firstName} ${employee.lastName}'s gross to ${after.toLocaleString("en-IN")} (${delta >= 0 ? "+" : ""}${delta.toLocaleString("en-IN")})`
      : `Set ${employee.firstName} ${employee.lastName}'s salary structure (gross ${after.toLocaleString("en-IN")})`,
    meta: { revision: saved.revision, gross: after, previousGross: before },
  });

  await notify({
    userId: employee.userId,
    type: "SALARY_UPDATED",
    title: "Your salary structure was updated",
    body: `${actorName} saved revision ${saved.revision}, effective ${effectiveFrom}.`,
    href: "/payroll",
  });

  return toView(saved);
}

/* ---------------------------------------------------------------- payroll */

export type PayslipView = {
  id: string;
  period: string;
  periodLabel: string;
  employeeId: string;
  employeeName: string;
  employeeCode: string;
  jobTitle: string;
  department: string | null;
  currency: string;
  lines: PayslipLine[];
  totalEarnings: number;
  totalDeductions: number;
  netPay: number;
  lopDays: number;
  paidDays: number;
  runStatus: string;
  processedAt: string | null;
};

function parseLines(json: string): PayslipLine[] {
  try {
    const parsed = JSON.parse(json);
    return Array.isArray(parsed) ? (parsed as PayslipLine[]) : [];
  } catch {
    return [];
  }
}

/**
 * Days an employee can be paid for in a period: calendar days minus their week
 * offs and public holidays. Used as the denominator for loss-of-pay pro-rating.
 */
async function payableDaysFor(
  employeeIds: string[],
  period: string,
): Promise<Map<string, { payable: number; unpaidAbsence: number }>> {
  const from = `${period}-01`;
  const to = endOfMonth(from);

  const [employees, attendance, holidays, leaveMap] = await Promise.all([
    prisma.employee.findMany({
      where: { id: { in: employeeIds } },
      select: { id: true, weeklyOffCsv: true },
    }),
    prisma.attendance.findMany({
      where: { employeeId: { in: employeeIds }, workDate: { gte: from, lte: to } },
      select: { employeeId: true, workDate: true, status: true },
    }),
    getHolidaySet(from, to),
    approvedLeaveDates(employeeIds, from, to),
  ]);

  const key = (e: string, d: string) => `${e}|${d}`;
  const statusByKey = new Map(attendance.map((a) => [key(a.employeeId, a.workDate), a.status]));
  const days = eachWorkDate(from, to);
  const result = new Map<string, { payable: number; unpaidAbsence: number }>();

  for (const employee of employees) {
    let payable = 0;
    let unpaidAbsence = 0;
    for (const day of days) {
      const reason = nonWorkingReason({
        date: day,
        weeklyOffCsv: employee.weeklyOffCsv,
        holidayNames: holidays,
        approvedLeaveDates: leaveMap.get(employee.id) ?? new Set(),
      });
      if (reason === "WEEK_OFF" || reason === "HOLIDAY") continue;
      payable += 1;
      const status = statusByKey.get(key(employee.id, day)) ?? reason ?? "ABSENT";
      if (status === "ABSENT") unpaidAbsence += 1;
      else if (status === "HALF_DAY") unpaidAbsence += 0.5;
    }
    result.set(employee.id, { payable, unpaidAbsence });
  }
  return result;
}

/** Preview payroll for a period without persisting anything. */
export async function previewPayrollRun(actor: Actor, period: string) {
  if (!isManagement(actor.role)) {
    throw forbidden("Only HR and administrators can view the payroll run.");
  }

  const employees = await prisma.employee.findMany({
    where: { status: { in: EMPLOYED_STATUSES } },
    include: {
      salaryStructure: true,
      department: { select: { name: true } },
    },
    orderBy: { firstName: "asc" },
  });

  const payable = await payableDaysFor(
    employees.map((e) => e.id),
    period,
  );

  const rows = employees.map((employee) => {
    const days = payable.get(employee.id) ?? { payable: 0, unpaidAbsence: 0 };
    if (!employee.salaryStructure) {
      return {
        employeeId: employee.id,
        name: `${employee.firstName} ${employee.lastName}`,
        employeeCode: employee.employeeCode,
        department: employee.department?.name ?? null,
        avatarColor: employee.avatarColor,
        ready: false as const,
        reason: "No salary structure on file",
        gross: 0,
        netPay: 0,
        lopDays: days.unpaidAbsence,
        paidDays: 0,
        payableDays: days.payable,
      };
    }
    const computed = computePayslip({
      components: employee.salaryStructure,
      payableDays: days.payable,
      unpaidAbsenceDays: days.unpaidAbsence,
    });
    return {
      employeeId: employee.id,
      name: `${employee.firstName} ${employee.lastName}`,
      employeeCode: employee.employeeCode,
      department: employee.department?.name ?? null,
      avatarColor: employee.avatarColor,
      ready: true as const,
      reason: null,
      gross: grossMonthly(employee.salaryStructure),
      netPay: computed.netPay,
      lopDays: computed.lopDays,
      paidDays: computed.paidDays,
      payableDays: computed.payableDays,
    };
  });

  const run = await prisma.payrollRun.findUnique({ where: { period } });

  return {
    period,
    periodLabel: formatPeriod(period),
    status: run?.status ?? null,
    processedAt: run?.processedAt?.toISOString() ?? null,
    rows,
    totals: {
      headcount: rows.length,
      ready: rows.filter((r) => r.ready).length,
      blocked: rows.filter((r) => !r.ready).length,
      grossTotal: round2(rows.reduce((s, r) => s + r.gross, 0)),
      netTotal: round2(rows.reduce((s, r) => s + r.netPay, 0)),
      lopDays: round2(rows.reduce((s, r) => s + r.lopDays, 0)),
    },
  };
}

/** Generate (or regenerate) payslips for a period. */
export async function processPayroll(actor: Actor, actorName: string, period: string) {
  if (!canRunPayroll(actor)) {
    throw forbidden(
      "Only an administrator can process payroll.",
      "HR can review the run and fix blockers before an admin processes it.",
    );
  }
  const org = await getOrgContext();
  if (period > periodOf(org.today)) {
    throw invalidState(
      `Payroll for ${formatPeriod(period)} cannot be processed before the month begins.`,
    );
  }

  const existing = await prisma.payrollRun.findUnique({ where: { period } });
  if (existing?.status === "PAID") {
    throw conflict(
      `Payroll for ${formatPeriod(period)} is already marked paid.`,
      "Paid runs are locked to keep the payslip history trustworthy.",
    );
  }

  const employees = await prisma.employee.findMany({
    where: { status: { in: EMPLOYED_STATUSES }, salaryStructure: { isNot: null } },
    include: { salaryStructure: true },
  });
  if (employees.length === 0) {
    throw invalidState(
      "No employee has a salary structure yet, so there is nothing to process.",
      "Add salary structures from Payroll → Structures.",
    );
  }

  const payable = await payableDaysFor(
    employees.map((e) => e.id),
    period,
  );

  const run = await prisma.$transaction(async (tx) => {
    const payrollRun = existing
      ? await tx.payrollRun.update({
          where: { id: existing.id },
          data: { status: "PROCESSED", processedAt: new Date(), processedBy: actorName },
        })
      : await tx.payrollRun.create({
          data: {
            period,
            status: "PROCESSED",
            processedAt: new Date(),
            processedBy: actorName,
          },
        });

    for (const employee of employees) {
      const days = payable.get(employee.id) ?? { payable: 0, unpaidAbsence: 0 };
      const computed = computePayslip({
        components: employee.salaryStructure!,
        payableDays: days.payable,
        unpaidAbsenceDays: days.unpaidAbsence,
      });
      await tx.payslip.upsert({
        where: { employeeId_period: { employeeId: employee.id, period } },
        create: {
          payrollRunId: payrollRun.id,
          employeeId: employee.id,
          period,
          totalEarnings: computed.totalEarnings,
          totalDeductions: computed.totalDeductions,
          netPay: computed.netPay,
          lopDays: computed.lopDays,
          paidDays: computed.paidDays,
          breakdownJson: JSON.stringify(computed.lines),
        },
        update: {
          payrollRunId: payrollRun.id,
          totalEarnings: computed.totalEarnings,
          totalDeductions: computed.totalDeductions,
          netPay: computed.netPay,
          lopDays: computed.lopDays,
          paidDays: computed.paidDays,
          breakdownJson: JSON.stringify(computed.lines),
        },
      });
    }
    return payrollRun;
  });

  const netTotal = await prisma.payslip.aggregate({
    where: { period },
    _sum: { netPay: true },
  });

  await recordEvent({
    actorUserId: actor.userId,
    actorName,
    action: "PAYROLL_PROCESSED",
    entityType: "PayrollRun",
    entityId: run.id,
    summary: `Processed ${formatPeriod(period)} payroll for ${employees.length} employees (net ${Math.round(netTotal._sum.netPay ?? 0).toLocaleString("en-IN")})`,
    meta: { period, headcount: employees.length },
  });

  const users = await prisma.employee.findMany({
    where: { id: { in: employees.map((e) => e.id) } },
    select: { userId: true },
  });
  await prisma.notification.createMany({
    data: users.map((u) => ({
      userId: u.userId,
      type: "PAYSLIP_READY",
      title: `${formatPeriod(period)} payslip is ready`,
      body: "Your payslip has been generated and is available to view or print.",
      href: "/payroll",
    })),
  });

  return run;
}

export async function markPayrollPaid(actor: Actor, actorName: string, period: string) {
  if (!canRunPayroll(actor)) {
    throw forbidden("Only an administrator can mark payroll as paid.");
  }
  const run = await prisma.payrollRun.findUnique({ where: { period } });
  if (!run) throw notFound(`Payroll run for ${formatPeriod(period)}`);
  if (run.status === "DRAFT") {
    throw invalidState("Process the payroll before marking it paid.");
  }
  if (run.status === "PAID") {
    throw conflict(`${formatPeriod(period)} is already marked paid.`);
  }

  const updated = await prisma.payrollRun.update({
    where: { id: run.id },
    data: { status: "PAID" },
  });

  await recordEvent({
    actorUserId: actor.userId,
    actorName,
    action: "PAYROLL_PROCESSED",
    entityType: "PayrollRun",
    entityId: run.id,
    summary: `Marked ${formatPeriod(period)} payroll as paid`,
    meta: { period },
  });

  return updated;
}

export async function listPayslips(
  actor: Actor,
  options: { employeeId?: string; period?: string; take?: number },
): Promise<PayslipView[]> {
  let employeeId = options.employeeId;
  if (!isManagement(actor.role)) {
    if (!actor.employeeId) return [];
    if (employeeId && employeeId !== actor.employeeId) {
      throw forbidden("You can only view your own payslips.");
    }
    employeeId = actor.employeeId;
  }

  const rows = await prisma.payslip.findMany({
    where: {
      ...(employeeId ? { employeeId } : {}),
      ...(options.period ? { period: options.period } : {}),
    },
    include: {
      payrollRun: true,
      employee: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          employeeCode: true,
          jobTitle: true,
          department: { select: { name: true } },
          salaryStructure: { select: { currency: true } },
        },
      },
    },
    orderBy: [{ period: "desc" }, { netPay: "desc" }],
    take: options.take ?? 60,
  });

  return rows.map((r) => ({
    id: r.id,
    period: r.period,
    periodLabel: formatPeriod(r.period),
    employeeId: r.employee.id,
    employeeName: `${r.employee.firstName} ${r.employee.lastName}`,
    employeeCode: r.employee.employeeCode,
    jobTitle: r.employee.jobTitle,
    department: r.employee.department?.name ?? null,
    currency: r.employee.salaryStructure?.currency ?? "INR",
    lines: parseLines(r.breakdownJson),
    totalEarnings: r.totalEarnings,
    totalDeductions: r.totalDeductions,
    netPay: r.netPay,
    lopDays: r.lopDays,
    paidDays: r.paidDays,
    runStatus: r.payrollRun.status,
    processedAt: r.payrollRun.processedAt?.toISOString() ?? null,
  }));
}

export async function getPayslip(actor: Actor, payslipId: string): Promise<PayslipView> {
  const row = await prisma.payslip.findUnique({
    where: { id: payslipId },
    select: { employeeId: true },
  });
  if (!row) throw notFound("Payslip");
  if (!canViewCompensation(actor, row.employeeId)) {
    throw forbidden("You can only view your own payslips.");
  }
  const all = await listPayslips(actor, { employeeId: row.employeeId, take: 120 });
  const found = all.find((p) => p.id === payslipId);
  if (!found) throw notFound("Payslip");
  return found;
}

/** Organisation payroll totals for the dashboard and reports. */
export async function getPayrollOverview(org?: OrgContext) {
  const context = org ?? (await getOrgContext());
  const currentPeriod = periodOf(context.today);

  const [runs, currentTotals, structures] = await Promise.all([
    prisma.payrollRun.findMany({ orderBy: { period: "desc" }, take: 6 }),
    prisma.payslip.aggregate({
      where: { period: currentPeriod },
      _sum: { netPay: true, totalDeductions: true, totalEarnings: true },
      _count: { _all: true },
    }),
    prisma.salaryStructure.findMany({
      select: {
        basic: true,
        hra: true,
        specialAllowance: true,
        transportAllow: true,
        providentFund: true,
        professionalTax: true,
        healthInsurance: true,
        employee: { select: { department: { select: { name: true } }, status: true } },
      },
    }),
  ]);

  const active = structures.filter((s) =>
    EMPLOYED_STATUSES.includes(s.employee.status as never),
  );
  const monthlyCommitment = round2(
    active.reduce((sum, s) => sum + grossMonthly(s), 0),
  );

  const byDepartment = new Map<string, { gross: number; headcount: number }>();
  for (const s of active) {
    const key = s.employee.department?.name ?? "Unassigned";
    const bucket = byDepartment.get(key) ?? { gross: 0, headcount: 0 };
    bucket.gross += grossMonthly(s);
    bucket.headcount += 1;
    byDepartment.set(key, bucket);
  }

  const history = await prisma.payslip.groupBy({
    by: ["period"],
    _sum: { netPay: true },
    orderBy: { period: "asc" },
  });

  return {
    currentPeriod,
    currentPeriodLabel: formatPeriod(currentPeriod),
    currentRun: runs.find((r) => r.period === currentPeriod) ?? null,
    runs: runs.map((r) => ({
      period: r.period,
      periodLabel: formatPeriod(r.period),
      status: r.status,
      processedAt: r.processedAt?.toISOString() ?? null,
      processedBy: r.processedBy,
    })),
    processedCount: currentTotals._count._all,
    currentNet: round2(currentTotals._sum.netPay ?? 0),
    currentDeductions: round2(currentTotals._sum.totalDeductions ?? 0),
    currentEarnings: round2(currentTotals._sum.totalEarnings ?? 0),
    monthlyCommitment,
    annualCommitment: round2(monthlyCommitment * 12),
    averageGross: active.length > 0 ? round2(monthlyCommitment / active.length) : 0,
    byDepartment: [...byDepartment.entries()]
      .map(([department, v]) => ({
        department,
        gross: round2(v.gross),
        headcount: v.headcount,
        averageGross: round2(v.gross / v.headcount),
      }))
      .sort((a, b) => b.gross - a.gross),
    netByPeriod: history.map((h) => ({
      period: h.period,
      periodLabel: formatPeriod(h.period),
      netPay: round2(h._sum.netPay ?? 0),
    })),
  };
}

export async function listSalaryStructures(actor: Actor) {
  if (!isManagement(actor.role)) {
    throw forbidden("Only HR and administrators can list salary structures.");
  }
  const rows = await prisma.employee.findMany({
    where: { status: { in: EMPLOYED_STATUSES } },
    include: { salaryStructure: true, department: { select: { name: true } } },
    orderBy: { firstName: "asc" },
  });
  return rows.map((e) => ({
    employeeId: e.id,
    name: `${e.firstName} ${e.lastName}`,
    employeeCode: e.employeeCode,
    jobTitle: e.jobTitle,
    department: e.department?.name ?? null,
    avatarColor: e.avatarColor,
    salary: e.salaryStructure ? toView(e.salaryStructure) : null,
  }));
}
