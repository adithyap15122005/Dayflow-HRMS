import { requireActor } from "@/lib/auth/guard";
import { isManagement, type LeaveStatus } from "@/lib/domain/constants";
import { jsonCreated, jsonOk, readJson, route } from "@/lib/http";
import { listLeaveRequests, submitLeaveRequest } from "@/lib/services/leave";
import { leaveQuerySchema, leaveRequestSchema } from "@/lib/validation";

export const GET = route(async (request: Request) => {
  const { actor } = await requireActor();
  const url = new URL(request.url);
  const query = leaveQuerySchema.parse(Object.fromEntries(url.searchParams));

  // An employee is silently pinned to their own scope by the service; asking for
  // "org" without the role throws instead of leaking.
  const scope = query.scope === "org" && !isManagement(actor.role) ? "me" : query.scope;

  const requests = await listLeaveRequests(actor, {
    ...query,
    scope,
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
