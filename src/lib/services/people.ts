import "server-only";

import { prisma } from "@/lib/db";
import {
  EMPLOYED_STATUSES,
  isManagement,
  type EmployeeStatus,
  type EmploymentType,
  type Role,
} from "@/lib/domain/constants";
import {
  canViewCompensation,
  canViewEmployee,
  editableFieldsFor,
  partitionProfilePatch,
  type Actor,
} from "@/lib/domain/rules";
import { toWorkDate, type WorkDate } from "@/lib/domain/time";
import { conflict, forbidden, notFound, validation } from "@/lib/errors";
import { hashPassword } from "@/lib/auth/password";
import { recordEvent, notify } from "./audit";
import { getOrgDay } from "./attendance";
import { getOrgContext } from "./org";

export async function listDepartments() {
  const rows = await prisma.department.findMany({
    orderBy: { name: "asc" },
    include: { _count: { select: { employees: true } } },
  });
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    code: r.code,
    headcount: r._count.employees,
  }));
}

export type DirectoryRow = {
  id: string;
  employeeCode: string;
  name: string;
  firstName: string;
  jobTitle: string;
  department: string | null;
  departmentId: string | null;
  workEmail: string;
  phone: string | null;
  status: EmployeeStatus;
  employmentType: EmploymentType;
  joinedAt: WorkDate;
  location: string;
  avatarColor: string;
  role: Role;
  managerName: string | null;
  /** Today's attendance state, so the directory doubles as a presence board. */
  todayStatus: string;
  checkInAt: string | null;
};

export type DirectoryPage = {
  rows: DirectoryRow[];
  total: number;
  page: number;
  perPage: number;
  totalPages: number;
};

function orderBy(sort: string, dir: "asc" | "desc") {
  switch (sort) {
    case "joinedAt":
      return { joinedAt: dir };
    case "department":
      return { department: { name: dir } };
    case "jobTitle":
      return { jobTitle: dir };
    case "status":
      return { status: dir };
    default:
      return { firstName: dir };
  }
}

/**
 * Employee directory.
 *
 * Management sees everyone; an employee sees the same directory but *without*
 * contact details for other people, which is the least-privilege behaviour a real
 * HR product needs (you can find a colleague, you cannot scrape the org).
 */
export async function listEmployees(
  actor: Actor,
  query: {
    q?: string;
    departmentId?: string;
    status?: EmployeeStatus;
    employmentType?: EmploymentType;
    sort: string;
    dir: "asc" | "desc";
    page: number;
    perPage: number;
  },
): Promise<DirectoryPage> {
  const term = query.q?.trim();
  const where = {
    ...(query.departmentId ? { departmentId: query.departmentId } : {}),
    ...(query.status ? { status: query.status } : {}),
    ...(query.employmentType ? { employmentType: query.employmentType } : {}),
    ...(term
      ? {
          OR: [
            { firstName: { contains: term } },
            { lastName: { contains: term } },
            { employeeCode: { contains: term } },
            { jobTitle: { contains: term } },
            { workEmail: { contains: term } },
          ],
        }
      : {}),
  };

  const [total, rows, org] = await Promise.all([
    prisma.employee.count({ where }),
    prisma.employee.findMany({
      where,
      orderBy: orderBy(query.sort, query.dir),
      skip: (query.page - 1) * query.perPage,
      take: query.perPage,
      include: {
        department: { select: { id: true, name: true } },
        manager: { select: { firstName: true, lastName: true } },
        user: { select: { role: true } },
      },
    }),
    getOrgContext(),
  ]);

  const today = await getOrgDay(org.today, {}, org);
  const todayByEmployee = new Map(today.map((t) => [t.employeeId, t]));
  const canSeeContact = isManagement(actor.role);

  return {
    rows: rows.map((e): DirectoryRow => {
      const attendance = todayByEmployee.get(e.id);
      const own = actor.employeeId === e.id;
      return {
        id: e.id,
        employeeCode: e.employeeCode,
        name: `${e.firstName} ${e.lastName}`,
        firstName: e.firstName,
        jobTitle: e.jobTitle,
        department: e.department?.name ?? null,
        departmentId: e.department?.id ?? null,
        workEmail: e.workEmail,
        phone: canSeeContact || own ? e.phone : null,
        status: e.status as EmployeeStatus,
        employmentType: e.employmentType as EmploymentType,
        joinedAt: toWorkDate(e.joinedAt, org.timezone),
        location: e.location,
        avatarColor: e.avatarColor,
        role: e.user.role as Role,
        managerName: e.manager ? `${e.manager.firstName} ${e.manager.lastName}` : null,
        todayStatus: attendance?.status ?? "WEEK_OFF",
        checkInAt: attendance?.checkInAt ?? null,
      };
    }),
    total,
    page: query.page,
    perPage: query.perPage,
    totalPages: Math.max(1, Math.ceil(total / query.perPage)),
  };
}

export type EmployeeProfile = Awaited<ReturnType<typeof getEmployeeProfile>>;

/** Full profile, with compensation stripped when the viewer may not see it. */
export async function getEmployeeProfile(actor: Actor, employeeId: string) {
  if (!canViewEmployee(actor, employeeId)) {
    throw forbidden(
      "You can only open your own profile.",
      "Ask HR if you need details about a colleague.",
    );
  }

  const employee = await prisma.employee.findUnique({
    where: { id: employeeId },
    include: {
      department: { select: { id: true, name: true } },
      manager: {
        select: { id: true, firstName: true, lastName: true, jobTitle: true, avatarColor: true },
      },
      reports: {
        select: { id: true, firstName: true, lastName: true, jobTitle: true, avatarColor: true },
        orderBy: { firstName: "asc" },
      },
      user: { select: { role: true, email: true, emailVerified: true, lastLoginAt: true } },
      salaryStructure: true,
      documents: { orderBy: { uploadedAt: "desc" } },
    },
  });
  if (!employee) throw notFound("Employee");

  const org = await getOrgContext();
  const showMoney = canViewCompensation(actor, employeeId);
  const editable = editableFieldsFor(actor, employeeId);

  return {
    id: employee.id,
    employeeCode: employee.employeeCode,
    firstName: employee.firstName,
    lastName: employee.lastName,
    fullName: `${employee.firstName} ${employee.lastName}`,
    workEmail: employee.workEmail,
    personalEmail: employee.personalEmail,
    phone: employee.phone,
    address: employee.address,
    city: employee.city,
    country: employee.country,
    dateOfBirth: employee.dateOfBirth ? toWorkDate(employee.dateOfBirth, org.timezone) : null,
    gender: employee.gender,
    avatarColor: employee.avatarColor,
    jobTitle: employee.jobTitle,
    employmentType: employee.employmentType as EmploymentType,
    status: employee.status as EmployeeStatus,
    department: employee.department,
    manager: employee.manager
      ? {
          ...employee.manager,
          fullName: `${employee.manager.firstName} ${employee.manager.lastName}`,
        }
      : null,
    reports: employee.reports.map((r) => ({
      ...r,
      fullName: `${r.firstName} ${r.lastName}`,
    })),
    joinedAt: toWorkDate(employee.joinedAt, org.timezone),
    tenureMonths: monthsBetween(employee.joinedAt, new Date()),
    location: employee.location,
    shiftStart: employee.shiftStart,
    shiftEnd: employee.shiftEnd,
    weeklyOffCsv: employee.weeklyOffCsv,
    emergencyContactName: employee.emergencyContactName,
    emergencyContactPhone: employee.emergencyContactPhone,
    role: employee.user.role as Role,
    loginEmail: employee.user.email,
    emailVerified: employee.user.emailVerified,
    lastLoginAt: employee.user.lastLoginAt?.toISOString() ?? null,
    documents: employee.documents
      .filter((d) => isManagement(actor.role) || (actor.employeeId === employeeId && !d.confidential))
      .map((d) => ({
        id: d.id,
        name: d.name,
        category: d.category,
        mimeType: d.mimeType,
        sizeBytes: d.sizeBytes,
        confidential: d.confidential,
        downloadable: Boolean(d.storageKey),
        uploadedAt: d.uploadedAt.toISOString(),
        uploadedBy: d.uploadedBy,
      })),
    salary: showMoney && employee.salaryStructure
      ? {
          currency: employee.salaryStructure.currency,
          effectiveFrom: employee.salaryStructure.effectiveFrom,
          revision: employee.salaryStructure.revision,
          updatedByName: employee.salaryStructure.updatedByName,
          basic: employee.salaryStructure.basic,
          hra: employee.salaryStructure.hra,
          specialAllowance: employee.salaryStructure.specialAllowance,
          transportAllow: employee.salaryStructure.transportAllow,
          providentFund: employee.salaryStructure.providentFund,
          professionalTax: employee.salaryStructure.professionalTax,
          healthInsurance: employee.salaryStructure.healthInsurance,
        }
      : null,
    canSeeSalary: showMoney,
    canEditSalary: isManagement(actor.role),
    editableFields: editable,
    isSelf: actor.employeeId === employeeId,
  };
}

function monthsBetween(from: Date, to: Date): number {
  return Math.max(
    0,
    (to.getUTCFullYear() - from.getUTCFullYear()) * 12 +
      (to.getUTCMonth() - from.getUTCMonth()),
  );
}

/* -------------------------------------------------------------- mutations */

export async function updateEmployeeProfile(
  actor: Actor,
  actorName: string,
  employeeId: string,
  patch: Record<string, unknown>,
) {
  const { allowed, rejected } = partitionProfilePatch(actor, employeeId, patch);

  if (rejected.length > 0) {
    throw forbidden(
      `You are not allowed to change: ${rejected.join(", ")}.`,
      "Ask HR to update employment details on your behalf.",
    );
  }
  if (Object.keys(allowed).length === 0) {
    throw validation("There was nothing to update.");
  }

  const before = await prisma.employee.findUnique({
    where: { id: employeeId },
    select: {
      firstName: true,
      lastName: true,
      userId: true,
      workEmail: true,
      status: true,
      departmentId: true,
      jobTitle: true,
    },
  });
  if (!before) throw notFound("Employee");

  if (typeof allowed.workEmail === "string" && allowed.workEmail !== before.workEmail) {
    const clash = await prisma.employee.findUnique({
      where: { workEmail: allowed.workEmail },
      select: { id: true },
    });
    if (clash && clash.id !== employeeId) {
      throw conflict("Another employee already uses that work email.");
    }
  }
  if (allowed.managerId === employeeId) {
    throw validation("An employee cannot report to themselves.", {
      managerId: "Choose a different manager.",
    });
  }

  // Dates arrive as YYYY-MM-DD strings; Prisma needs a Date for DateTime columns.
  const data: Record<string, unknown> = { ...allowed };
  if (typeof data.dateOfBirth === "string") {
    data.dateOfBirth = new Date(`${data.dateOfBirth}T00:00:00.000Z`);
  }

  const updated = await prisma.employee.update({
    where: { id: employeeId },
    data,
    include: { department: { select: { name: true } } },
  });

  const changed = Object.keys(allowed);
  await recordEvent({
    actorUserId: actor.userId,
    actorName,
    employeeId,
    action: actor.employeeId === employeeId ? "PROFILE_UPDATED" : "EMPLOYEE_UPDATED",
    entityType: "Employee",
    entityId: employeeId,
    summary:
      actor.employeeId === employeeId
        ? `Updated own profile (${changed.join(", ")})`
        : `Updated ${before.firstName} ${before.lastName} (${changed.join(", ")})`,
    meta: { fields: changed },
  });

  // Let the employee know when HR changes their record.
  if (actor.employeeId !== employeeId) {
    await notify({
      userId: before.userId,
      type: "PROFILE_UPDATED",
      title: "HR updated your profile",
      body: `${actorName} changed: ${changed.join(", ")}.`,
      href: "/profile",
    });
  }

  return updated;
}

export async function createEmployee(
  actor: Actor,
  actorName: string,
  input: {
    firstName: string;
    lastName: string;
    workEmail: string;
    employeeCode?: string;
    role: Role;
    jobTitle: string;
    departmentId: string;
    managerId?: string | null;
    employmentType: EmploymentType;
    status: EmployeeStatus;
    joinedAt: WorkDate;
    location: string;
    shiftStart: string;
    shiftEnd: string;
    temporaryPassword: string;
  },
) {
  if (!isManagement(actor.role)) {
    throw forbidden("Only HR and administrators can add employees.");
  }
  if (input.role === "ADMIN" && actor.role !== "ADMIN") {
    throw forbidden("Only an administrator can create another administrator.");
  }

  const existingUser = await prisma.user.findUnique({
    where: { email: input.workEmail },
    select: { id: true },
  });
  if (existingUser) {
    throw conflict("An account already exists for that email address.");
  }

  const employeeCode = input.employeeCode ?? (await nextEmployeeCode());
  const codeClash = await prisma.employee.findUnique({
    where: { employeeCode },
    select: { id: true },
  });
  if (codeClash) throw conflict(`Employee ID ${employeeCode} is already taken.`);

  const passwordHash = await hashPassword(input.temporaryPassword);
  const palette = ["indigo", "violet", "teal", "amber", "rose", "sky", "emerald"];

  const employee = await prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        email: input.workEmail,
        passwordHash,
        role: input.role,
        // HR onboards the person directly, so the address is trusted.
        emailVerified: true,
        verifiedAt: new Date(),
      },
    });
    return tx.employee.create({
      data: {
        userId: user.id,
        employeeCode,
        firstName: input.firstName,
        lastName: input.lastName,
        workEmail: input.workEmail,
        jobTitle: input.jobTitle,
        departmentId: input.departmentId,
        managerId: input.managerId ?? null,
        employmentType: input.employmentType,
        status: input.status,
        joinedAt: new Date(`${input.joinedAt}T00:00:00.000Z`),
        location: input.location,
        shiftStart: input.shiftStart,
        shiftEnd: input.shiftEnd,
        avatarColor: palette[Math.floor(Math.random() * palette.length)],
      },
      include: { department: { select: { name: true } } },
    });
  });

  await recordEvent({
    actorUserId: actor.userId,
    actorName,
    employeeId: employee.id,
    action: "EMPLOYEE_CREATED",
    entityType: "Employee",
    entityId: employee.id,
    summary: `Onboarded ${employee.firstName} ${employee.lastName} as ${employee.jobTitle}`,
    meta: { employeeCode, department: employee.department?.name },
  });

  return employee;
}

/** Next sequential code, e.g. DF-0042. */
export async function nextEmployeeCode(): Promise<string> {
  const last = await prisma.employee.findFirst({
    where: { employeeCode: { startsWith: "DF-" } },
    orderBy: { employeeCode: "desc" },
    select: { employeeCode: true },
  });
  const n = last ? Number(last.employeeCode.slice(3)) + 1 : 1;
  return `DF-${String(Number.isFinite(n) ? n : 1).padStart(4, "0")}`;
}

/* ---------------------------------------------------------------- insights */

export async function getHeadcountStats() {
  const [byDepartment, byType, byStatus, total] = await Promise.all([
    prisma.employee.groupBy({
      by: ["departmentId"],
      where: { status: { in: EMPLOYED_STATUSES } },
      _count: { _all: true },
    }),
    prisma.employee.groupBy({
      by: ["employmentType"],
      where: { status: { in: EMPLOYED_STATUSES } },
      _count: { _all: true },
    }),
    prisma.employee.groupBy({ by: ["status"], _count: { _all: true } }),
    prisma.employee.count({ where: { status: { in: EMPLOYED_STATUSES } } }),
  ]);

  const departments = await prisma.department.findMany({
    select: { id: true, name: true },
  });
  const nameById = new Map(departments.map((d) => [d.id, d.name]));

  return {
    total,
    byDepartment: byDepartment
      .map((d) => ({
        department: d.departmentId ? (nameById.get(d.departmentId) ?? "Unassigned") : "Unassigned",
        count: d._count._all,
      }))
      .sort((a, b) => b.count - a.count),
    byEmploymentType: byType.map((t) => ({
      employmentType: t.employmentType,
      count: t._count._all,
    })),
    byStatus: byStatus.map((s) => ({ status: s.status, count: s._count._all })),
  };
}

/** Employees with no salary structure — a real payroll blocker. */
export async function findMissingSalaryStructures() {
  const rows = await prisma.employee.findMany({
    where: { status: { in: EMPLOYED_STATUSES }, salaryStructure: null },
    select: { id: true, firstName: true, lastName: true },
  });
  return rows.map((r) => ({ employeeId: r.id, name: `${r.firstName} ${r.lastName}` }));
}

/** Cross-entity search powering the command bar. */
export async function searchEverything(actor: Actor, term: string) {
  const q = term.trim();
  if (q.length < 1) return { employees: [], leave: [], documents: [] };

  const management = isManagement(actor.role);

  const employees = await prisma.employee.findMany({
    where: {
      OR: [
        { firstName: { contains: q } },
        { lastName: { contains: q } },
        { employeeCode: { contains: q } },
        { jobTitle: { contains: q } },
        { workEmail: { contains: q } },
      ],
    },
    take: 6,
    select: {
      id: true,
      firstName: true,
      lastName: true,
      jobTitle: true,
      employeeCode: true,
      avatarColor: true,
      department: { select: { name: true } },
    },
    orderBy: { firstName: "asc" },
  });

  const leave = await prisma.leaveRequest.findMany({
    where: {
      ...(management ? {} : { employeeId: actor.employeeId ?? "__none__" }),
      OR: [
        { reason: { contains: q } },
        { employee: { firstName: { contains: q } } },
        { employee: { lastName: { contains: q } } },
      ],
    },
    take: 5,
    include: {
      leaveType: { select: { name: true } },
      employee: { select: { firstName: true, lastName: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return {
    employees: employees.map((e) => ({
      id: e.id,
      name: `${e.firstName} ${e.lastName}`,
      jobTitle: e.jobTitle,
      employeeCode: e.employeeCode,
      department: e.department?.name ?? null,
      avatarColor: e.avatarColor,
      href: `/people/${e.id}`,
    })),
    leave: leave.map((l) => ({
      id: l.id,
      label: `${l.employee.firstName} ${l.employee.lastName} — ${l.leaveType.name}`,
      detail: `${l.startDate} → ${l.endDate} • ${l.status.toLowerCase()}`,
      href: `/leave?request=${l.id}`,
    })),
    documents: [],
  };
}

export async function listManagerOptions() {
  const rows = await prisma.employee.findMany({
    where: { status: { in: EMPLOYED_STATUSES } },
    select: { id: true, firstName: true, lastName: true, jobTitle: true },
    orderBy: { firstName: "asc" },
  });
  return rows.map((r) => ({
    id: r.id,
    name: `${r.firstName} ${r.lastName}`,
    jobTitle: r.jobTitle,
  }));
}
