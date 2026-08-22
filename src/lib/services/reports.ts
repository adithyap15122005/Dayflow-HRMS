import "server-only";

import { prisma } from "@/lib/db";
import { EMPLOYED_STATUSES, isManagement } from "@/lib/domain/constants";
import { grossMonthly, type Actor } from "@/lib/domain/rules";
import {
  addWorkDays,
  endOfMonth,
  formatPeriod,
  periodOf,
  startOfMonth,
  toWorkDate,
  type WorkDate,
} from "@/lib/domain/time";
import { forbidden } from "@/lib/errors";
import {
  getAttendanceSeries,
  getAttendanceTrend,
  summariseAttendance,
} from "./attendance";
import { getLeaveUtilisation, listLeaveRequests } from "./leave";
import { getOrgContext } from "./org";
import { getHeadcountStats } from "./people";
import { getPayrollOverview } from "./payroll";

export type ReportColumn = { key: string; label: string; align?: "right" };
export type ReportTable = {
  id: string;
  title: string;
  subtitle: string;
  columns: ReportColumn[];
  rows: Record<string, string | number>[];
  totals?: Record<string, string | number>;
};

export type ReportFilters = {
  from?: WorkDate;
  to?: WorkDate;
  departmentId?: string;
  employeeId?: string;
  status?: string;
};

function defaultRange(today: WorkDate, filters: ReportFilters) {
  const from = filters.from ?? startOfMonth(today);
  const to = filters.to ?? today;
  // Guard against a reversed range coming from a hand-edited URL.
  return from <= to ? { from, to } : { from: to, to: from };
}

/* -------------------------------------------------------------- attendance */

export async function attendanceReport(actor: Actor, filters: ReportFilters) {
  if (!isManagement(actor.role)) {
    throw forbidden("Only HR and administrators can run organisation reports.");
  }
  const org = await getOrgContext();
  const { from, to } = defaultRange(org.today, filters);

  const employees = await prisma.employee.findMany({
    where: {
      ...(filters.departmentId ? { departmentId: filters.departmentId } : {}),
      ...(filters.employeeId ? { id: filters.employeeId } : {}),
      status: { in: EMPLOYED_STATUSES },
    },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      employeeCode: true,
      jobTitle: true,
      department: { select: { name: true } },
    },
    orderBy: { firstName: "asc" },
  });

  const rows = [];
  for (const employee of employees) {
    const days = await getAttendanceSeries(employee.id, from, to, org);
    const totals = summariseAttendance(days);
    rows.push({
      employeeCode: employee.employeeCode,
      name: `${employee.firstName} ${employee.lastName}`,
      department: employee.department?.name ?? "Unassigned",
      jobTitle: employee.jobTitle,
      present: totals.present,
      halfDay: totals.halfDay,
      leave: totals.leave,
      absent: totals.absent,
      lateDays: totals.lateDays,
      hours: Math.round((totals.workedMinutes / 60) * 10) / 10,
      ratePct: totals.attendanceRatePct,
    });
  }

  const table: ReportTable = {
    id: "attendance",
    title: "Attendance summary",
    subtitle: `${from} to ${to} • ${rows.length} employees`,
    columns: [
      { key: "employeeCode", label: "ID" },
      { key: "name", label: "Employee" },
      { key: "department", label: "Department" },
      { key: "present", label: "Present", align: "right" },
      { key: "halfDay", label: "Half day", align: "right" },
      { key: "leave", label: "Leave", align: "right" },
      { key: "absent", label: "Absent", align: "right" },
      { key: "lateDays", label: "Late", align: "right" },
      { key: "hours", label: "Hours", align: "right" },
      { key: "ratePct", label: "Rate %", align: "right" },
    ],
    rows,
    totals: {
      name: `${rows.length} employees`,
      present: rows.reduce((s, r) => s + r.present, 0),
      halfDay: rows.reduce((s, r) => s + r.halfDay, 0),
      leave: rows.reduce((s, r) => s + r.leave, 0),
      absent: rows.reduce((s, r) => s + r.absent, 0),
      lateDays: rows.reduce((s, r) => s + r.lateDays, 0),
      hours: Math.round(rows.reduce((s, r) => s + r.hours, 0) * 10) / 10,
      ratePct:
        rows.length > 0
          ? Math.round((rows.reduce((s, r) => s + r.ratePct, 0) / rows.length) * 10) / 10
          : 0,
    },
  };

  const trend = await getAttendanceTrend(
    Math.min(90, Math.max(7, daysBetween(from, to) + 1)),
    { departmentId: filters.departmentId },
    org,
  );

  return { table, trend, range: { from, to } };
}

function daysBetween(from: WorkDate, to: WorkDate) {
  return Math.round(
    (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000,
  );
}

/* ------------------------------------------------------------------- leave */

export async function leaveReport(actor: Actor, filters: ReportFilters) {
  if (!isManagement(actor.role)) {
    throw forbidden("Only HR and administrators can run organisation reports.");
  }
  const org = await getOrgContext();
  const { from, to } = defaultRange(addWorkDays(org.today, 0), {
    from: filters.from ?? addWorkDays(org.today, -89),
    to: filters.to,
  });

  const [requests, utilisation] = await Promise.all([
    listLeaveRequests(actor, {
      scope: "org",
      from,
      to,
      departmentId: filters.departmentId,
      employeeId: filters.employeeId,
      status: filters.status as never,
      take: 300,
    }),
    getLeaveUtilisation(from, to, filters.departmentId),
  ]);

  const table: ReportTable = {
    id: "leave",
    title: "Leave register",
    subtitle: `${from} to ${to} • ${requests.length} requests • ${utilisation.totalDays} days approved`,
    columns: [
      { key: "employeeCode", label: "ID" },
      { key: "name", label: "Employee" },
      { key: "department", label: "Department" },
      { key: "leaveType", label: "Type" },
      { key: "range", label: "Dates" },
      { key: "days", label: "Days", align: "right" },
      { key: "status", label: "Status" },
      { key: "decidedBy", label: "Decided by" },
    ],
    rows: requests.map((r) => ({
      employeeCode: r.employeeCode,
      name: r.employeeName,
      department: r.department ?? "Unassigned",
      leaveType: r.leaveType,
      range: `${r.startDate} → ${r.endDate}`,
      days: r.workingDays,
      status: r.status,
      decidedBy: r.decidedByName ?? "—",
    })),
    totals: {
      name: `${requests.length} requests`,
      days: Math.round(requests.reduce((s, r) => s + r.workingDays, 0) * 10) / 10,
    },
  };

  return { table, utilisation, range: { from, to } };
}

/* ----------------------------------------------------------------- payroll */

export async function payrollReport(actor: Actor, filters: ReportFilters) {
  if (!isManagement(actor.role)) {
    throw forbidden("Only HR and administrators can run organisation reports.");
  }
  const org = await getOrgContext();
  const period = filters.from ? periodOf(filters.from) : periodOf(org.today);

  const payslips = await prisma.payslip.findMany({
    where: {
      period,
      ...(filters.departmentId
        ? { employee: { departmentId: filters.departmentId } }
        : {}),
      ...(filters.employeeId ? { employeeId: filters.employeeId } : {}),
    },
    include: {
      employee: {
        select: {
          firstName: true,
          lastName: true,
          employeeCode: true,
          department: { select: { name: true } },
        },
      },
    },
    orderBy: { netPay: "desc" },
  });

  const overview = await getPayrollOverview(org);

  const table: ReportTable = {
    id: "payroll",
    title: `Payroll register — ${formatPeriod(period)}`,
    subtitle:
      payslips.length > 0
        ? `${payslips.length} payslips • net ${Math.round(payslips.reduce((s, p) => s + p.netPay, 0)).toLocaleString("en-IN")}`
        : `No payslips generated for ${formatPeriod(period)} yet`,
    columns: [
      { key: "employeeCode", label: "ID" },
      { key: "name", label: "Employee" },
      { key: "department", label: "Department" },
      { key: "paidDays", label: "Paid days", align: "right" },
      { key: "lopDays", label: "LOP", align: "right" },
      { key: "earnings", label: "Earnings", align: "right" },
      { key: "deductions", label: "Deductions", align: "right" },
      { key: "netPay", label: "Net pay", align: "right" },
    ],
    rows: payslips.map((p) => ({
      employeeCode: p.employee.employeeCode,
      name: `${p.employee.firstName} ${p.employee.lastName}`,
      department: p.employee.department?.name ?? "Unassigned",
      paidDays: p.paidDays,
      lopDays: p.lopDays,
      earnings: p.totalEarnings,
      deductions: p.totalDeductions,
      netPay: p.netPay,
    })),
    totals: {
      name: `${payslips.length} payslips`,
      earnings: Math.round(payslips.reduce((s, p) => s + p.totalEarnings, 0)),
      deductions: Math.round(payslips.reduce((s, p) => s + p.totalDeductions, 0)),
      netPay: Math.round(payslips.reduce((s, p) => s + p.netPay, 0)),
      lopDays: Math.round(payslips.reduce((s, p) => s + p.lopDays, 0) * 10) / 10,
    },
  };

  return { table, overview, period };
}

/* --------------------------------------------------------------- headcount */

export async function headcountReport(actor: Actor) {
  if (!isManagement(actor.role)) {
    throw forbidden("Only HR and administrators can run organisation reports.");
  }
  const org = await getOrgContext();
  const [stats, employees] = await Promise.all([
    getHeadcountStats(),
    prisma.employee.findMany({
      include: {
        department: { select: { name: true } },
        manager: { select: { firstName: true, lastName: true } },
        salaryStructure: true,
        user: { select: { role: true } },
      },
      orderBy: { joinedAt: "asc" },
    }),
  ]);

  const table: ReportTable = {
    id: "headcount",
    title: "Headcount register",
    subtitle: `${employees.length} records • ${stats.total} currently employed`,
    columns: [
      { key: "employeeCode", label: "ID" },
      { key: "name", label: "Employee" },
      { key: "jobTitle", label: "Role" },
      { key: "department", label: "Department" },
      { key: "employmentType", label: "Type" },
      { key: "status", label: "Status" },
      { key: "manager", label: "Manager" },
      { key: "joinedAt", label: "Joined" },
      { key: "gross", label: "Gross/mo", align: "right" },
    ],
    rows: employees.map((e) => ({
      employeeCode: e.employeeCode,
      name: `${e.firstName} ${e.lastName}`,
      jobTitle: e.jobTitle,
      department: e.department?.name ?? "Unassigned",
      employmentType: e.employmentType,
      status: e.status,
      manager: e.manager ? `${e.manager.firstName} ${e.manager.lastName}` : "—",
      joinedAt: toWorkDate(e.joinedAt, org.timezone),
      gross: e.salaryStructure ? grossMonthly(e.salaryStructure) : 0,
    })),
    totals: {
      name: `${employees.length} employees`,
      gross: Math.round(
        employees.reduce(
          (s, e) => s + (e.salaryStructure ? grossMonthly(e.salaryStructure) : 0),
          0,
        ),
      ),
    },
  };

  // Joiners per month for the last 12 months, derived from joinedAt.
  const growth: { period: string; label: string; joiners: number; cumulative: number }[] = [];
  let cumulative = employees.filter(
    (e) => toWorkDate(e.joinedAt, org.timezone) < `${periodOf(addWorkDays(org.today, -365))}-01`,
  ).length;
  for (let i = 11; i >= 0; i -= 1) {
    const monthStart = startOfMonth(addMonths(org.today, -i));
    const period = periodOf(monthStart);
    const joiners = employees.filter(
      (e) => periodOf(toWorkDate(e.joinedAt, org.timezone)) === period,
    ).length;
    cumulative += joiners;
    growth.push({ period, label: formatPeriod(period), joiners, cumulative });
  }

  return { table, stats, growth };
}

function addMonths(date: WorkDate, months: number): WorkDate {
  const [y, m, d] = date.split("-").map(Number);
  const target = new Date(Date.UTC(y, m - 1 + months, 1, 12));
  const last = new Date(
    Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0, 12),
  ).getUTCDate();
  target.setUTCDate(Math.min(d, last));
  return `${target.getUTCFullYear()}-${String(target.getUTCMonth() + 1).padStart(2, "0")}-${String(
    target.getUTCDate(),
  ).padStart(2, "0")}`;
}

/* --------------------------------------------------------------------- csv */

function escapeCsv(value: string | number): string {
  const s = String(value ?? "");
  // Neutralise spreadsheet formula injection while keeping the value readable.
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export function tableToCsv(table: ReportTable): string {
  const header = table.columns.map((c) => escapeCsv(c.label)).join(",");
  const body = table.rows.map((row) =>
    table.columns.map((c) => escapeCsv(row[c.key] ?? "")).join(","),
  );
  const lines = [`# ${table.title}`, `# ${table.subtitle}`, header, ...body];
  if (table.totals) {
    lines.push(
      table.columns.map((c) => escapeCsv(table.totals?.[c.key] ?? "")).join(","),
    );
  }
  return lines.join("\r\n");
}

export function csvFilename(table: ReportTable, range?: { from: string; to: string }) {
  const stamp = range ? `${range.from}_${range.to}` : new Date().toISOString().slice(0, 10);
  return `dayflow-${table.id}-${stamp}.csv`;
}

export const reportRangeHelpers = { startOfMonth, endOfMonth };
