import "server-only";

import { prisma } from "@/lib/db";
import { DEFAULT_WORK_POLICY, type WorkPolicy } from "@/lib/domain/rules";
import { DEFAULT_TIMEZONE, toWorkDate, type WorkDate } from "@/lib/domain/time";

export type OrgContext = {
  companyName: string;
  legalName: string;
  timezone: string;
  currency: string;
  policy: WorkPolicy;
  payrollDayOfMonth: number;
  /** Today, in the organisation's timezone. */
  today: WorkDate;
};

const FALLBACK: Omit<OrgContext, "today"> = {
  companyName: "Dayflow",
  legalName: "Dayflow Technologies Pvt. Ltd.",
  timezone: DEFAULT_TIMEZONE,
  currency: "INR",
  policy: DEFAULT_WORK_POLICY,
  payrollDayOfMonth: 28,
};

/**
 * Load organisation settings.
 *
 * Falls back to sane defaults when the row is missing so a half-seeded database
 * still renders instead of throwing on every page.
 */
export async function getOrgContext(): Promise<OrgContext> {
  const row = await prisma.orgSetting.findUnique({ where: { id: "org" } });
  const base = row
    ? {
        companyName: row.companyName,
        legalName: row.legalName,
        timezone: row.timezone,
        currency: row.currency,
        policy: {
          standardWorkMinutes: row.standardWorkMinutes,
          halfDayMinutes: row.halfDayMinutes,
          lateGraceMinutes: row.lateGraceMinutes,
        },
        payrollDayOfMonth: row.payrollDayOfMonth,
      }
    : FALLBACK;

  return { ...base, today: toWorkDate(new Date(), base.timezone) };
}

/** Public-holiday dates within a range, as a set for O(1) rule checks. */
export async function getHolidaySet(
  from: WorkDate,
  to: WorkDate,
): Promise<Set<WorkDate>> {
  const rows = await prisma.holiday.findMany({
    where: { date: { gte: from, lte: to }, optional: false },
    select: { date: true },
  });
  return new Set(rows.map((r) => r.date));
}

export async function getHolidays(from: WorkDate, to: WorkDate) {
  return prisma.holiday.findMany({
    where: { date: { gte: from, lte: to } },
    orderBy: { date: "asc" },
  });
}
