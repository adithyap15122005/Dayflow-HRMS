import { requireActor } from "@/lib/auth/guard";
import { isManagement } from "@/lib/domain/constants";
import { forbidden, validation } from "@/lib/errors";
import { jsonOk, route } from "@/lib/http";
import { previewLeaveDays } from "@/lib/services/leave";
import { isWorkDate } from "@/lib/domain/time";

/**
 * Working-day preview for the leave form.
 *
 * The form never counts days itself — it asks the server, so the number on screen
 * is produced by the same rule that will validate the submission (weekly offs and
 * public holidays excluded).
 */
export const GET = route(async (request: Request) => {
  const { actor } = await requireActor();
  const url = new URL(request.url);
  const startDate = url.searchParams.get("startDate");
  const endDate = url.searchParams.get("endDate");
  const halfDay = url.searchParams.get("halfDay") === "true";
  const requested = url.searchParams.get("employeeId");

  if (!isWorkDate(startDate) || !isWorkDate(endDate)) {
    throw validation("Provide a valid start and end date.");
  }

  let employeeId = actor.employeeId;
  if (requested && requested !== actor.employeeId) {
    if (!isManagement(actor.role)) {
      throw forbidden("You can only preview your own leave.");
    }
    employeeId = requested;
  }
  if (!employeeId) throw validation("This account has no employee record.");

  const result = await previewLeaveDays(employeeId, startDate, endDate, halfDay);
  return jsonOk({ workingDays: result.workingDays, dates: result.dates });
});
