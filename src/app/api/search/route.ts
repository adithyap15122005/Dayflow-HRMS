import { requireActor } from "@/lib/auth/guard";
import { jsonOk, route } from "@/lib/http";
import { searchEverything } from "@/lib/services/people";
import { searchSchema } from "@/lib/validation";

/** Powers the ⌘K palette. Results are scoped to what the caller may open. */
export const GET = route(async (request: Request) => {
  const { actor } = await requireActor();
  const url = new URL(request.url);
  const { q } = searchSchema.parse({ q: url.searchParams.get("q") ?? "" });
  return jsonOk(await searchEverything(actor, q));
});
