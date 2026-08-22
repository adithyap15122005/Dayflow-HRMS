import { clearSession, getCurrentUser } from "@/lib/auth/guard";
import { jsonOk, route } from "@/lib/http";

/** Who am I? Used by the client shell after sign-in and for session probes. */
export const GET = route(async () => {
  const user = await getCurrentUser();
  return jsonOk({
    authenticated: Boolean(user),
    user: user
      ? {
          userId: user.userId,
          email: user.email,
          role: user.role,
          fullName: user.fullName,
          employeeId: user.employeeId,
          employeeCode: user.employeeCode,
          jobTitle: user.jobTitle,
          department: user.departmentName,
          avatarColor: user.avatarColor,
        }
      : null,
  });
});

export const POST = route(async () => {
  await clearSession();
  return jsonOk({ ok: true });
});
