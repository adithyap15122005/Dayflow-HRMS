import { requireActor, requireManagement, toActor } from "@/lib/auth/guard";
import { isManagement, type AttendanceStatus } from "@/lib/domain/constants";
import { forbidden } from "@/lib/errors";
import { addWorkDays, startOfMonth } from "@/lib/domain/time";
import { jsonOk, readJson, route } from "@/lib/http";
import {
  adjustAttendance,
  getAttendanceSeries,
  getOrgDay,
  summariseAttendance,
} from "@/lib/services/attendance";
import { getOrgContext } from "@/lib/services/org";
import { attendanceAdjustSchema, attendanceQuerySchema } from "@/lib/validation";

export const GET = route(async (request: Request) => {
  const { actor } = await requireActor();
  const url = new URL(request.url);
  const query = attendanceQuerySchema.parse(Object.fromEntries(url.searchParams));
  const org = await getOrgContext();

  if (query.scope === "org") {
    if (!isManagement(actor.role)) {
      throw forbidden("Only HR and administrators can view organisation attendance.");
    }
    const rows = await getOrgDay(
      query.from ?? org.today,
      { departmentId: query.departmentId, status: query.status as AttendanceStatus },
      org,
    );
    return jsonOk({ workDate: query.from ?? org.today, rows });
  }

  let employeeId = actor.employeeId;
  if (query.employeeId && query.employeeId !== actor.employeeId) {
    if (!isManagement(actor.role)) {
      throw forbidden("You can only view your own attendance.");
    }
    employeeId = query.employeeId;
  }
  if (!employeeId) return jsonOk({ days: [], totals: summariseAttendance([]) });

  const from = query.from ?? startOfMonth(org.today);
  const to = query.to ?? org.today;
  const days = await getAttendanceSeries(employeeId, from, addWorkDays(to, 0), org);
  return jsonOk({ from, to, days, totals: summariseAttendance(days) });
});

/** HR correction. Creates the row when the day has no record at all. */
export const POST = route(async (request: Request) => {
  const user = await requireManagement();
  const input = attendanceAdjustSchema.parse(await readJson(request));

  const record = await adjustAttendance(toActor(user), user.fullName, {
    employeeId: input.employeeId,
    workDate: input.workDate,
    status: input.status,
    checkIn: input.checkIn ?? null,
    checkOut: input.checkOut ?? null,
    note: input.note ?? null,
  });

  return jsonOk({
    workDate: record.workDate,
    status: record.status,
    workedMinutes: record.workedMinutes,
    message: `${record.workDate} updated to ${record.status.toLowerCase().replace("_", " ")}.`,
  });
});
