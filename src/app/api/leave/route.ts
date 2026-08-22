import { requireActor } from "@/lib/auth/guard";
import { type LeaveStatus } from "@/lib/domain/constants";
import { jsonCreated, jsonOk, readJson, route } from "@/lib/http";
import { listLeaveRequests, submitLeaveRequest } from "@/lib/services/leave";
import { leaveQuerySchema, leaveRequestSchema } from "@/lib/validation";

export const GET = route(async (request: Request) => {
  const { actor } = await requireActor();
  const url = new URL(request.url);
  const query = leaveQuerySchema.parse(Object.fromEntries(url.searchParams));

  // Asking for organisation scope without the role is refused rather than
  // silently narrowed: failing loudly is the honest signal, and a caller that
  // wanted their own list can ask for it explicitly.
  const requests = await listLeaveRequests(actor, {
    ...query,
    status: query.status as LeaveStatus | undefined,
  });
  return jsonOk({ requests });
});

export const POST = route(async (request: Request) => {
  const { actor } = await requireActor();
  const input = leaveRequestSchema.parse(await readJson(request));

  const created = await submitLeaveRequest(actor, {
    employeeId: actor.employeeId ?? "",
    leaveTypeId: input.leaveTypeId,
    startDate: input.startDate,
    endDate: input.endDate,
    halfDay: input.halfDay,
    reason: input.reason,
  });

  return jsonCreated({
    id: created.id,
    status: created.status,
    workingDays: created.workingDays,
    message: `Request submitted for ${created.workingDays} day(s). Your approver has been notified.`,
  });
});
