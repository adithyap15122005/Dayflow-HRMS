import "server-only";

import { prisma } from "@/lib/db";
import { eachWorkDate, type WorkDate } from "@/lib/domain/time";

/**
 * Calendar days covered by approved leave.
 *
 * Shared by the attendance and payroll services so "on leave" means exactly the
 * same thing on the attendance grid, the dashboard and the payslip.
 */
export async function approvedLeaveDates(
  employeeIds: string[],
  from: WorkDate,
  to: WorkDate,
): Promise<Map<string, Set<WorkDate>>> {
  const map = new Map<string, Set<WorkDate>>();
  if (employeeIds.length === 0) return map;

  const requests = await prisma.leaveRequest.findMany({
    where: {
      employeeId: { in: employeeIds },
      status: "APPROVED",
      startDate: { lte: to },
      endDate: { gte: from },
    },
    select: { employeeId: true, startDate: true, endDate: true },
  });

  for (const request of requests) {
    const bucket = map.get(request.employeeId) ?? new Set<WorkDate>();
    for (const day of eachWorkDate(request.startDate, request.endDate)) {
      if (day >= from && day <= to) bucket.add(day);
    }
    map.set(request.employeeId, bucket);
  }
  return map;
}

/** Convenience wrapper for a single employee. */
export async function approvedLeaveDatesFor(
  employeeId: string,
  from: WorkDate,
  to: WorkDate,
): Promise<Set<WorkDate>> {
  const map = await approvedLeaveDates([employeeId], from, to);
  return map.get(employeeId) ?? new Set();
}
