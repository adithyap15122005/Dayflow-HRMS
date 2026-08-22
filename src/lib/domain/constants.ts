/**
 * Domain vocabulary.
 *
 * SQLite has no enum support, so every status column is a string. These unions +
 * `is*` guards are the single source of truth that keeps the string columns
 * honest, and the `*_LABEL` maps keep UI copy consistent across every screen.
 */

export const ROLES = ["ADMIN", "HR", "EMPLOYEE"] as const;
export type Role = (typeof ROLES)[number];

/** Roles that may read/write other people's records. */
export const MANAGEMENT_ROLES: Role[] = ["ADMIN", "HR"];
export const isManagement = (role: Role) => MANAGEMENT_ROLES.includes(role);

export const ROLE_LABEL: Record<Role, string> = {
  ADMIN: "Administrator",
  HR: "HR Officer",
  EMPLOYEE: "Employee",
};

/* ------------------------------------------------------------------ people */

export const EMPLOYMENT_TYPES = [
  "FULL_TIME",
  "PART_TIME",
  "CONTRACT",
  "INTERN",
] as const;
export type EmploymentType = (typeof EMPLOYMENT_TYPES)[number];

export const EMPLOYMENT_TYPE_LABEL: Record<EmploymentType, string> = {
  FULL_TIME: "Full-time",
  PART_TIME: "Part-time",
  CONTRACT: "Contract",
  INTERN: "Intern",
};

export const EMPLOYEE_STATUSES = [
  "ACTIVE",
  "PROBATION",
  "NOTICE_PERIOD",
  "INACTIVE",
] as const;
export type EmployeeStatus = (typeof EMPLOYEE_STATUSES)[number];

export const EMPLOYEE_STATUS_LABEL: Record<EmployeeStatus, string> = {
  ACTIVE: "Active",
  PROBATION: "Probation",
  NOTICE_PERIOD: "Notice period",
  INACTIVE: "Inactive",
};

/** Statuses that count towards headcount / payroll / attendance expectations. */
export const EMPLOYED_STATUSES: EmployeeStatus[] = [
  "ACTIVE",
  "PROBATION",
  "NOTICE_PERIOD",
];

/* -------------------------------------------------------------- attendance */

export const ATTENDANCE_STATUSES = [
  "PRESENT",
  "ABSENT",
  "HALF_DAY",
  "LEAVE",
  "WEEK_OFF",
  "HOLIDAY",
] as const;
export type AttendanceStatus = (typeof ATTENDANCE_STATUSES)[number];

export const ATTENDANCE_STATUS_LABEL: Record<AttendanceStatus, string> = {
  PRESENT: "Present",
  ABSENT: "Absent",
  HALF_DAY: "Half day",
  LEAVE: "On leave",
  WEEK_OFF: "Week off",
  HOLIDAY: "Holiday",
};

/** Statuses a person is considered "at work" for. */
export const WORKING_ATTENDANCE: AttendanceStatus[] = ["PRESENT", "HALF_DAY"];

export const ATTENDANCE_SOURCES = ["SELF", "HR_ADJUSTMENT", "SYSTEM"] as const;
export type AttendanceSource = (typeof ATTENDANCE_SOURCES)[number];

/* ------------------------------------------------------------------- leave */

export const LEAVE_STATUSES = [
  "PENDING",
  "APPROVED",
  "REJECTED",
  "CANCELLED",
] as const;
export type LeaveStatus = (typeof LEAVE_STATUSES)[number];

export const LEAVE_STATUS_LABEL: Record<LeaveStatus, string> = {
  PENDING: "Pending",
  APPROVED: "Approved",
  REJECTED: "Rejected",
  CANCELLED: "Cancelled",
};

/** Requests that hold (or will hold) balance and block overlapping dates. */
export const BLOCKING_LEAVE_STATUSES: LeaveStatus[] = ["PENDING", "APPROVED"];

/* ----------------------------------------------------------------- payroll */

export const PAYROLL_RUN_STATUSES = ["DRAFT", "PROCESSED", "PAID"] as const;
export type PayrollRunStatus = (typeof PAYROLL_RUN_STATUSES)[number];

export const PAYROLL_RUN_STATUS_LABEL: Record<PayrollRunStatus, string> = {
  DRAFT: "Draft",
  PROCESSED: "Processed",
  PAID: "Paid",
};

export const EARNING_KEYS = [
  "basic",
  "hra",
  "specialAllowance",
  "transportAllow",
] as const;
export const DEDUCTION_KEYS = [
  "providentFund",
  "professionalTax",
  "healthInsurance",
] as const;

export const SALARY_COMPONENT_LABEL: Record<string, string> = {
  basic: "Basic salary",
  hra: "House rent allowance",
  specialAllowance: "Special allowance",
  transportAllow: "Transport allowance",
  providentFund: "Provident fund",
  professionalTax: "Professional tax",
  healthInsurance: "Health insurance",
  lop: "Loss of pay",
};

/* ----------------------------------------------------------- notifications */

export const NOTIFICATION_TYPES = [
  "LEAVE_SUBMITTED",
  "LEAVE_APPROVED",
  "LEAVE_REJECTED",
  "LEAVE_CANCELLED",
  "PAYSLIP_READY",
  "PROFILE_UPDATED",
  "SALARY_UPDATED",
  "ATTENDANCE_MISSING",
  "ANNOUNCEMENT",
] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

/* ------------------------------------------------------------------ audit */

export const AUDIT_ACTIONS = [
  "CHECK_IN",
  "CHECK_OUT",
  "ATTENDANCE_ADJUSTED",
  "LEAVE_SUBMITTED",
  "LEAVE_APPROVED",
  "LEAVE_REJECTED",
  "LEAVE_CANCELLED",
  "PROFILE_UPDATED",
  "SALARY_UPDATED",
  "PAYROLL_PROCESSED",
  "EMPLOYEE_CREATED",
  "EMPLOYEE_UPDATED",
  "DOCUMENT_UPLOADED",
  "SIGNED_IN",
] as const;
export type AuditAction = (typeof AUDIT_ACTIONS)[number];

export const DOCUMENT_CATEGORIES = [
  "CONTRACT",
  "ID_PROOF",
  "CERTIFICATE",
  "POLICY",
  "OTHER",
] as const;
export type DocumentCategory = (typeof DOCUMENT_CATEGORIES)[number];

export const DOCUMENT_CATEGORY_LABEL: Record<DocumentCategory, string> = {
  CONTRACT: "Contract",
  ID_PROOF: "ID proof",
  CERTIFICATE: "Certificate",
  POLICY: "Policy",
  OTHER: "Other",
};

/** Profile fields an employee is allowed to change about themselves. */
export const EMPLOYEE_EDITABLE_FIELDS = [
  "phone",
  "address",
  "city",
  "personalEmail",
  "emergencyContactName",
  "emergencyContactPhone",
  "avatarColor",
] as const;
export type EmployeeEditableField = (typeof EMPLOYEE_EDITABLE_FIELDS)[number];

/** Additional fields HR/Admin may change about anyone. */
export const HR_EDITABLE_FIELDS = [
  "firstName",
  "lastName",
  "workEmail",
  "jobTitle",
  "employmentType",
  "status",
  "departmentId",
  "managerId",
  "location",
  "shiftStart",
  "shiftEnd",
  "dateOfBirth",
  "gender",
  "country",
] as const;
