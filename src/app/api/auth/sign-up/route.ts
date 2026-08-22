import { randomBytes } from "node:crypto";

import { checkPasswordStrength, hashPassword } from "@/lib/auth/password";
import { prisma } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { clientKey, enforceRateLimit, jsonCreated, readJson, route } from "@/lib/http";
import { managementUserIds, notifyMany, recordEvent } from "@/lib/services/audit";
import { getOrgContext } from "@/lib/services/org";
import { signUpSchema } from "@/lib/validation";

const PALETTE = ["indigo", "violet", "teal", "amber", "rose", "sky", "emerald"];

export const POST = route(async (request: Request) => {
  enforceRateLimit(clientKey(request, "sign-up"), 6, 300_000);

  const input = signUpSchema.parse(await readJson(request));

  const strength = checkPasswordStrength(input.password);
  if (!strength.ok) {
    throw new AppError("VALIDATION", "Choose a stronger password.", {
      fields: { password: strength.problems[0] },
      hint: strength.problems.join(" · "),
    });
  }

  const [emailClash, codeClash, department] = await Promise.all([
    prisma.user.findUnique({ where: { email: input.email }, select: { id: true } }),
    prisma.employee.findUnique({
      where: { employeeCode: input.employeeCode },
      select: { id: true },
    }),
    prisma.department.findUnique({ where: { id: input.departmentId } }),
  ]);

  if (emailClash) {
    throw new AppError("CONFLICT", "An account already exists for that email address.", {
      fields: { email: "This email is already registered." },
      hint: "Sign in instead, or use a different address.",
    });
  }
  if (codeClash) {
    throw new AppError("CONFLICT", `Employee ID ${input.employeeCode} is already in use.`, {
      fields: { employeeCode: "This employee ID is taken." },
    });
  }
  if (!department) {
    throw new AppError("VALIDATION", "Choose a department from the list.", {
      fields: { departmentId: "Unknown department." },
    });
  }

  const org = await getOrgContext();
  const passwordHash = await hashPassword(input.password);
  // 32 random bytes, single-use, stored hashed-by-uniqueness (not a guessable id).
  const verificationToken = randomBytes(32).toString("base64url");

  const employee = await prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        email: input.email,
        passwordHash,
        role: input.role,
        emailVerified: false,
        verificationToken,
      },
    });
    return tx.employee.create({
      data: {
        userId: user.id,
        employeeCode: input.employeeCode,
        firstName: input.firstName,
        lastName: input.lastName,
        workEmail: input.email,
        jobTitle: input.jobTitle,
        departmentId: department.id,
        employmentType: "FULL_TIME",
        status: "PROBATION",
        joinedAt: new Date(`${org.today}T00:00:00.000Z`),
        avatarColor: PALETTE[input.firstName.length % PALETTE.length],
        weeklyOffCsv: "0",
      },
    });
  });

  await recordEvent({
    actorName: `${employee.firstName} ${employee.lastName}`,
    employeeId: employee.id,
    action: "EMPLOYEE_CREATED",
    entityType: "Employee",
    entityId: employee.id,
    summary: `Self-registered as ${employee.jobTitle} in ${department.name}`,
    meta: { employeeCode: employee.employeeCode, selfService: true },
  });

  await notifyMany(await managementUserIds(), {
    type: "ANNOUNCEMENT",
    title: `${employee.firstName} ${employee.lastName} registered`,
    body: `${employee.jobTitle} · ${department.name}. Awaiting email verification, then review their record.`,
    href: `/people/${employee.id}`,
  });

  const verifyUrl = `/verify?token=${verificationToken}`;

  // There is no SMTP dependency in this build: the link is returned to the client
  // and printed to the server console so the flow is fully demonstrable offline.
  if (process.env.DEV_SHOW_VERIFICATION_LINK === "true") {
    console.log(
      `\n[dayflow] Verification link for ${input.email}\n          http://localhost:3000${verifyUrl}\n`,
    );
  }

  return jsonCreated({
    ok: true,
    email: input.email,
    employeeCode: employee.employeeCode,
    verifyUrl,
    message: "Account created. Verify your email address to sign in.",
  });
});
