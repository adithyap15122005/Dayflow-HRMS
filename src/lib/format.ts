/**
 * Presentation helpers shared by server and client components.
 *
 * Kept free of `server-only` so both sides format money, names and statuses the
 * same way — a number rendered on the server must match the same number rendered
 * after a client-side refresh.
 */

import {
  ATTENDANCE_STATUS_LABEL,
  EMPLOYEE_STATUS_LABEL,
  EMPLOYMENT_TYPE_LABEL,
  LEAVE_STATUS_LABEL,
  ROLE_LABEL,
  type AttendanceStatus,
  type EmployeeStatus,
  type EmploymentType,
  type LeaveStatus,
  type Role,
} from "./domain/constants";

const inrCompact = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  notation: "compact",
  maximumFractionDigits: 1,
});
const inrWhole = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});
const inrExact = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** ₹1,23,456 — Indian grouping, no paise. */
export const money = (value: number) => inrWhole.format(Number.isFinite(value) ? value : 0);
/** ₹1,23,456.00 — for payslips, where paise must be visible. */
export const moneyExact = (value: number) =>
  inrExact.format(Number.isFinite(value) ? value : 0);
/** ₹1.2L — for dense stat tiles only. */
export const moneyCompact = (value: number) =>
  inrCompact.format(Number.isFinite(value) ? value : 0);

export const number = (value: number) =>
  new Intl.NumberFormat("en-IN").format(Number.isFinite(value) ? value : 0);

export const percent = (value: number, digits = 0) =>
  `${(Number.isFinite(value) ? value : 0).toFixed(digits)}%`;

export function fileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/** "Aarav Mehta" → "AM" */
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

export function firstNameOf(name: string): string {
  return name.trim().split(/\s+/)[0] ?? name;
}

/** Truncate on a word boundary, adding an ellipsis. */
export function clamp(text: string, max: number): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const space = cut.lastIndexOf(" ");
  return `${(space > max * 0.6 ? cut.slice(0, space) : cut).trimEnd()}…`;
}

/* ---------------------------------------------------------------- statuses */

export type Tone =
  | "brand"
  | "success"
  | "warning"
  | "danger"
  | "info"
  | "neutral";

export const ATTENDANCE_TONE: Record<AttendanceStatus, Tone> = {
  PRESENT: "success",
  HALF_DAY: "warning",
  ABSENT: "danger",
  LEAVE: "info",
  WEEK_OFF: "neutral",
  HOLIDAY: "neutral",
};

export const LEAVE_TONE: Record<LeaveStatus, Tone> = {
  PENDING: "warning",
  APPROVED: "success",
  REJECTED: "danger",
  CANCELLED: "neutral",
};

export const EMPLOYEE_TONE: Record<EmployeeStatus, Tone> = {
  ACTIVE: "success",
  PROBATION: "info",
  NOTICE_PERIOD: "warning",
  INACTIVE: "neutral",
};

export const PAYROLL_TONE: Record<string, Tone> = {
  DRAFT: "neutral",
  PROCESSED: "info",
  PAID: "success",
};

export const attendanceLabel = (status: string) =>
  ATTENDANCE_STATUS_LABEL[status as AttendanceStatus] ?? status;
export const leaveLabel = (status: string) =>
  LEAVE_STATUS_LABEL[status as LeaveStatus] ?? status;
export const employeeStatusLabel = (status: string) =>
  EMPLOYEE_STATUS_LABEL[status as EmployeeStatus] ?? status;
export const employmentTypeLabel = (type: string) =>
  EMPLOYMENT_TYPE_LABEL[type as EmploymentType] ?? type;
export const roleLabel = (role: string) => ROLE_LABEL[role as Role] ?? role;

/** Human-readable audit action, used by every activity feed. */
export const AUDIT_LABEL: Record<string, string> = {
  CHECK_IN: "Checked in",
  CHECK_OUT: "Checked out",
  ATTENDANCE_ADJUSTED: "Attendance adjusted",
  LEAVE_SUBMITTED: "Leave requested",
  LEAVE_APPROVED: "Leave approved",
  LEAVE_REJECTED: "Leave rejected",
  LEAVE_CANCELLED: "Leave withdrawn",
  PROFILE_UPDATED: "Profile updated",
  SALARY_UPDATED: "Salary updated",
  PAYROLL_PROCESSED: "Payroll processed",
  EMPLOYEE_CREATED: "Employee onboarded",
  EMPLOYEE_UPDATED: "Record updated",
  DOCUMENT_UPLOADED: "Document uploaded",
  SIGNED_IN: "Signed in",
};

export const AUDIT_TONE: Record<string, Tone> = {
  CHECK_IN: "success",
  CHECK_OUT: "info",
  ATTENDANCE_ADJUSTED: "warning",
  LEAVE_SUBMITTED: "warning",
  LEAVE_APPROVED: "success",
  LEAVE_REJECTED: "danger",
  LEAVE_CANCELLED: "neutral",
  PROFILE_UPDATED: "info",
  SALARY_UPDATED: "brand",
  PAYROLL_PROCESSED: "brand",
  EMPLOYEE_CREATED: "success",
  EMPLOYEE_UPDATED: "info",
  DOCUMENT_UPLOADED: "info",
  SIGNED_IN: "neutral",
};

/** Days rendered as "1 day" / "2.5 days". */
export function days(value: number): string {
  const rounded = Math.round(value * 2) / 2;
  const label = Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
  return `${label} ${rounded === 1 ? "day" : "days"}`;
}

/** "8h 12m" from raw minutes. */
export function hours(minutes: number): string {
  const safe = Math.max(0, Math.round(minutes));
  const h = Math.floor(safe / 60);
  const m = safe % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

/** Decimal hours, e.g. 8.2 — for report columns and axes. */
export const decimalHours = (minutes: number) =>
  Math.round((Math.max(0, minutes) / 60) * 10) / 10;
