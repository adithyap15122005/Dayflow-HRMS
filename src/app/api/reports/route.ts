import { requireManagement, toActor } from "@/lib/auth/guard";
import { jsonOk, route } from "@/lib/http";
import {
  attendanceReport,
  csvFilename,
  headcountReport,
  leaveReport,
  payrollReport,
  tableToCsv,
} from "@/lib/services/reports";
import { reportQuerySchema } from "@/lib/validation";

/**
 * Reports API. `format=csv` streams the same table the screen renders, so an
 * export can never disagree with what the user just looked at.
 */
export const GET = route(async (request: Request) => {
  const user = await requireManagement();
  const actor = toActor(user);
  const url = new URL(request.url);
  const query = reportQuerySchema.parse(Object.fromEntries(url.searchParams));

  const filters = {
    from: query.from,
    to: query.to,
    departmentId: query.departmentId,
    employeeId: query.employeeId,
    status: query.status,
  };

  const result =
    query.report === "leave"
      ? await leaveReport(actor, filters)
      : query.report === "payroll"
        ? await payrollReport(actor, filters)
        : query.report === "headcount"
          ? await headcountReport(actor)
          : await attendanceReport(actor, filters);

  if (query.format === "csv") {
    const range = "range" in result ? result.range : undefined;
    const csv = tableToCsv(result.table);
    return new Response(`﻿${csv}`, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${csvFilename(result.table, range)}"`,
        "Cache-Control": "no-store",
      },
    });
  }

  return jsonOk(result);
});
