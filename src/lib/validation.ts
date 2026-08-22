import { z } from "zod";

import {
  ATTENDANCE_STATUSES,
  DOCUMENT_CATEGORIES,
  EMPLOYEE_STATUSES,
  EMPLOYMENT_TYPES,
  LEAVE_STATUSES,
  ROLES,
} from "./domain/constants";
import { isClockTime, isWorkDate } from "./domain/time";

export const workDateSchema = z
  .string()
  .refine(isWorkDate, "Use a real calendar date (YYYY-MM-DD).");

export const clockTimeSchema = z
  .string()
  .refine(isClockTime, "Use 24-hour HH:mm, e.g. 09:30.");

export const periodSchema = z
  .string()
  .regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Use a YYYY-MM payroll period.");

export const emailSchema = z
  .string()
  .trim()
  .min(1, "Email is required.")
  .max(160, "That email is too long.")
  .email("Enter a valid email address.")
  .transform((v) => v.toLowerCase());

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Keep this under ${max} characters.`)
    .optional()
    .transform((v) => (v === "" ? null : v));

/* ================================================================== auth */

export const signInSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "Enter your password."),
});

export const signUpSchema = z.object({
  employeeCode: z
    .string()
    .trim()
    .min(3, "Employee ID must be at least 3 characters.")
    .max(20, "Employee ID is too long.")
    .regex(/^[A-Za-z0-9-]+$/, "Use letters, numbers and hyphens only.")
    .transform((v) => v.toUpperCase()),
  firstName: z.string().trim().min(1, "First name is required.").max(60),
  lastName: z.string().trim().min(1, "Last name is required.").max(60),
  email: emailSchema,
  password: z.string().min(1, "Choose a password."),
  role: z.enum(["EMPLOYEE", "HR"], {
    errorMap: () => ({ message: "Choose Employee or HR." }),
  }),
  jobTitle: z.string().trim().min(2, "Job title is required.").max(80),
  departmentId: z.string().trim().min(1, "Pick a department."),
});

export const verifyEmailSchema = z.object({
  token: z.string().trim().min(10, "That verification link is not valid."),
});

/* ============================================================ attendance */

export const checkInSchema = z.object({
  note: optionalText(200),
});

export const checkOutSchema = z.object({
  note: optionalText(200),
});

export const attendanceQuerySchema = z.object({
  from: workDateSchema.optional(),
  to: workDateSchema.optional(),
  employeeId: z.string().trim().min(1).optional(),
  departmentId: z.string().trim().min(1).optional(),
  status: z.enum(ATTENDANCE_STATUSES).optional(),
  scope: z.enum(["me", "org"]).default("me"),
  filter: z.enum(["unclosed", "late"]).optional(),
  take: z.coerce.number().int().min(1).max(500).default(200),
});

export const attendanceAdjustSchema = z
  .object({
    employeeId: z.string().trim().min(1),
    workDate: workDateSchema,
    status: z.enum(ATTENDANCE_STATUSES),
    checkIn: clockTimeSchema.nullish(),
    checkOut: clockTimeSchema.nullish(),
    note: optionalText(240),
  })
  .refine(
    (v) => !(v.checkIn && v.checkOut) || v.checkOut > v.checkIn,
    { message: "Check-out must be later than check-in.", path: ["checkOut"] },
  )
  .refine((v) => !(v.checkOut && !v.checkIn), {
    message: "Add a check-in time before a check-out time.",
    path: ["checkIn"],
  });

/* ================================================================= leave */

export const leaveRequestSchema = z.object({
  leaveTypeId: z.string().trim().min(1, "Choose a leave type."),
  startDate: workDateSchema,
  endDate: workDateSchema,
  halfDay: z.boolean().default(false),
  reason: z
    .string()
    .trim()
    .max(500, "Keep the reason under 500 characters.")
    .default(""),
});

export const leaveDecisionSchema = z.object({
  decision: z.enum(["APPROVED", "REJECTED"]),
  comment: z
    .string()
    .trim()
    .max(400, "Keep the comment under 400 characters.")
    .default(""),
});

export const leaveQuerySchema = z.object({
  status: z.enum(LEAVE_STATUSES).optional(),
  employeeId: z.string().trim().min(1).optional(),
  departmentId: z.string().trim().min(1).optional(),
  leaveTypeId: z.string().trim().min(1).optional(),
  from: workDateSchema.optional(),
  to: workDateSchema.optional(),
  scope: z.enum(["me", "org"]).default("me"),
  take: z.coerce.number().int().min(1).max(300).default(100),
});

/* ================================================================ people */

export const peopleQuerySchema = z.object({
  q: z.string().trim().max(80).optional(),
  departmentId: z.string().trim().min(1).optional(),
  status: z.enum(EMPLOYEE_STATUSES).optional(),
  employmentType: z.enum(EMPLOYMENT_TYPES).optional(),
  sort: z
    .enum(["name", "joinedAt", "department", "jobTitle", "status"])
    .default("name"),
  dir: z.enum(["asc", "desc"]).default("asc"),
  page: z.coerce.number().int().min(1).max(999).default(1),
  perPage: z.coerce.number().int().min(5).max(100).default(12),
});

/** Fields any employee may change about themselves. */
export const selfProfileSchema = z.object({
  phone: z
    .string()
    .trim()
    .regex(/^[+]?[\d\s()-]{7,20}$/, "Enter a valid phone number.")
    .optional()
    .or(z.literal("").transform(() => undefined)),
  personalEmail: z
    .string()
    .trim()
    .email("Enter a valid personal email.")
    .optional()
    .or(z.literal("").transform(() => undefined)),
  address: optionalText(220),
  city: optionalText(80),
  emergencyContactName: optionalText(80),
  emergencyContactPhone: z
    .string()
    .trim()
    .regex(/^[+]?[\d\s()-]{7,20}$/, "Enter a valid phone number.")
    .optional()
    .or(z.literal("").transform(() => undefined)),
  avatarColor: z
    .enum(["indigo", "violet", "teal", "amber", "rose", "sky", "emerald", "slate"])
    .optional(),
});

/** Everything HR may additionally change. */
export const hrProfileSchema = selfProfileSchema.extend({
  firstName: z.string().trim().min(1, "First name is required.").max(60).optional(),
  lastName: z.string().trim().min(1, "Last name is required.").max(60).optional(),
  workEmail: emailSchema.optional(),
  jobTitle: z.string().trim().min(2).max(80).optional(),
  employmentType: z.enum(EMPLOYMENT_TYPES).optional(),
  status: z.enum(EMPLOYEE_STATUSES).optional(),
  departmentId: z.string().trim().min(1).nullish(),
  managerId: z.string().trim().min(1).nullish(),
  location: z.string().trim().min(2).max(80).optional(),
  shiftStart: clockTimeSchema.optional(),
  shiftEnd: clockTimeSchema.optional(),
  dateOfBirth: workDateSchema.nullish(),
  gender: z.enum(["Female", "Male", "Non-binary", "Prefer not to say"]).nullish(),
  country: optionalText(60),
});

export const createEmployeeSchema = z.object({
  firstName: z.string().trim().min(1, "First name is required.").max(60),
  lastName: z.string().trim().min(1, "Last name is required.").max(60),
  workEmail: emailSchema,
  employeeCode: z
    .string()
    .trim()
    .min(3)
    .max(20)
    .regex(/^[A-Za-z0-9-]+$/, "Use letters, numbers and hyphens only.")
    .transform((v) => v.toUpperCase())
    .optional(),
  role: z.enum(ROLES).default("EMPLOYEE"),
  jobTitle: z.string().trim().min(2, "Job title is required.").max(80),
  departmentId: z.string().trim().min(1, "Pick a department."),
  managerId: z.string().trim().min(1).nullish(),
  employmentType: z.enum(EMPLOYMENT_TYPES).default("FULL_TIME"),
  status: z.enum(EMPLOYEE_STATUSES).default("PROBATION"),
  joinedAt: workDateSchema,
  location: z.string().trim().min(2).max(80).default("Bengaluru, IN"),
  shiftStart: clockTimeSchema.default("09:30"),
  shiftEnd: clockTimeSchema.default("18:30"),
  temporaryPassword: z.string().min(1, "Set a temporary password."),
});

/* =============================================================== payroll */

export const salaryStructureSchema = z.object({
  basic: z.coerce.number().min(0, "Cannot be negative."),
  hra: z.coerce.number().min(0, "Cannot be negative."),
  specialAllowance: z.coerce.number().min(0, "Cannot be negative."),
  transportAllow: z.coerce.number().min(0, "Cannot be negative."),
  providentFund: z.coerce.number().min(0, "Cannot be negative."),
  professionalTax: z.coerce.number().min(0, "Cannot be negative."),
  healthInsurance: z.coerce.number().min(0, "Cannot be negative."),
  effectiveFrom: workDateSchema.optional(),
});

export const payrollRunSchema = z.object({
  period: periodSchema,
  action: z.enum(["PROCESS", "MARK_PAID"]),
});

/* ========================================================= notifications */

export const notificationReadSchema = z.object({
  ids: z.array(z.string().trim().min(1)).max(200).optional(),
  all: z.boolean().default(false),
});

export const announcementSchema = z.object({
  title: z.string().trim().min(4, "Give the announcement a title.").max(120),
  body: z.string().trim().min(10, "Add some detail.").max(600),
  audience: z.enum(["ALL", "DEPARTMENT"]).default("ALL"),
  departmentId: z.string().trim().min(1).optional(),
});

/* =============================================================== reports */

export const reportQuerySchema = z.object({
  report: z.enum(["attendance", "leave", "payroll", "headcount"]).default("attendance"),
  from: workDateSchema.optional(),
  to: workDateSchema.optional(),
  departmentId: z.string().trim().min(1).optional(),
  employeeId: z.string().trim().min(1).optional(),
  status: z.string().trim().min(1).optional(),
  format: z.enum(["json", "csv"]).default("json"),
});

export const documentUploadMetaSchema = z.object({
  employeeId: z.string().trim().min(1),
  category: z.enum(DOCUMENT_CATEGORIES),
  confidential: z.boolean().default(false),
});

export const assistantSchema = z.object({
  question: z
    .string()
    .trim()
    .min(3, "Ask a question about your workforce.")
    .max(240, "Keep the question under 240 characters."),
});

export const searchSchema = z.object({
  q: z.string().trim().min(1).max(80),
});
