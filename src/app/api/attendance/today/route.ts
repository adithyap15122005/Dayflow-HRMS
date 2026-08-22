import { requireActor } from "@/lib/auth/guard";
import { validation } from "@/lib/errors";
import { jsonOk, readJson, route } from "@/lib/http";
import { checkIn, checkOut, getTodayState } from "@/lib/services/attendance";
import { checkInSchema } from "@/lib/validation";

/** Live state of the caller's own day. */
export const GET = route(async () => {
  const { actor } = await requireActor();
  if (!actor.employeeId) {
    throw validation("This account is not linked to an employee record.");
  }
  return jsonOk(await getTodayState(actor.employeeId));
});

export const POST = route(async (request: Request) => {
  const { actor } = await requireActor();
  if (!actor.employeeId) {
    throw validation("This account is not linked to an employee record.");
  }

  const url = new URL(request.url);
  const action = url.searchParams.get("action");
  const { note } = checkInSchema.parse(await readJson(request).catch(() => ({})));

  if (action === "check-out") {
    const state = await checkOut(actor, actor.employeeId, note ?? null);
    return jsonOk({
      state,
      message: `Checked out. You logged ${Math.floor(state.workedMinutes / 60)}h ${
        state.workedMinutes % 60
      }m today.`,
    });
  }

  const state = await checkIn(actor, actor.employeeId, note ?? null);
  return jsonOk({
    state,
    message:
      state.lateMinutes > 0
        ? `Checked in. Recorded ${state.lateMinutes} minutes after your shift start.`
        : "Checked in. Have a good day.",
  });
});
