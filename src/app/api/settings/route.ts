import { z } from "zod";

import { requireManagement, requireRole } from "@/lib/auth/guard";
import { prisma } from "@/lib/db";
import { validation } from "@/lib/errors";
import { jsonOk, readJson, route } from "@/lib/http";
import { notifyMany, recordEvent } from "@/lib/services/audit";
import { announcementSchema } from "@/lib/validation";

const policySchema = z
  .object({
    standardWorkMinutes: z.coerce.number().int().min(120).max(720),
    halfDayMinutes: z.coerce.number().int().min(30).max(600),
    lateGraceMinutes: z.coerce.number().int().min(0).max(120),
    payrollDayOfMonth: z.coerce.number().int().min(1).max(28),
    timezone: z.string().trim().min(3).max(64),
  })
  .refine((v) => v.halfDayMinutes < v.standardWorkMinutes, {
    message: "The half-day threshold must be below a full day.",
    path: ["halfDayMinutes"],
  });

/** Work policy is org-wide and feeds payroll, so only an admin may change it. */
export const PATCH = route(async (request: Request) => {
  const user = await requireRole("ADMIN");
  const input = policySchema.parse(await readJson(request));

  // Validate the timezone against the runtime rather than a hard-coded list.
  try {
    new Intl.DateTimeFormat("en", { timeZone: input.timezone });
  } catch {
    throw validation("That is not a recognised IANA timezone.", {
      timezone: "Try something like Asia/Kolkata or Europe/London.",
    });
  }

  const saved = await prisma.orgSetting.upsert({
    where: { id: "org" },
    create: { id: "org", ...input },
    update: input,
  });

  await recordEvent({
    actorUserId: user.userId,
    actorName: user.fullName,
    action: "EMPLOYEE_UPDATED",
    entityType: "OrgSetting",
    entityId: "org",
    summary: `Updated the work policy (full day ${saved.standardWorkMinutes}m, grace ${saved.lateGraceMinutes}m, timezone ${saved.timezone})`,
    meta: { ...input },
  });

  return jsonOk({
    message: "Work policy saved. Attendance and payroll use it from the next request.",
  });
});

/** Broadcast an announcement — a real notification for every recipient. */
export const POST = route(async (request: Request) => {
  const user = await requireManagement();
  const input = announcementSchema.parse(await readJson(request));

  const recipients = await prisma.user.findMany({
    where:
      input.audience === "DEPARTMENT" && input.departmentId
        ? { employee: { departmentId: input.departmentId } }
        : {},
    select: { id: true },
  });

  const count = await notifyMany(
    recipients.map((r) => r.id),
    {
      type: "ANNOUNCEMENT",
      title: input.title,
      body: input.body,
      href: "/notifications",
    },
  );

  await recordEvent({
    actorUserId: user.userId,
    actorName: user.fullName,
    employeeId: user.employeeId,
    action: "EMPLOYEE_UPDATED",
    entityType: "Announcement",
    summary: `Sent the announcement “${input.title}” to ${count} people`,
    meta: { audience: input.audience, recipients: count },
  });

  return jsonOk({ recipients: count, message: `Announcement sent to ${count} people.` });
});
