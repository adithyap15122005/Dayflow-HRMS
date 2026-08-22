import { NextResponse } from "next/server";

import { establishSession, signOutCurrent } from "@/lib/auth/guard";
import { verifyPassword } from "@/lib/auth/password";
import { prisma } from "@/lib/db";
import type { Role } from "@/lib/domain/constants";
import { AppError } from "@/lib/errors";
import { clientKey, enforceRateLimit, jsonOk, readJson, route } from "@/lib/http";
import { recordEvent } from "@/lib/services/audit";
import { signInSchema } from "@/lib/validation";

const MAX_ATTEMPTS = 6;
const LOCK_MINUTES = 10;

export const POST = route(async (request: Request) => {
  // Two limits: a burst limit per IP, and a per-account lockout below.
  enforceRateLimit(clientKey(request, "sign-in"), 12, 60_000);

  const { email, password } = signInSchema.parse(await readJson(request));

  const user = await prisma.user.findUnique({
    where: { email },
    include: { employee: { select: { id: true, firstName: true, lastName: true, status: true } } },
  });

  // Uniform failure message: never reveal whether the address exists.
  const invalid = new AppError("UNAUTHENTICATED", "That email and password do not match.", {
    hint: "Passwords are case-sensitive. Use a demo account from the sign-in page if you are exploring.",
  });

  if (!user) {
    // Spend comparable time so timing does not leak account existence.
    await verifyPassword(password, "$2a$10$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalid");
    throw invalid;
  }

  if (user.lockedUntil && user.lockedUntil > new Date()) {
    const minutes = Math.max(
      1,
      Math.ceil((user.lockedUntil.getTime() - Date.now()) / 60_000),
    );
    throw new AppError("RATE_LIMITED", "This account is temporarily locked.", {
      hint: `Too many failed attempts. Try again in ${minutes} minute${minutes > 1 ? "s" : ""}.`,
    });
  }

  const ok = await verifyPassword(password, user.passwordHash);
  if (!ok) {
    const attempts = user.failedAttempts + 1;
    await prisma.user.update({
      where: { id: user.id },
      data: {
        failedAttempts: attempts,
        lockedUntil:
          attempts >= MAX_ATTEMPTS
            ? new Date(Date.now() + LOCK_MINUTES * 60_000)
            : null,
      },
    });
    if (attempts >= MAX_ATTEMPTS) {
      throw new AppError("RATE_LIMITED", "This account is now locked.", {
        hint: `${MAX_ATTEMPTS} failed attempts. Try again in ${LOCK_MINUTES} minutes.`,
      });
    }
    throw invalid;
  }

  if (user.employee?.status === "INACTIVE") {
    throw new AppError("FORBIDDEN", "This account has been deactivated.", {
      hint: "Contact your HR team to restore access.",
    });
  }

  if (!user.emailVerified) {
    // Signal the exact next step rather than a generic denial.
    return NextResponse.json(
      {
        error: {
          code: "FORBIDDEN",
          message: "Verify your email address before signing in.",
          hint: "Open the verification link shown after sign-up, or ask HR to resend it.",
        },
        needsVerification: true,
        email: user.email,
      },
      { status: 403 },
    );
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { failedAttempts: 0, lockedUntil: null, lastLoginAt: new Date() },
  });

  const name = user.employee
    ? `${user.employee.firstName} ${user.employee.lastName}`
    : user.email;

  await establishSession({
    sub: user.id,
    role: user.role as Role,
    eid: user.employee?.id ?? null,
    name,
    ver: user.sessionVersion,
  });

  await recordEvent({
    actorUserId: user.id,
    actorName: name,
    employeeId: user.employee?.id ?? null,
    action: "SIGNED_IN",
    entityType: "User",
    entityId: user.id,
    summary: "Signed in to Dayflow",
  });

  return jsonOk({
    ok: true,
    role: user.role,
    redirectTo: "/overview",
    name,
  });
});

/** Convenience alias for sign-out on the same resource. */
export const DELETE = route(async () => {
  await signOutCurrent();
  return jsonOk({ ok: true });
});
