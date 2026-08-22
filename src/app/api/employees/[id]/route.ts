import { requireActor } from "@/lib/auth/guard";
import { HR_EDITABLE_FIELDS, isManagement } from "@/lib/domain/constants";
import { forbidden } from "@/lib/errors";
import { jsonOk, readJson, route } from "@/lib/http";
import { getEmployeeProfile, updateEmployeeProfile } from "@/lib/services/people";
import { hrProfileSchema, selfProfileSchema } from "@/lib/validation";

export const GET = route(
  async (_request: Request, context: { params: Promise<{ id: string }> }) => {
    const { actor } = await requireActor();
    const { id } = await context.params;
    return jsonOk(await getEmployeeProfile(actor, id));
  },
);

export const PATCH = route(
  async (request: Request, context: { params: Promise<{ id: string }> }) => {
    const { user, actor } = await requireActor();
    const { id } = await context.params;
    const body = await readJson(request);

    // Reject a privilege-escalation attempt by name instead of letting Zod strip
    // the field and then reporting "nothing to update" — the caller deserves to
    // know exactly which field was refused.
    if (!isManagement(actor.role) && body && typeof body === "object") {
      const attempted = (HR_EDITABLE_FIELDS as readonly string[]).filter(
        (field) => field in (body as Record<string, unknown>),
      );
      if (attempted.length > 0) {
        throw forbidden(
          `You are not allowed to change: ${attempted.join(", ")}.`,
          "Employment details are maintained by HR. Ask them to make the change.",
        );
      }
    }

    // The schema is role-aware, and the service re-checks every key against the
    // actor's permitted field list — validation and authorisation stay separate.
    const schema = isManagement(actor.role) ? hrProfileSchema : selfProfileSchema;
    const patch = schema.parse(body);

    await updateEmployeeProfile(actor, user.fullName, id, patch as Record<string, unknown>);
    const profile = await getEmployeeProfile(actor, id);

    return jsonOk({ profile, message: "Changes saved." });
  },
);
