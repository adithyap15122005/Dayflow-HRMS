import { requireActor } from "@/lib/auth/guard";
import { jsonOk, route } from "@/lib/http";
import { cancelLeaveRequest } from "@/lib/services/leave";

export const POST = route(
  async (_request: Request, context: { params: Promise<{ id: string }> }) => {
    const { user, actor } = await requireActor();
    const { id } = await context.params;
    const updated = await cancelLeaveRequest(actor, user.fullName, id);
    return jsonOk({
      id: updated.id,
      status: updated.status,
      message: "Request withdrawn.",
    });
  },
);
