/**
 * Business rules.
 *
 * Deliberately pure: no Prisma, no `Date.now()`, no I/O. Services pass in the
 * facts, these functions decide. That makes every rule unit-testable and keeps
 * policy out of React components and route handlers.
 */

import {
  EMPLOYEE_EDITABLE_FIELDS,
  HR_EDITABLE_FIELDS,
  isManagement,
  type AttendanceStatus,
  type LeaveStatus,
  type Role,
} from "./constants";
import {
  addWorkDays,
  diffWorkDays,
  eachWorkDate,
  isWorkDate,
  weekdayOf,
  type WorkDate,
} from "./time";

/* ======================================================== access decisions */

export type Actor = {
  userId: string;
  role: Role;
  /** Employee record id, if the user is linked to one. */
  employeeId: string | null;
};

/** May the actor read this employee's non-sensitive record? */
export function canViewEmployee(actor: Actor, employeeId: string): boolean {
  return isManagement(actor.role) || actor.employeeId === employeeId;
}

/**
 * May the actor read salary/payslip data for this employee?
 *
 * Same shape as `canViewEmployee` today, but kept as its own rule because
 * compensation is the field most likely to need a narrower policy later (e.g.
 * excluding a line manager who can otherwise see the record).
 */
export function canViewCompensation(actor: Actor, employeeId: string): boolean {
  return isManagement(actor.role) || actor.employeeId === employeeId;
}

export const canEditCompensation = (actor: Actor): boolean =>
  isManagement(actor.role);

export const canRunPayroll = (actor: Actor): boolean => actor.role === "ADMIN";

/** Confidential documents (contracts, ID proofs) are HR-only. */
export function canViewDocument(
  actor: Actor,
  doc: { employeeId: string; confidential: boolean },
): boolean {
  if (isManagement(actor.role)) return true;
  return actor.employeeId === doc.employeeId && !doc.confidential;
}

/** Nobody may approve their own leave, not even an admin. */
export function canDecideLeave(
  actor: Actor,
  request: { employeeId: string; status: string },
): { ok: true } | { ok: false; reason: string } {
  if (!isManagement(actor.role)) {
    return { ok: false, reason: "Only HR and administrators can decide leave requests." };
  }
  if (actor.employeeId && actor.employeeId === request.employeeId) {
    return {
      ok: false,
      reason: "You cannot decide your own leave request. Ask another approver to review it.",
    };
  }
  if (request.status !== "PENDING") {
    return {
      ok: false,
      reason: `This request is already ${request.status.toLowerCase()} and can no longer be decided.`,
    };
  }
  return { ok: true };
}

export function canCancelLeave(
  actor: Actor,
  request: { employeeId: string; status: string },
): { ok: true } | { ok: false; reason: string } {
  const owns = actor.employeeId === request.employeeId;
  if (!owns && !isManagement(actor.role)) {
    return { ok: false, reason: "You can only withdraw your own leave requests." };
  }
  if (request.status !== "PENDING") {
    return {
      ok: false,
      reason: "Only pending requests can be withdrawn.",
    };
  }
  return { ok: true };
}

/** Which fields may this actor write on this employee record? */
export function editableFieldsFor(actor: Actor, employeeId: string): string[] {
  if (isManagement(actor.role)) {
    return [...EMPLOYEE_EDITABLE_FIELDS, ...HR_EDITABLE_FIELDS];
  }
  return actor.employeeId === employeeId ? [...EMPLOYEE_EDITABLE_FIELDS] : [];
}

/**
 * Strip a patch down to the fields the actor is allowed to write and report
 * anything that was rejected, so the API can fail loudly instead of silently
 * dropping data.
 */
export function partitionProfilePatch(
  actor: Actor,
  employeeId: string,
  patch: Record<string, unknown>,
): { allowed: Record<string, unknown>; rejected: string[] } {
  const permitted = new Set(editableFieldsFor(actor, employeeId));
  const allowed: Record<string, unknown> = {};
  const rejected: string[] = [];
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) continue;
    if (permitted.has(key)) allowed[key] = value;
    else rejected.push(key);
  }
  return { allowed, rejected };
}

/* ============================================================== attendance */

export type WorkPolicy = {
  /** Expected minutes for a full day. */
  standardWorkMinutes: number;
  /** At/above this and below standard => half day. */
  halfDayMinutes: number;
  /** Minutes after shift start before "late" is recorded. */
  lateGraceMinutes: number;
};

export const DEFAULT_WORK_POLICY: WorkPolicy = {
  standardWorkMinutes: 510,
  halfDayMinutes: 240,
  lateGraceMinutes: 10,
};

/**
 * Parse a weekly-off CSV such as "0,6" into day indexes.
 *
 * Empty and non-numeric tokens are dropped rather than coerced — `Number("")` is
 * 0, so a naive parse would silently make Sunday a weekly off for an employee
 * whose CSV is blank or has a trailing comma.
 */
export function parseWeeklyOff(csv: string): number[] {
  return csv
    .split(",")
    .map((token) => token.trim())
    .filter((token) => /^[0-6]$/.test(token))
    .map(Number);
}

export function isWeeklyOff(date: WorkDate, weeklyOffCsv: string): boolean {
  return parseWeeklyOff(weeklyOffCsv).includes(weekdayOf(date));
}

export type DayContext = {
  date: WorkDate;
  weeklyOffCsv: string;
  holidayNames: Set<WorkDate>;
  approvedLeaveDates: Set<WorkDate>;
};

/** Why a given day is not a working day — or null when it is. */
export function nonWorkingReason(
  ctx: DayContext,
): "WEEK_OFF" | "HOLIDAY" | "LEAVE" | null {
  if (ctx.approvedLeaveDates.has(ctx.date)) return "LEAVE";
  if (ctx.holidayNames.has(ctx.date)) return "HOLIDAY";
  if (isWeeklyOff(ctx.date, ctx.weeklyOffCsv)) return "WEEK_OFF";
  return null;
}

export type CheckInFacts = {
  /** Existing row for today, if any. */
  existing: { checkInAt: Date | null; checkOutAt: Date | null; status: string } | null;
  nonWorking: "WEEK_OFF" | "HOLIDAY" | "LEAVE" | null;
};

export function canCheckIn(
  facts: CheckInFacts,
): { ok: true } | { ok: false; reason: string; hint?: string } {
  if (facts.nonWorking === "LEAVE") {
    return {
      ok: false,
      reason: "You are on approved leave today, so attendance is not recorded.",
      hint: "Withdraw the leave request first if you intend to work today.",
    };
  }
  if (facts.existing?.checkOutAt) {
    return {
      ok: false,
      reason: "You have already completed your workday.",
      hint: "Ask HR to adjust today's record if the times are wrong.",
    };
  }
  if (facts.existing?.checkInAt) {
    return { ok: false, reason: "You are already checked in for today." };
  }
  return { ok: true };
}

export function canCheckOut(
  facts: CheckInFacts,
): { ok: true } | { ok: false; reason: string; hint?: string } {
  if (!facts.existing?.checkInAt) {
    return {
      ok: false,
      reason: "You cannot check out before checking in.",
      hint: "Start your day with Check in.",
    };
  }
  if (facts.existing.checkOutAt) {
    return { ok: false, reason: "You have already checked out for today." };
  }
  return { ok: true };
}

/** Minutes worked between two instants, floored at zero. */
export function workedMinutesBetween(checkIn: Date, checkOut: Date): number {
  return Math.max(0, Math.round((checkOut.getTime() - checkIn.getTime()) / 60000));
}

/**
 * Attendance status for a *completed* day. A day with fewer than
 * `halfDayMinutes` logged is an absence, not a token "present".
 */
export function deriveCompletedStatus(
  workedMinutes: number,
  policy: WorkPolicy,
): AttendanceStatus {
  if (workedMinutes >= policy.standardWorkMinutes) return "PRESENT";
  if (workedMinutes >= policy.halfDayMinutes) return "HALF_DAY";
  return "ABSENT";
}

/** Late minutes relative to the shift start, after the grace window. */
export function lateMinutesFor(
  checkInMinutesFromMidnight: number,
  shiftStart: string,
  policy: WorkPolicy,
): number {
  const [h, m] = shiftStart.split(":").map(Number);
  const expected = h * 60 + m + policy.lateGraceMinutes;
  return Math.max(0, checkInMinutesFromMidnight - expected);
}

export function earlyExitMinutesFor(
  checkOutMinutesFromMidnight: number,
  shiftEnd: string,
): number {
  const [h, m] = shiftEnd.split(":").map(Number);
  return Math.max(0, h * 60 + m - checkOutMinutesFromMidnight);
}

/* =================================================================== leave */

export type LeaveWindow = {
  startDate: WorkDate;
  endDate: WorkDate;
  halfDay: boolean;
};

export type LeaveValidationFacts = {
  today: WorkDate;
  weeklyOffCsv: string;
  holidays: Set<WorkDate>;
  /** Existing PENDING/APPROVED windows for the same employee. */
  existing: { id: string; startDate: WorkDate; endDate: WorkDate; status: LeaveStatus }[];
  /** Remaining days for the requested type, or null when the type is unlimited. */
  remainingDays: number | null;
  requiresReason: boolean;
  reason: string;
  /** How far ahead a request may be filed. */
  maxAdvanceDays?: number;
  /** How far back a request may be back-dated. */
  maxBackdateDays?: number;
};

export type LeaveValidationResult =
  | { ok: true; workingDays: number; dates: WorkDate[] }
  | { ok: false; message: string; field?: string; hint?: string };

/**
 * Working days inside a window, excluding weekly offs and public holidays.
 *
 * A half day only costs 0.5 when the selected date is actually a working day —
 * otherwise the window costs nothing, which keeps the form preview honest for a
 * half day requested on a holiday.
 */
export function countLeaveWorkingDays(
  window: LeaveWindow,
  weeklyOffCsv: string,
  holidays: Set<WorkDate>,
): { workingDays: number; dates: WorkDate[] } {
  const dates = eachWorkDate(window.startDate, window.endDate).filter(
    (d) => !isWeeklyOff(d, weeklyOffCsv) && !holidays.has(d),
  );
  if (dates.length === 0) return { workingDays: 0, dates };
  return { workingDays: window.halfDay ? 0.5 : dates.length, dates };
}

const overlaps = (
  a: { startDate: WorkDate; endDate: WorkDate },
  b: { startDate: WorkDate; endDate: WorkDate },
) => a.startDate <= b.endDate && b.startDate <= a.endDate;

export function validateLeaveRequest(
  window: LeaveWindow,
  facts: LeaveValidationFacts,
): LeaveValidationResult {
  const maxAdvance = facts.maxAdvanceDays ?? 365;
  const maxBackdate = facts.maxBackdateDays ?? 30;

  if (!isWorkDate(window.startDate)) {
    return { ok: false, message: "Choose a valid start date.", field: "startDate" };
  }
  if (!isWorkDate(window.endDate)) {
    return { ok: false, message: "Choose a valid end date.", field: "endDate" };
  }
  if (diffWorkDays(window.startDate, window.endDate) < 0) {
    return {
      ok: false,
      message: "The end date cannot be before the start date.",
      field: "endDate",
    };
  }
  if (window.halfDay && window.startDate !== window.endDate) {
    return {
      ok: false,
      message: "A half day applies to a single date only.",
      field: "endDate",
      hint: "Set the same start and end date, or turn off half day.",
    };
  }
  if (diffWorkDays(facts.today, window.startDate) < -maxBackdate) {
    return {
      ok: false,
      message: `Leave cannot be back-dated more than ${maxBackdate} days.`,
      field: "startDate",
      hint: "Ask HR to record historical leave on your behalf.",
    };
  }
  if (diffWorkDays(facts.today, window.startDate) > maxAdvance) {
    return {
      ok: false,
      message: `Leave cannot be requested more than ${maxAdvance} days in advance.`,
      field: "startDate",
    };
  }

  const reason = facts.reason.trim();
  if (facts.requiresReason && reason.length < 10) {
    return {
      ok: false,
      message: "Add a reason of at least 10 characters so your approver has context.",
      field: "reason",
    };
  }

  const { workingDays, dates } = countLeaveWorkingDays(
    window,
    facts.weeklyOffCsv,
    facts.holidays,
  );

  if (dates.length === 0) {
    return {
      ok: false,
      message: "The selected range contains only weekends and public holidays.",
      field: "startDate",
      hint: "Pick a range that includes at least one working day.",
    };
  }

  const clash = facts.existing.find((e) => overlaps(e, window));
  if (clash) {
    return {
      ok: false,
      message: `These dates overlap an existing ${clash.status.toLowerCase()} request (${clash.startDate} to ${clash.endDate}).`,
      field: "startDate",
      hint: "Withdraw or adjust the other request first.",
    };
  }

  if (facts.remainingDays !== null && workingDays > facts.remainingDays + 1e-9) {
    return {
      ok: false,
      message: `This request needs ${formatDays(workingDays)} but only ${formatDays(
        facts.remainingDays,
      )} remain in your balance.`,
      field: "leaveTypeId",
      hint: "Shorten the range or choose an unpaid leave type.",
    };
  }

  return { ok: true, workingDays, dates };
}

export function formatDays(value: number): string {
  const rounded = Math.round(value * 2) / 2;
  const label = Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
  return `${label} ${rounded === 1 ? "day" : "days"}`;
}

/* ================================================================ payroll */

export type SalaryComponents = {
  basic: number;
  hra: number;
  specialAllowance: number;
  transportAllow: number;
  providentFund: number;
  professionalTax: number;
  healthInsurance: number;
};

export type PayslipLine = {
  key: string;
  label: string;
  kind: "EARNING" | "DEDUCTION";
  amount: number;
};

export type PayslipComputation = {
  lines: PayslipLine[];
  totalEarnings: number;
  totalDeductions: number;
  netPay: number;
  lopDays: number;
  paidDays: number;
  payableDays: number;
};

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Shape of an all-zero payslip, used when a period has no payable days. */
const ZERO_LINES: PayslipLine[] = [
  { key: "basic", label: "Basic salary", kind: "EARNING", amount: 0 },
  { key: "hra", label: "House rent allowance", kind: "EARNING", amount: 0 },
  { key: "specialAllowance", label: "Special allowance", kind: "EARNING", amount: 0 },
  { key: "transportAllow", label: "Transport allowance", kind: "EARNING", amount: 0 },
  { key: "providentFund", label: "Provident fund", kind: "DEDUCTION", amount: 0 },
  { key: "professionalTax", label: "Professional tax", kind: "DEDUCTION", amount: 0 },
  { key: "healthInsurance", label: "Health insurance", kind: "DEDUCTION", amount: 0 },
];

/**
 * Compute a payslip from the salary structure and the month's attendance.
 *
 * Loss of pay is pro-rated on *payable* days (calendar days minus week-offs and
 * holidays), which is how an Indian monthly payroll usually works, so the number
 * on screen can always be explained back to the attendance table.
 *
 * A period with no payable days at all produces a zero payslip rather than a full
 * one: paying 100% for a month nobody could work would be the wrong default, and
 * charging deductions against zero earnings would produce a negative net.
 */
export function computePayslip(input: {
  components: SalaryComponents;
  payableDays: number;
  unpaidAbsenceDays: number;
}): PayslipComputation {
  const { components } = input;
  const payableDays = Math.max(0, input.payableDays);

  if (payableDays === 0) {
    return {
      lines: ZERO_LINES.map((line) => ({ ...line })),
      totalEarnings: 0,
      totalDeductions: 0,
      netPay: 0,
      lopDays: 0,
      paidDays: 0,
      payableDays: 0,
    };
  }

  const lopDays = Math.min(Math.max(0, round2(input.unpaidAbsenceDays)), payableDays);
  const paidDays = round2(payableDays - lopDays);
  const ratio = paidDays / payableDays;

  const earnings: PayslipLine[] = [
    { key: "basic", label: "Basic salary", kind: "EARNING", amount: round2(components.basic * ratio) },
    { key: "hra", label: "House rent allowance", kind: "EARNING", amount: round2(components.hra * ratio) },
    {
      key: "specialAllowance",
      label: "Special allowance",
      kind: "EARNING",
      amount: round2(components.specialAllowance * ratio),
    },
    {
      key: "transportAllow",
      label: "Transport allowance",
      kind: "EARNING",
      amount: round2(components.transportAllow * ratio),
    },
  ];

  const deductions: PayslipLine[] = [
    {
      key: "providentFund",
      label: "Provident fund",
      kind: "DEDUCTION",
      amount: round2(components.providentFund),
    },
    {
      key: "professionalTax",
      label: "Professional tax",
      kind: "DEDUCTION",
      amount: round2(components.professionalTax),
    },
    {
      key: "healthInsurance",
      label: "Health insurance",
      kind: "DEDUCTION",
      amount: round2(components.healthInsurance),
    },
  ];

  const totalEarnings = round2(earnings.reduce((s, l) => s + l.amount, 0));
  const totalDeductions = round2(deductions.reduce((s, l) => s + l.amount, 0));

  return {
    lines: [...earnings, ...deductions],
    totalEarnings,
    totalDeductions,
    netPay: round2(totalEarnings - totalDeductions),
    lopDays,
    paidDays,
    payableDays,
  };
}

export function grossMonthly(c: SalaryComponents): number {
  return round2(c.basic + c.hra + c.specialAllowance + c.transportAllow);
}

export function monthlyDeductions(c: SalaryComponents): number {
  return round2(c.providentFund + c.professionalTax + c.healthInsurance);
}

export function annualCtc(c: SalaryComponents): number {
  return round2(grossMonthly(c) * 12);
}

/** Guard rails for HR editing a salary structure. */
export function validateSalaryStructure(
  c: SalaryComponents,
): { ok: true } | { ok: false; message: string; field?: string } {
  const entries = Object.entries(c) as [keyof SalaryComponents, number][];
  for (const [key, value] of entries) {
    if (!Number.isFinite(value) || value < 0) {
      return { ok: false, message: "Every salary component must be zero or more.", field: key };
    }
    if (value > 100_000_000) {
      return { ok: false, message: "That amount looks unrealistic. Check the value.", field: key };
    }
  }
  if (c.basic <= 0) {
    return { ok: false, message: "Basic salary must be greater than zero.", field: "basic" };
  }
  const gross = grossMonthly(c);
  const deductions = monthlyDeductions(c);
  if (deductions >= gross) {
    return {
      ok: false,
      message: "Deductions cannot be greater than or equal to gross pay.",
      field: "providentFund",
    };
  }
  if (c.basic < gross * 0.3) {
    return {
      ok: false,
      message: "Basic salary should be at least 30% of gross pay to stay compliant.",
      field: "basic",
    };
  }
  return { ok: true };
}

/* ======================================================== attention engine */

export type AttentionSeverity = "CRITICAL" | "WARNING" | "INFO";

export type AttentionFlag = {
  id: string;
  severity: AttentionSeverity;
  /** Short headline, e.g. "3 leave requests waiting over 3 days". */
  title: string;
  /** Plain-English explanation of the *rule* that fired. */
  because: string;
  /** What the HR user should do next. */
  action: string;
  href: string;
  count: number;
};

export type AttentionFacts = {
  today: WorkDate;
  pendingLeave: { id: string; createdAt: Date; employeeName: string }[];
  /** Employees with >= 3 late arrivals in the trailing 14 working days. */
  chronicLate: { employeeId: string; name: string; lateDays: number }[];
  /** Employees checked in but never checked out on a past day. */
  missingCheckout: { employeeId: string; name: string; workDate: WorkDate }[];
  /** Employed people with no salary structure. */
  missingSalary: { employeeId: string; name: string }[];
  /** Absence rate over the trailing 30 days, per department. */
  highAbsence: { department: string; ratePct: number }[];
  /** Employed people who have not checked in today and are not on leave. */
  unaccountedToday: { employeeId: string; name: string }[];
  payrollPeriod: string;
  payrollStatus: string | null;
};

const AGING_THRESHOLD_HOURS = 48;

/**
 * Turn raw facts into a prioritised HR work queue.
 *
 * Every flag states the rule that produced it — there is no scoring model and
 * nothing is inferred, so an HR user can always audit why an item appeared.
 */
export function buildAttentionQueue(
  facts: AttentionFacts,
  now: Date,
): AttentionFlag[] {
  const flags: AttentionFlag[] = [];

  const aging = facts.pendingLeave.filter(
    (r) => now.getTime() - new Date(r.createdAt).getTime() > AGING_THRESHOLD_HOURS * 3600_000,
  );
  if (aging.length > 0) {
    flags.push({
      id: "leave-aging",
      severity: "CRITICAL",
      title: `${aging.length} leave request${aging.length > 1 ? "s" : ""} waiting over 48 hours`,
      because: `Oldest is from ${aging[0].employeeName}. Rule: pending longer than ${AGING_THRESHOLD_HOURS}h.`,
      action: "Review the approval queue",
      href: "/leave?status=PENDING",
      count: aging.length,
    });
  } else if (facts.pendingLeave.length > 0) {
    flags.push({
      id: "leave-pending",
      severity: "INFO",
      title: `${facts.pendingLeave.length} leave request${facts.pendingLeave.length > 1 ? "s" : ""} awaiting a decision`,
      because: "Rule: any request in PENDING state.",
      action: "Open the approval queue",
      href: "/leave?status=PENDING",
      count: facts.pendingLeave.length,
    });
  }

  if (facts.missingSalary.length > 0) {
    flags.push({
      id: "payroll-missing-structure",
      severity: "CRITICAL",
      title: `${facts.missingSalary.length} employee${facts.missingSalary.length > 1 ? "s have" : " has"} no salary structure`,
      because: `Rule: employed staff without a SalaryStructure record — ${facts.missingSalary
        .slice(0, 2)
        .map((e) => e.name)
        .join(", ")}${facts.missingSalary.length > 2 ? "…" : ""}. They will be skipped by payroll.`,
      action: "Add salary structures",
      href: "/payroll",
      count: facts.missingSalary.length,
    });
  }

  if (facts.missingCheckout.length > 0) {
    flags.push({
      id: "attendance-missing-checkout",
      severity: "WARNING",
      title: `${facts.missingCheckout.length} unclosed attendance record${facts.missingCheckout.length > 1 ? "s" : ""}`,
      because: "Rule: checked in on a past day with no check-out, so hours cannot be computed.",
      action: "Adjust the records",
      href: "/attendance?filter=unclosed",
      count: facts.missingCheckout.length,
    });
  }

  if (facts.chronicLate.length > 0) {
    flags.push({
      id: "attendance-chronic-late",
      severity: "WARNING",
      title: `${facts.chronicLate.length} employee${facts.chronicLate.length > 1 ? "s" : ""} repeatedly arriving late`,
      because: `Rule: 3 or more late check-ins in the last 14 working days (${facts.chronicLate
        .slice(0, 2)
        .map((e) => `${e.name} ${e.lateDays}×`)
        .join(", ")}).`,
      action: "Review attendance trend",
      href: "/reports?report=attendance",
      count: facts.chronicLate.length,
    });
  }

  const worstDept = facts.highAbsence
    .filter((d) => d.ratePct >= 15)
    .sort((a, b) => b.ratePct - a.ratePct)[0];
  if (worstDept) {
    flags.push({
      id: "absence-hotspot",
      severity: "WARNING",
      title: `${worstDept.department} absence at ${worstDept.ratePct.toFixed(0)}%`,
      because: "Rule: departmental absence above 15% of expected working days in the last 30 days.",
      action: "Open the leave report",
      href: "/reports?report=leave",
      count: 1,
    });
  }

  if (facts.unaccountedToday.length > 0) {
    flags.push({
      id: "unaccounted-today",
      severity: "INFO",
      title: `${facts.unaccountedToday.length} not yet checked in today`,
      because: "Rule: employed, not on approved leave, and no check-in recorded for today.",
      action: "See today's attendance",
      href: "/attendance",
      count: facts.unaccountedToday.length,
    });
  }

  if (facts.payrollStatus === null) {
    flags.push({
      id: "payroll-not-started",
      severity: "INFO",
      title: `Payroll for ${facts.payrollPeriod} has not been created`,
      because: "Rule: no PayrollRun row exists for the current period.",
      action: "Run payroll",
      href: "/payroll",
      count: 1,
    });
  } else if (facts.payrollStatus === "PROCESSED") {
    flags.push({
      id: "payroll-awaiting-payment",
      severity: "INFO",
      title: `Payroll for ${facts.payrollPeriod} is processed but not marked paid`,
      because: "Rule: PayrollRun is in PROCESSED state.",
      action: "Confirm payment",
      href: "/payroll",
      count: 1,
    });
  }

  const order: Record<AttentionSeverity, number> = { CRITICAL: 0, WARNING: 1, INFO: 2 };
  return flags.sort((a, b) => order[a.severity] - order[b.severity] || b.count - a.count);
}

/** Trailing window of work dates, oldest first, inclusive of `today`. */
export function trailingWindow(today: WorkDate, days: number): WorkDate[] {
  return eachWorkDate(addWorkDays(today, -(days - 1)), today);
}
