import "server-only";

import { cookies } from "next/headers";

import { prisma } from "@/lib/db";
import { isManagement, type Role } from "@/lib/domain/constants";
import { forbidden, unauthenticated } from "@/lib/errors";
import type { Actor } from "@/lib/domain/rules";

import {
  SESSION_COOKIE,
  sessionCookieOptions,
  signSessionToken,
  verifySessionToken,
  type SessionClaims,
} from "./session";

export type CurrentUser = {
  userId: string;
  email: string;
  role: Role;
  emailVerified: boolean;
  employeeId: string | null;
  employeeCode: string | null;
  firstName: string;
  lastName: string;
  fullName: string;
  jobTitle: string | null;
  departmentName: string | null;
  avatarColor: string;
};

/**
 * Resolve the signed-in user.
 *
 * The JWT is only a *claim*; this always re-reads the user row so that a
 * deactivated account, a changed role, or a bumped `sessionVersion` takes effect
 * on the very next request instead of when the token happens to expire.
 */
export async function getCurrentUser(): Promise<CurrentUser | null> {
  const store = await cookies();
  const claims = await verifySessionToken(store.get(SESSION_COOKIE)?.value);
  if (!claims) return null;

  const user = await prisma.user.findUnique({
    where: { id: claims.sub },
    include: { employee: { include: { department: true } } },
  });
  if (!user) return null;
  if (user.sessionVersion !== claims.ver) return null;
  if (user.lockedUntil && user.lockedUntil > new Date()) return null;
  if (user.employee && user.employee.status === "INACTIVE") return null;

  const employee = user.employee;
  return {
    userId: user.id,
    email: user.email,
    role: user.role as Role,
    emailVerified: user.emailVerified,
    employeeId: employee?.id ?? null,
    employeeCode: employee?.employeeCode ?? null,
    firstName: employee?.firstName ?? user.email.split("@")[0],
    lastName: employee?.lastName ?? "",
    fullName: employee
      ? `${employee.firstName} ${employee.lastName}`.trim()
      : user.email,
    jobTitle: employee?.jobTitle ?? null,
    departmentName: employee?.department?.name ?? null,
    avatarColor: employee?.avatarColor ?? "indigo",
  };
}

export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) throw unauthenticated();
  return user;
}

export async function requireVerifiedUser(): Promise<CurrentUser> {
  const user = await requireUser();
  if (!user.emailVerified) {
    throw forbidden(
      "Verify your email address before using Dayflow.",
      "Open the verification link we generated during sign-up.",
    );
  }
  return user;
}

/** HR/Admin only. */
export async function requireManagement(): Promise<CurrentUser> {
  const user = await requireVerifiedUser();
  if (!isManagement(user.role)) {
    throw forbidden(
      "This area is limited to HR and administrators.",
      "Head back to your overview to see your own records.",
    );
  }
  return user;
}

export async function requireRole(...roles: Role[]): Promise<CurrentUser> {
  const user = await requireVerifiedUser();
  if (!roles.includes(user.role)) {
    throw forbidden("You do not have permission to perform this action.");
  }
  return user;
}

/** The shape the pure rule functions expect. */
export function toActor(user: CurrentUser): Actor {
  return { userId: user.userId, role: user.role, employeeId: user.employeeId };
}

export async function requireActor(): Promise<{ user: CurrentUser; actor: Actor }> {
  const user = await requireVerifiedUser();
  return { user, actor: toActor(user) };
}

/* ------------------------------------------------------------ cookie writes */

export async function establishSession(claims: SessionClaims): Promise<void> {
  const token = await signSessionToken(claims);
  const store = await cookies();
  store.set(SESSION_COOKIE, token, sessionCookieOptions());
}

export async function clearSession(): Promise<void> {
  const store = await cookies();
  store.set(SESSION_COOKIE, "", { ...sessionCookieOptions(), maxAge: 0 });
}

/**
 * Sign out everywhere.
 *
 * Clearing the cookie only stops the *browser* from sending the token; a copy of
 * it would still verify until it expired. Bumping `sessionVersion` makes every
 * token already issued for this user fail the check in `getCurrentUser`, which
 * turns sign-out into real revocation without introducing a session table.
 */
export async function revokeSessions(userId: string): Promise<void> {
  await prisma.user
    .update({ where: { id: userId }, data: { sessionVersion: { increment: 1 } } })
    .catch(() => undefined);
  await clearSession();
}

/** Sign out the caller, if there is one. Safe to call when already signed out. */
export async function signOutCurrent(): Promise<void> {
  const store = await cookies();
  const claims = await verifySessionToken(store.get(SESSION_COOKIE)?.value);
  if (claims) await revokeSessions(claims.sub);
  else await clearSession();
}
