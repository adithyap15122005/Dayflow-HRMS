import { describe, expect, it } from "vitest";

import {
  DEFAULT_WORK_POLICY,
  buildAttentionQueue,
  canCancelLeave,
  canCheckIn,
  canCheckOut,
  canDecideLeave,
  canEditCompensation,
  canRunPayroll,
  canViewCompensation,
  canViewDocument,
  canViewEmployee,
  computePayslip,
  countLeaveWorkingDays,
  deriveCompletedStatus,
  earlyExitMinutesFor,
  editableFieldsFor,
  formatDays,
  grossMonthly,
  isWeeklyOff,
  lateMinutesFor,
  monthlyDeductions,
  nonWorkingReason,
  parseWeeklyOff,
  partitionProfilePatch,
  trailingWindow,
  validateLeaveRequest,
  validateSalaryStructure,
  workedMinutesBetween,
  type Actor,
  type AttentionFacts,
  type CheckInFacts,
  type LeaveValidationFacts,
  type LeaveValidationResult,
  type LeaveWindow,
  type SalaryComponents,
} from "@/lib/domain/rules";
/* ------------------------------------------------------------- fixtures */

const admin: Actor = { userId: "u-admin", role: "ADMIN", employeeId: "e-admin" };
const hr: Actor = { userId: "u-hr", role: "HR", employeeId: "e-hr" };
const employee: Actor = { userId: "u-emp", role: "EMPLOYEE", employeeId: "e-emp" };
const COLLEAGUE = "e-other";

/** Sat + Sun off. In Aug 2026: 20th Thu, 21st Fri, 22nd Sat, 23rd Sun, 24th Mon, 25th Tue. */
const WEEKEND = "0,6";

type Decision = { ok: true } | { ok: false; reason: string; hint?: string };

function denial(result: Decision): { reason: string; hint?: string } {
  if (result.ok) throw new Error("expected the rule to deny the action");
  return result;
}

function rejection(result: LeaveValidationResult) {
  if (result.ok) {
    throw new Error(`expected a rejection, got ${JSON.stringify(result)}`);
  }
  return result;
}

function acceptance(result: LeaveValidationResult) {
  if (!result.ok) throw new Error(`expected acceptance, got: ${result.message}`);
  return result;
}

/* ------------------------------------------------------ access decisions */

describe("employee record access", () => {
  it("lets management read anyone and employees read only themselves", () => {
    expect(canViewEmployee(admin, COLLEAGUE)).toBe(true);
    expect(canViewEmployee(hr, COLLEAGUE)).toBe(true);
    expect(canViewEmployee(employee, "e-emp")).toBe(true);
    expect(canViewEmployee(employee, COLLEAGUE)).toBe(false);
  });

  it("never leaks records to an actor with no employee link", () => {
    const orphan: Actor = { userId: "u-x", role: "EMPLOYEE", employeeId: null };
    expect(canViewEmployee(orphan, COLLEAGUE)).toBe(false);
    expect(canViewCompensation(orphan, COLLEAGUE)).toBe(false);
  });
});
describe("compensation and payroll access", () => {
  it("keeps an employee out of a colleague's compensation", () => {
    expect(canViewCompensation(employee, COLLEAGUE)).toBe(false);
    expect(canViewCompensation(employee, "e-emp")).toBe(true);
    expect(canViewCompensation(hr, COLLEAGUE)).toBe(true);
    expect(canViewCompensation(admin, COLLEAGUE)).toBe(true);
  });

  it("restricts salary edits to management", () => {
    expect(canEditCompensation(admin)).toBe(true);
    expect(canEditCompensation(hr)).toBe(true);
    expect(canEditCompensation(employee)).toBe(false);
  });

  it("restricts running payroll to admins only", () => {
    expect(canRunPayroll(admin)).toBe(true);
    expect(canRunPayroll(hr)).toBe(false);
    expect(canRunPayroll(employee)).toBe(false);
  });
});

describe("canViewDocument", () => {
  it("hides confidential documents from the owning employee", () => {
    const confidential = { employeeId: "e-emp", confidential: true };
    const open = { employeeId: "e-emp", confidential: false };
    expect(canViewDocument(employee, confidential)).toBe(false);
    expect(canViewDocument(employee, open)).toBe(true);
    expect(canViewDocument(employee, { employeeId: COLLEAGUE, confidential: false })).toBe(
      false,
    );
    expect(canViewDocument(hr, confidential)).toBe(true);
  });
});

describe("canDecideLeave", () => {
  const pending = { employeeId: COLLEAGUE, status: "PENDING" };

  it("lets HR decide someone else's pending request", () => {
    expect(canDecideLeave(hr, pending)).toEqual({ ok: true });
    expect(canDecideLeave(admin, pending)).toEqual({ ok: true });
  });

  it("blocks employees entirely", () => {
    expect(denial(canDecideLeave(employee, pending)).reason).toMatch(
      /only hr and administrators/i,
    );
  });

  it("blocks an admin from deciding their OWN request", () => {
    const own = { employeeId: "e-admin", status: "PENDING" };
    expect(denial(canDecideLeave(admin, own)).reason).toMatch(/cannot decide your own/i);
  });

  it("blocks a request that is no longer pending", () => {
    for (const status of ["APPROVED", "REJECTED", "CANCELLED"]) {
      const reason = denial(
        canDecideLeave(hr, { employeeId: COLLEAGUE, status }),
      ).reason;
      expect(reason).toContain(status.toLowerCase());
      expect(reason).toMatch(/no longer be decided/i);
    }
  });
});
describe("canCancelLeave", () => {
  it("lets the owner withdraw a pending request", () => {
    expect(canCancelLeave(employee, { employeeId: "e-emp", status: "PENDING" })).toEqual({
      ok: true,
    });
  });

  it("lets management withdraw someone else's pending request", () => {
    expect(canCancelLeave(hr, { employeeId: COLLEAGUE, status: "PENDING" })).toEqual({
      ok: true,
    });
  });

  it("stops an employee withdrawing a colleague's request", () => {
    expect(
      denial(canCancelLeave(employee, { employeeId: COLLEAGUE, status: "PENDING" })).reason,
    ).toMatch(/only withdraw your own/i);
  });

  it("stops withdrawal once the request is decided", () => {
    expect(
      denial(canCancelLeave(employee, { employeeId: "e-emp", status: "APPROVED" })).reason,
    ).toMatch(/only pending requests/i);
  });
});

describe("partitionProfilePatch", () => {
  const patch = {
    phone: "+91 90000 00001",
    address: "12 MG Road",
    jobTitle: "Staff Engineer",
    status: "INACTIVE",
  };

  it("rejects HR-only fields when an employee edits their own profile", () => {
    const { allowed, rejected } = partitionProfilePatch(employee, "e-emp", patch);
    expect(allowed).toEqual({ phone: patch.phone, address: patch.address });
    expect(rejected).toEqual(["jobTitle", "status"]);
  });

  it("allows both field sets for HR", () => {
    const { allowed, rejected } = partitionProfilePatch(hr, "e-emp", patch);
    expect(allowed).toEqual(patch);
    expect(rejected).toEqual([]);
  });

  it("rejects everything when an employee edits a colleague", () => {
    const { allowed, rejected } = partitionProfilePatch(employee, COLLEAGUE, patch);
    expect(allowed).toEqual({});
    expect(rejected).toEqual(["phone", "address", "jobTitle", "status"]);
    expect(editableFieldsFor(employee, COLLEAGUE)).toEqual([]);
  });

  it("ignores undefined values instead of reporting them as rejected", () => {
    const { allowed, rejected } = partitionProfilePatch(employee, "e-emp", {
      phone: undefined,
      jobTitle: undefined,
    });
    expect(allowed).toEqual({});
    expect(rejected).toEqual([]);
  });
});
/* ------------------------------------------------------------- attendance */

describe("weekly off parsing", () => {
  it("reads a CSV of JS day indexes and drops junk", () => {
    expect(parseWeeklyOff("0,6")).toEqual([0, 6]);
    expect(parseWeeklyOff(" 0 , 6 ")).toEqual([0, 6]);
    expect(parseWeeklyOff("0,6,7,-1,x")).toEqual([0, 6]);
  });

  it("flags the configured days as weekly offs", () => {
    expect(isWeeklyOff("2026-08-22", WEEKEND)).toBe(true); // Saturday
    expect(isWeeklyOff("2026-08-23", WEEKEND)).toBe(true); // Sunday
    expect(isWeeklyOff("2026-08-20", WEEKEND)).toBe(false); // Thursday
    expect(isWeeklyOff("2026-08-22", "0")).toBe(false); // only Sunday is off
  });
});

describe("nonWorkingReason", () => {
  const base = {
    weeklyOffCsv: WEEKEND,
    holidayNames: new Set<string>(),
    approvedLeaveDates: new Set<string>(),
  };

  it("prefers LEAVE, then HOLIDAY, then WEEK_OFF", () => {
    expect(
      nonWorkingReason({
        ...base,
        date: "2026-08-22",
        holidayNames: new Set(["2026-08-22"]),
        approvedLeaveDates: new Set(["2026-08-22"]),
      }),
    ).toBe("LEAVE");
    expect(
      nonWorkingReason({
        ...base,
        date: "2026-08-22",
        holidayNames: new Set(["2026-08-22"]),
      }),
    ).toBe("HOLIDAY");
    expect(nonWorkingReason({ ...base, date: "2026-08-22" })).toBe("WEEK_OFF");
  });

  it("returns null on an ordinary working day", () => {
    expect(nonWorkingReason({ ...base, date: "2026-08-20" })).toBeNull();
  });
});
describe("canCheckIn / canCheckOut", () => {
  const IN = new Date("2026-08-20T03:35:00Z");
  const OUT = new Date("2026-08-20T12:15:00Z");
  const fresh: CheckInFacts = { existing: null, nonWorking: null };
  const checkedIn: CheckInFacts = {
    existing: { checkInAt: IN, checkOutAt: null, status: "PRESENT" },
    nonWorking: null,
  };
  const closed: CheckInFacts = {
    existing: { checkInAt: IN, checkOutAt: OUT, status: "PRESENT" },
    nonWorking: null,
  };

  it("allows a check-in on a fresh working day", () => {
    expect(canCheckIn(fresh)).toEqual({ ok: true });
  });

  it("rejects a duplicate check-in", () => {
    expect(denial(canCheckIn(checkedIn)).reason).toMatch(/already checked in/i);
  });

  it("rejects a second check-in after the day is closed", () => {
    const result = denial(canCheckIn(closed));
    expect(result.reason).toMatch(/already completed your workday/i);
    expect(result.hint).toMatch(/ask hr/i);
  });

  it("rejects a check-in while on approved leave, with a hint", () => {
    const onLeave: CheckInFacts = { existing: null, nonWorking: "LEAVE" };
    const result = denial(canCheckIn(onLeave));
    expect(result.reason).toMatch(/approved leave/i);
    expect(result.hint).toMatch(/withdraw the leave request/i);
  });

  it("still allows a voluntary check-in on a week off or holiday", () => {
    expect(canCheckIn({ existing: null, nonWorking: "WEEK_OFF" })).toEqual({ ok: true });
    expect(canCheckIn({ existing: null, nonWorking: "HOLIDAY" })).toEqual({ ok: true });
  });

  it("rejects a check-out before any check-in", () => {
    const result = denial(canCheckOut(fresh));
    expect(result.reason).toMatch(/cannot check out before checking in/i);
    expect(result.hint).toMatch(/check in/i);
    expect(
      denial(
        canCheckOut({
          existing: { checkInAt: null, checkOutAt: null, status: "ABSENT" },
          nonWorking: null,
        }),
      ).reason,
    ).toMatch(/cannot check out before checking in/i);
  });

  it("allows one check-out and rejects the second", () => {
    expect(canCheckOut(checkedIn)).toEqual({ ok: true });
    expect(denial(canCheckOut(closed)).reason).toMatch(/already checked out/i);
  });
});
describe("worked minutes and completed status", () => {
  it("floors negative spans at zero", () => {
    const start = new Date("2026-08-20T03:30:00Z");
    const end = new Date("2026-08-20T12:00:00Z");
    expect(workedMinutesBetween(start, end)).toBe(510);
    expect(workedMinutesBetween(end, start)).toBe(0);
    expect(workedMinutesBetween(start, start)).toBe(0);
  });

  it("treats exactly-standard as PRESENT and exactly-half as HALF_DAY", () => {
    const p = DEFAULT_WORK_POLICY;
    expect(p.standardWorkMinutes).toBe(510);
    expect(p.halfDayMinutes).toBe(240);
    expect(deriveCompletedStatus(p.standardWorkMinutes, p)).toBe("PRESENT");
    expect(deriveCompletedStatus(p.standardWorkMinutes + 1, p)).toBe("PRESENT");
    expect(deriveCompletedStatus(p.standardWorkMinutes - 1, p)).toBe("HALF_DAY");
    expect(deriveCompletedStatus(p.halfDayMinutes, p)).toBe("HALF_DAY");
    expect(deriveCompletedStatus(p.halfDayMinutes - 1, p)).toBe("ABSENT");
    expect(deriveCompletedStatus(0, p)).toBe("ABSENT");
  });
});

describe("late and early-exit minutes", () => {
  it("absorbs the grace window and never goes negative", () => {
    const shift = "09:30"; // 570 minutes; grace is 10 minutes
    expect(lateMinutesFor(570, shift, DEFAULT_WORK_POLICY)).toBe(0);
    expect(lateMinutesFor(580, shift, DEFAULT_WORK_POLICY)).toBe(0); // last grace minute
    expect(lateMinutesFor(581, shift, DEFAULT_WORK_POLICY)).toBe(1);
    expect(lateMinutesFor(600, shift, DEFAULT_WORK_POLICY)).toBe(20);
    expect(lateMinutesFor(480, shift, DEFAULT_WORK_POLICY)).toBe(0); // early arrival
    expect(lateMinutesFor(0, shift, DEFAULT_WORK_POLICY)).toBe(0);
  });

  it("counts only minutes left before the shift ends", () => {
    expect(earlyExitMinutesFor(1000, "18:30")).toBe(110);
    expect(earlyExitMinutesFor(1110, "18:30")).toBe(0);
    expect(earlyExitMinutesFor(1200, "18:30")).toBe(0); // stayed late
  });

  it("respects a zero grace policy", () => {
    const strict = { ...DEFAULT_WORK_POLICY, lateGraceMinutes: 0 };
    expect(lateMinutesFor(571, "09:30", strict)).toBe(1);
    expect(lateMinutesFor(570, "09:30", strict)).toBe(0);
  });
});
/* ------------------------------------------------------------------ leave */

describe("countLeaveWorkingDays", () => {
  it("excludes weekly offs and public holidays", () => {
    const result = countLeaveWorkingDays(
      { startDate: "2026-08-20", endDate: "2026-08-24", halfDay: false },
      WEEKEND,
      new Set(["2026-08-21"]),
    );
    expect(result.dates).toEqual(["2026-08-20", "2026-08-24"]);
    expect(result.workingDays).toBe(2);
  });

  it("counts every non-off day when there are no holidays", () => {
    const result = countLeaveWorkingDays(
      { startDate: "2026-08-20", endDate: "2026-08-25", halfDay: false },
      WEEKEND,
      new Set<string>(),
    );
    expect(result.dates).toEqual([
      "2026-08-20",
      "2026-08-21",
      "2026-08-24",
      "2026-08-25",
    ]);
    expect(result.workingDays).toBe(4);
  });

  it("returns 0.5 for a half day", () => {
    const result = countLeaveWorkingDays(
      { startDate: "2026-08-20", endDate: "2026-08-20", halfDay: true },
      WEEKEND,
      new Set<string>(),
    );
    expect(result.workingDays).toBe(0.5);
    expect(result.dates).toEqual(["2026-08-20"]);
  });

  it("returns nothing for a pure weekend", () => {
    const result = countLeaveWorkingDays(
      { startDate: "2026-08-22", endDate: "2026-08-23", halfDay: false },
      WEEKEND,
      new Set<string>(),
    );
    expect(result.dates).toEqual([]);
    expect(result.workingDays).toBe(0);
  });
});

describe("formatDays", () => {
  it("pluralises and snaps to half days", () => {
    expect(formatDays(1)).toBe("1 day");
    expect(formatDays(0.5)).toBe("0.5 days");
    expect(formatDays(4)).toBe("4 days");
    expect(formatDays(2.3)).toBe("2.5 days");
  });
});

describe("trailingWindow", () => {
  it("is inclusive of today and oldest first", () => {
    expect(trailingWindow("2026-08-24", 3)).toEqual([
      "2026-08-22",
      "2026-08-23",
      "2026-08-24",
    ]);
    expect(trailingWindow("2026-08-24", 1)).toEqual(["2026-08-24"]);
  });
});
describe("validateLeaveRequest", () => {
  const window = (over: Partial<LeaveWindow> = {}): LeaveWindow => ({
    startDate: "2026-08-20",
    endDate: "2026-08-25",
    halfDay: false,
    ...over,
  });

  const facts = (over: Partial<LeaveValidationFacts> = {}): LeaveValidationFacts => ({
    today: "2026-08-20",
    weeklyOffCsv: WEEKEND,
    holidays: new Set<string>(),
    existing: [],
    remainingDays: 10,
    requiresReason: true,
    reason: "Attending a family function out of town",
    ...over,
  });

  it("accepts a valid request and reports the working days", () => {
    const result = acceptance(validateLeaveRequest(window(), facts()));
    expect(result.workingDays).toBe(4);
    expect(result.dates).toEqual([
      "2026-08-20",
      "2026-08-21",
      "2026-08-24",
      "2026-08-25",
    ]);
  });

  it("accepts a single-date half day as 0.5 days", () => {
    const result = acceptance(
      validateLeaveRequest(
        window({ startDate: "2026-08-20", endDate: "2026-08-20", halfDay: true }),
        facts(),
      ),
    );
    expect(result.workingDays).toBe(0.5);
  });

  it("rejects an end date before the start date", () => {
    const result = rejection(
      validateLeaveRequest(
        window({ startDate: "2026-08-21", endDate: "2026-08-20" }),
        facts(),
      ),
    );
    expect(result.message).toBe("The end date cannot be before the start date.");
    expect(result.field).toBe("endDate");
  });

  it("rejects a half day spanning two dates", () => {
    const result = rejection(
      validateLeaveRequest(
        window({ startDate: "2026-08-20", endDate: "2026-08-21", halfDay: true }),
        facts(),
      ),
    );
    expect(result.message).toBe("A half day applies to a single date only.");
    expect(result.field).toBe("endDate");
    expect(result.hint).toMatch(/same start and end date/i);
  });
  it("rejects an invalid calendar date", () => {
    expect(
      rejection(validateLeaveRequest(window({ startDate: "2026-02-30" }), facts())).message,
    ).toBe("Choose a valid start date.");
    expect(
      rejection(validateLeaveRequest(window({ endDate: "2026-13-01" }), facts())).message,
    ).toBe("Choose a valid end date.");
  });

  it("requires a reason of at least 10 characters when configured", () => {
    for (const reason of ["", "   ", "sick", "flu again"]) {
      const result = rejection(validateLeaveRequest(window(), facts({ reason })));
      expect(result.field).toBe("reason");
      expect(result.message).toMatch(/at least 10 characters/i);
    }
    // Exactly 10 characters after trimming is enough.
    expect(validateLeaveRequest(window(), facts({ reason: "  Root canal  " })).ok).toBe(
      true,
    );
  });

  it("skips the reason check when the leave type does not require one", () => {
    expect(
      validateLeaveRequest(window(), facts({ requiresReason: false, reason: "" })).ok,
    ).toBe(true);
  });

  it("rejects a range that is only weekends and holidays", () => {
    const result = rejection(
      validateLeaveRequest(
        window({ startDate: "2026-08-22", endDate: "2026-08-23" }),
        facts(),
      ),
    );
    expect(result.message).toBe(
      "The selected range contains only weekends and public holidays.",
    );
    expect(result.field).toBe("startDate");
    const holidayOnly = rejection(
      validateLeaveRequest(
        window({ startDate: "2026-08-20", endDate: "2026-08-20" }),
        facts({ holidays: new Set(["2026-08-20"]) }),
      ),
    );
    expect(holidayOnly.message).toMatch(/only weekends and public holidays/i);
  });

  it("rejects an overlap with an existing pending request", () => {
    const result = rejection(
      validateLeaveRequest(
        window({ startDate: "2026-08-24", endDate: "2026-08-25" }),
        facts({
          existing: [
            {
              id: "lr-1",
              startDate: "2026-08-25",
              endDate: "2026-08-28",
              status: "PENDING",
            },
          ],
        }),
      ),
    );
    expect(result.message).toBe(
      "These dates overlap an existing pending request (2026-08-25 to 2026-08-28).",
    );
    expect(result.field).toBe("startDate");
    expect(result.hint).toMatch(/withdraw or adjust/i);
  });
  it("allows a request that only touches the edge of an unrelated request", () => {
    expect(
      validateLeaveRequest(
        window({ startDate: "2026-08-20", endDate: "2026-08-21" }),
        facts({
          existing: [
            {
              id: "lr-1",
              startDate: "2026-08-24",
              endDate: "2026-08-25",
              status: "APPROVED",
            },
          ],
        }),
      ).ok,
    ).toBe(true);
  });

  it("rejects a request larger than the remaining balance", () => {
    const result = rejection(
      validateLeaveRequest(window(), facts({ remainingDays: 1 })),
    );
    expect(result.field).toBe("leaveTypeId");
    expect(result.message).toContain("needs 4 days");
    expect(result.message).toContain("only 1 day remain");
    expect(result.hint).toMatch(/unpaid leave type/i);
  });

  it("allows a request that exactly consumes the balance, and any size when unlimited", () => {
    expect(validateLeaveRequest(window(), facts({ remainingDays: 4 })).ok).toBe(true);
    expect(validateLeaveRequest(window(), facts({ remainingDays: null })).ok).toBe(true);
    expect(validateLeaveRequest(window(), facts({ remainingDays: 3.5 })).ok).toBe(false);
  });

  it("rejects back-dating beyond the allowance", () => {
    const result = rejection(
      validateLeaveRequest(
        window({ startDate: "2026-07-01", endDate: "2026-07-02" }),
        facts(),
      ),
    );
    expect(result.message).toBe("Leave cannot be back-dated more than 30 days.");
    expect(result.field).toBe("startDate");
    expect(
      rejection(
        validateLeaveRequest(
          window({ startDate: "2026-08-13", endDate: "2026-08-14" }),
          facts({ maxBackdateDays: 5 }),
        ),
      ).message,
    ).toBe("Leave cannot be back-dated more than 5 days.");
  });

  it("rejects a request too far in the future", () => {
    expect(
      rejection(
        validateLeaveRequest(
          window({ startDate: "2027-10-01", endDate: "2027-10-02" }),
          facts(),
        ),
      ).message,
    ).toBe("Leave cannot be requested more than 365 days in advance.");
    expect(
      rejection(
        validateLeaveRequest(
          window({ startDate: "2026-10-01", endDate: "2026-10-02" }),
          facts({ maxAdvanceDays: 30 }),
        ),
      ).message,
    ).toBe("Leave cannot be requested more than 30 days in advance.");
  });
});
/* ---------------------------------------------------------------- payroll */

const components: SalaryComponents = {
  basic: 30000,
  hra: 15000,
  specialAllowance: 8000,
  transportAllow: 2000,
  providentFund: 1800,
  professionalTax: 200,
  healthInsurance: 500,
};

describe("computePayslip", () => {
  it("pays the full structure when there is no loss of pay", () => {
    const slip = computePayslip({ components, payableDays: 26, unpaidAbsenceDays: 0 });
    expect(slip.totalEarnings).toBe(55000);
    expect(slip.totalDeductions).toBe(2500);
    expect(slip.netPay).toBe(slip.totalEarnings - slip.totalDeductions);
    expect(slip.netPay).toBe(52500);
    expect(slip.lopDays).toBe(0);
    expect(slip.paidDays).toBe(26);
    expect(slip.payableDays).toBe(26);
    expect(slip.lines).toHaveLength(7);
    expect(slip.lines.filter((l) => l.kind === "EARNING")).toHaveLength(4);
    expect(slip.lines.filter((l) => l.kind === "DEDUCTION")).toHaveLength(3);
  });

  it("pro-rates earnings on loss of pay but never the deductions", () => {
    const slip = computePayslip({ components, payableDays: 26, unpaidAbsenceDays: 2 });
    expect(slip.lopDays).toBe(2);
    expect(slip.paidDays).toBe(24);
    expect(slip.totalEarnings).toBeCloseTo(55000 * (24 / 26), 1);
    expect(slip.totalEarnings).toBeCloseTo(50769.23, 2);
    expect(slip.totalDeductions).toBe(2500);
    expect(slip.netPay).toBeCloseTo(48269.23, 2);
    const basic = slip.lines.find((l) => l.key === "basic");
    expect(basic?.amount).toBeCloseTo(27692.31, 2);
    expect(slip.lines.find((l) => l.key === "providentFund")?.amount).toBe(1800);
  });

  it("handles a half-day of loss of pay", () => {
    const slip = computePayslip({ components, payableDays: 20, unpaidAbsenceDays: 0.5 });
    expect(slip.lopDays).toBe(0.5);
    expect(slip.paidDays).toBe(19.5);
    expect(slip.totalEarnings).toBeCloseTo(53625, 2);
    expect(slip.netPay).toBeCloseTo(51125, 2);
  });

  it("clamps loss of pay to the payable days and floors negatives", () => {
    const over = computePayslip({ components, payableDays: 22, unpaidAbsenceDays: 30 });
    expect(over.lopDays).toBe(22);
    expect(over.paidDays).toBe(0);
    expect(over.totalEarnings).toBe(0);
    expect(over.totalDeductions).toBe(2500);
    expect(over.netPay).toBe(-2500);

    const negative = computePayslip({
      components,
      payableDays: 22,
      unpaidAbsenceDays: -3,
    });
    expect(negative.lopDays).toBe(0);
    expect(negative.paidDays).toBe(22);
  });

  it("produces finite numbers when there are no payable days", () => {
    const slip = computePayslip({ components, payableDays: 0, unpaidAbsenceDays: 5 });
    for (const value of [
      slip.totalEarnings,
      slip.totalDeductions,
      slip.netPay,
      slip.lopDays,
      slip.paidDays,
      ...slip.lines.map((l) => l.amount),
    ]) {
      expect(Number.isFinite(value)).toBe(true);
    }
    expect(slip.lopDays).toBe(0);
    expect(slip.paidDays).toBe(0);
  });
});
describe("salary totals", () => {
  it("sums gross and deductions", () => {
    expect(grossMonthly(components)).toBe(55000);
    expect(monthlyDeductions(components)).toBe(2500);
  });
});

describe("validateSalaryStructure", () => {
  const fail = (result: ReturnType<typeof validateSalaryStructure>) => {
    if (result.ok) throw new Error("expected the structure to be rejected");
    return result;
  };

  it("accepts a sane structure", () => {
    expect(validateSalaryStructure(components)).toEqual({ ok: true });
  });

  it("ignores non-component fields supplied by the salary request", () => {
    const request = { ...components, effectiveFrom: "2026-08-20" };
    expect(validateSalaryStructure(request)).toEqual({ ok: true });
  });

  it("rejects a negative or non-finite component", () => {
    const negative = fail(validateSalaryStructure({ ...components, transportAllow: -1 }));
    expect(negative.message).toBe("Every salary component must be zero or more.");
    expect(negative.field).toBe("transportAllow");
    expect(fail(validateSalaryStructure({ ...components, hra: Number.NaN })).field).toBe(
      "hra",
    );
  });

  it("rejects an implausibly large component", () => {
    expect(
      fail(validateSalaryStructure({ ...components, basic: 200_000_000 })).message,
    ).toMatch(/unrealistic/i);
  });

  it("rejects a zero basic", () => {
    expect(fail(validateSalaryStructure({ ...components, basic: 0 })).message).toBe(
      "Basic salary must be greater than zero.",
    );
  });

  it("rejects deductions greater than or equal to gross", () => {
    const result = fail(
      validateSalaryStructure({
        basic: 10000,
        hra: 0,
        specialAllowance: 0,
        transportAllow: 0,
        providentFund: 10000,
        professionalTax: 0,
        healthInsurance: 0,
      }),
    );
    expect(result.message).toBe(
      "Deductions cannot be greater than or equal to gross pay.",
    );
    expect(result.field).toBe("providentFund");
  });

  it("rejects a basic below 30% of gross but accepts exactly 30%", () => {
    const low = fail(
      validateSalaryStructure({
        ...components,
        basic: 10000,
        hra: 20000,
        specialAllowance: 20000,
        transportAllow: 0,
      }),
    );
    expect(low.message).toMatch(/at least 30% of gross/i);
    expect(low.field).toBe("basic");
    expect(
      validateSalaryStructure({
        ...components,
        basic: 15000,
        hra: 20000,
        specialAllowance: 15000,
        transportAllow: 0,
      }),
    ).toEqual({ ok: true });
  });
});
/* -------------------------------------------------------- attention queue */

describe("buildAttentionQueue", () => {
  const NOW = new Date("2026-08-22T12:00:00Z");
  const hoursBefore = (h: number) => new Date(NOW.getTime() - h * 3600_000);

  const emptyFacts = (over: Partial<AttentionFacts> = {}): AttentionFacts => ({
    today: "2026-08-22",
    pendingLeave: [],
    chronicLate: [],
    missingCheckout: [],
    missingSalary: [],
    highAbsence: [],
    unaccountedToday: [],
    payrollPeriod: "2026-08",
    payrollStatus: "PAID",
    ...over,
  });

  it("raises a CRITICAL leave-aging flag past 48 hours", () => {
    const flags = buildAttentionQueue(
      emptyFacts({
        pendingLeave: [
          { id: "lr-1", createdAt: hoursBefore(72), employeeName: "Asha Rao" },
          { id: "lr-2", createdAt: hoursBefore(50), employeeName: "Vikram Iyer" },
          { id: "lr-3", createdAt: hoursBefore(2), employeeName: "Neha Gupta" },
        ],
      }),
      NOW,
    );
    expect(flags).toHaveLength(1);
    expect(flags[0].id).toBe("leave-aging");
    expect(flags[0].severity).toBe("CRITICAL");
    expect(flags[0].count).toBe(2);
    expect(flags[0].title).toBe("2 leave requests waiting over 48 hours");
    expect(flags[0].because).toContain("Asha Rao");
    expect(flags[0].href).toBe("/leave?status=PENDING");
  });

  it("raises only an INFO flag for fresh requests, and at exactly 48 hours", () => {
    const fresh = buildAttentionQueue(
      emptyFacts({
        pendingLeave: [{ id: "lr-1", createdAt: hoursBefore(3), employeeName: "Asha Rao" }],
      }),
      NOW,
    );
    expect(fresh).toHaveLength(1);
    expect(fresh[0].id).toBe("leave-pending");
    expect(fresh[0].severity).toBe("INFO");
    expect(fresh[0].title).toBe("1 leave request awaiting a decision");

    // The threshold is strictly greater than 48h.
    const boundary = buildAttentionQueue(
      emptyFacts({
        pendingLeave: [{ id: "lr-1", createdAt: hoursBefore(48), employeeName: "Asha Rao" }],
      }),
      NOW,
    );
    expect(boundary[0].id).toBe("leave-pending");
  });
  it("treats missing salary structures as CRITICAL", () => {
    const one = buildAttentionQueue(
      emptyFacts({ missingSalary: [{ employeeId: "e-1", name: "Asha Rao" }] }),
      NOW,
    );
    expect(one[0].id).toBe("payroll-missing-structure");
    expect(one[0].severity).toBe("CRITICAL");
    expect(one[0].title).toBe("1 employee has no salary structure");

    const three = buildAttentionQueue(
      emptyFacts({
        missingSalary: [
          { employeeId: "e-1", name: "Asha Rao" },
          { employeeId: "e-2", name: "Vikram Iyer" },
          { employeeId: "e-3", name: "Neha Gupta" },
        ],
      }),
      NOW,
    );
    expect(three[0].title).toBe("3 employees have no salary structure");
    expect(three[0].because).toContain("Asha Rao, Vikram Iyer");
    expect(three[0].because).not.toContain("Neha Gupta");
    expect(three[0].count).toBe(3);
  });

  it("sorts CRITICAL before WARNING before INFO, then by count", () => {
    const flags = buildAttentionQueue(
      emptyFacts({
        pendingLeave: [{ id: "lr-1", createdAt: hoursBefore(72), employeeName: "Asha Rao" }],
        missingSalary: [{ employeeId: "e-1", name: "Asha Rao" }],
        missingCheckout: [
          { employeeId: "e-1", name: "Asha Rao", workDate: "2026-08-20" },
          { employeeId: "e-2", name: "Vikram Iyer", workDate: "2026-08-21" },
        ],
        chronicLate: [{ employeeId: "e-3", name: "Neha Gupta", lateDays: 4 }],
        unaccountedToday: [
          { employeeId: "e-4", name: "Rahul Menon" },
          { employeeId: "e-5", name: "Priya Nair" },
        ],
        payrollStatus: "PROCESSED",
      }),
      NOW,
    );
    expect(flags.map((f) => f.severity)).toEqual([
      "CRITICAL",
      "CRITICAL",
      "WARNING",
      "WARNING",
      "INFO",
      "INFO",
    ]);
    expect(flags.map((f) => f.id)).toEqual([
      "leave-aging",
      "payroll-missing-structure",
      "attendance-missing-checkout",
      "attendance-chronic-late",
      "unaccounted-today",
      "payroll-awaiting-payment",
    ]);
  });
  it("returns nothing critical for an empty fact set with payroll already paid", () => {
    const flags = buildAttentionQueue(emptyFacts(), NOW);
    expect(flags).toEqual([]);
    expect(flags.filter((f) => f.severity === "CRITICAL")).toHaveLength(0);
  });

  it("nudges when payroll has not been created for the period", () => {
    const flags = buildAttentionQueue(emptyFacts({ payrollStatus: null }), NOW);
    expect(flags).toHaveLength(1);
    expect(flags[0].id).toBe("payroll-not-started");
    expect(flags[0].severity).toBe("INFO");
    expect(flags[0].title).toContain("2026-08");
    expect(buildAttentionQueue(emptyFacts({ payrollStatus: "DRAFT" }), NOW)).toEqual([]);
  });

  it("only reports an absence hotspot at or above 15%, worst department first", () => {
    expect(
      buildAttentionQueue(
        emptyFacts({ highAbsence: [{ department: "Support", ratePct: 14.9 }] }),
        NOW,
      ),
    ).toEqual([]);
    const flags = buildAttentionQueue(
      emptyFacts({
        highAbsence: [
          { department: "Support", ratePct: 16.2 },
          { department: "Sales", ratePct: 21.4 },
        ],
      }),
      NOW,
    );
    expect(flags).toHaveLength(1);
    expect(flags[0].id).toBe("absence-hotspot");
    expect(flags[0].severity).toBe("WARNING");
    expect(flags[0].title).toBe("Sales absence at 21%");
  });
});
