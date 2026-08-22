import { requireActor } from "@/lib/auth/guard";
import { jsonOk, readJson, route } from "@/lib/http";
import { decideLeaveRequest } from "@/lib/services/leave";
import { leaveDecisionSchema } from "@/lib/validation";

export const POST = route(
  async (request: Request, context: { params: Promise<{ id: string }> }) => {
    const { user, actor } = await requireActor();
    const { id } = await context.params;
    const { decision, comment } = leaveDecisionSchema.parse(await readJson(request));

    const updated = await decideLeaveRequest(
      actor,
      user.fullName,
      id,
      decision,
      comment,
    );

    return jsonOk({
      id: updated.id,
      status: updated.status,
      message:
        decision === "APPROVED"
          ? "Approved. The employee has been notified and their attendance is updated."
          : "Rejected. The employee has been notified with your comment.",
    });
  },
);
