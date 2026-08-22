import { describe, expect, it } from "vitest";

import {
  computePayslip,
  countLeaveWorkingDays,
  parseWeeklyOff,
  trailingWindow,
  type SalaryComponents,
} from "./rules";
import { eachWorkDate } from "./time";

/**
 * Regression tests for edge cases found while reviewing the rule engine.
 *
 * Each of these was a real defect: a naive parse that made Sunday a weekly off
 * for a blank CSV, an inverted range that returned a day, a half day that cost
 * balance on a holiday, and a zero-payable-day month that paid in full.
 */

const BAND: SalaryComponents = {
  basic: 50_000,
  hra: 25_000,
  specialAllowance: 15_000,
  transportAllow: 2_000,
  providentFund: 6_000,
  professionalTax: 200,
  healthInsurance: 1_000,
};

describe("parseWeeklyOff", () => {
  it("treats a blank CSV as no weekly off rather than Sunday", () => {
    expect(parseWeeklyOff("")).toEqual([]);
    expect(parseWeeklyOff("   ")).toEqual([]);
  });

  it("ignores a trailing comma instead of adding day 0", () => {
    expect(parseWeeklyOff("6,")).toEqual([6]);
    expect(parseWeeklyOff("0,6")).toEqual([0, 6]);
  });

  it("drops out-of-range and junk tokens", () => {
    expect(parseWeeklyOff("0,7,x,-1,3")).toEqual([0, 3]);
  });
});

describe("eachWorkDate", () => {
  it("returns an empty array for an inverted range", () => {
    expect(eachWorkDate("2026-08-22", "2026-08-20")).toEqual([]);
  });

  it("returns a single day when start equals end", () => {
    expect(eachWorkDate("2026-08-22", "2026-08-22")).toEqual(["2026-08-22"]);
  });

  it("is inclusive of both bounds", () => {
    expect(eachWorkDate("2026-08-20", "2026-08-22")).toEqual([
      "2026-08-20",
      "2026-08-21",
      "2026-08-22",
    ]);
  });
});

describe("trailingWindow", () => {
  it("is empty for a zero-length window, never a future date", () => {
    expect(trailingWindow("2026-08-22", 0)).toEqual([]);
  });

  it("ends on today", () => {
    const window = trailingWindow("2026-08-22", 3);
    expect(window).toEqual(["2026-08-20", "2026-08-21", "2026-08-22"]);
  });
});

describe("countLeaveWorkingDays", () => {
  const sundayOff = "0";
  const holidays = new Set(["2026-08-15"]);

  it("charges nothing for a half day that lands on a holiday", () => {
    const result = countLeaveWorkingDays(
      { startDate: "2026-08-15", endDate: "2026-08-15", halfDay: true },
      sundayOff,
      holidays,
    );
    expect(result.dates).toEqual([]);
    expect(result.workingDays).toBe(0);
  });

  it("charges 0.5 for a half day on a working day", () => {
    const result = countLeaveWorkingDays(
      { startDate: "2026-08-20", endDate: "2026-08-20", halfDay: true },
      sundayOff,
      holidays,
    );
    expect(result.workingDays).toBe(0.5);
  });

  it("excludes weekly offs and holidays from a multi-day window", () => {
    // 2026-08-15 is a holiday, 2026-08-16 is a Sunday.
    const result = countLeaveWorkingDays(
      { startDate: "2026-08-14", endDate: "2026-08-17", halfDay: false },
      sundayOff,
      holidays,
    );
    expect(result.dates).toEqual(["2026-08-14", "2026-08-17"]);
    expect(result.workingDays).toBe(2);
  });
});

describe("computePayslip with no payable days", () => {
  const result = computePayslip({
    components: BAND,
    payableDays: 0,
    unpaidAbsenceDays: 0,
  });

  it("pays nothing rather than a full month", () => {
    expect(result.totalEarnings).toBe(0);
    expect(result.netPay).toBe(0);
  });

  it("charges no deductions, so the net can never go negative", () => {
    expect(result.totalDeductions).toBe(0);
    expect(result.netPay).toBeGreaterThanOrEqual(0);
  });

  it("still returns every line so the payslip layout is stable", () => {
    expect(result.lines).toHaveLength(7);
    expect(result.lines.every((line) => line.amount === 0)).toBe(true);
  });

  it("reports zero paid days", () => {
    expect(result.paidDays).toBe(0);
    expect(result.payableDays).toBe(0);
  });
});

describe("computePayslip pro-rating", () => {
  it("scales earnings but not deductions", () => {
    const full = computePayslip({ components: BAND, payableDays: 26, unpaidAbsenceDays: 0 });
    const half = computePayslip({ components: BAND, payableDays: 26, unpaidAbsenceDays: 13 });

    expect(half.totalEarnings).toBeCloseTo(full.totalEarnings / 2, 1);
    expect(half.totalDeductions).toBe(full.totalDeductions);
    expect(half.paidDays).toBe(13);
  });

  it("clamps loss of pay to the payable days", () => {
    const result = computePayslip({
      components: BAND,
      payableDays: 26,
      unpaidAbsenceDays: 40,
    });
    expect(result.lopDays).toBe(26);
    expect(result.paidDays).toBe(0);
    expect(result.totalEarnings).toBe(0);
  });

  it("never produces NaN from a negative payable-day count", () => {
    const result = computePayslip({
      components: BAND,
      payableDays: -5,
      unpaidAbsenceDays: 2,
    });
    expect(Number.isFinite(result.netPay)).toBe(true);
    expect(result.netPay).toBe(0);
  });
});
