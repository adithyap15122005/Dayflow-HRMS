import { prisma } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { clientKey, enforceRateLimit, jsonOk, readJson, route } from "@/lib/http";
import { verifyEmailSchema } from "@/lib/validation";

export const POST = route(async (request: Request) => {
  enforceRateLimit(clientKey(request, "verify"), 20, 60_000);

  const { token } = verifyEmailSchema.parse(await readJson(request));

  const user = await prisma.user.findUnique({
    where: { verificationToken: token },
    include: { employee: { select: { firstName: true } } },
  });

  if (!user) {
    throw new AppError("NOT_FOUND", "This verification link is not valid.", {
      hint: "It may already have been used. Try signing in — if that fails, ask HR to resend it.",
    });
  }

  if (user.emailVerified) {
    return jsonOk({ ok: true, alreadyVerified: true, email: user.email });
  }

  // Single use: the token is cleared as part of the same update.
  await prisma.user.update({
    where: { id: user.id },
    data: { emailVerified: true, verifiedAt: new Date(), verificationToken: null },
  });

  return jsonOk({
    ok: true,
    alreadyVerified: false,
    email: user.email,
    firstName: user.employee?.firstName ?? null,
  });
});
