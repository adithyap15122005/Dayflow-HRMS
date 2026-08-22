import { requireActor } from "@/lib/auth/guard";
import { jsonOk, readJson, route, clientKey, enforceRateLimit } from "@/lib/http";
import { askDayflow } from "@/lib/services/assistant";
import { assistantSchema } from "@/lib/validation";

export const POST = route(async (request: Request) => {
  const { actor } = await requireActor();
  // Cheap to run, but still bounded so the panel cannot be hammered.
  enforceRateLimit(clientKey(request, "assistant"), 40, 60_000);

  const { question } = assistantSchema.parse(await readJson(request));
  return jsonOk(await askDayflow(actor, question));
});
