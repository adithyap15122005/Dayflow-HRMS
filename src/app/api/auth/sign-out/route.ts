import { clearSession } from "@/lib/auth/guard";
import { jsonOk, route } from "@/lib/http";

export const POST = route(async () => {
  await clearSession();
  return jsonOk({ ok: true, redirectTo: "/sign-in" });
});
