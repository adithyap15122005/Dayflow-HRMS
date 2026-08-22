import { signOutCurrent } from "@/lib/auth/guard";
import { jsonOk, route } from "@/lib/http";

/**
 * Sign out. A POST so it cannot be triggered by a stray link or a prefetch.
 *
 * This revokes every token issued to the user, not just the cookie in this
 * browser — see `revokeSessions`.
 */
export const POST = route(async () => {
  await signOutCurrent();
  return jsonOk({ ok: true, redirectTo: "/sign-in" });
});
