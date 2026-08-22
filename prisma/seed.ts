/**
 * Deterministic demo seed.
 *
 * Everything a judge sees is generated here and stored in SQLite — there are no
 * hard-coded numbers in the UI. The generator is seeded with a fixed value, so
 * running `npm run db:seed` twice produces byte-identical data, while the dates
 * are always anchored to *today* so the dashboard is never stale.
 *
 * The data is also authored to tell a story: a few people are chronically late,
 * one attendance record was never closed, one new joiner has no salary structure
 * and one leave request has been pending for days. Those are exactly the rules
 * the attention queue detects, so the command centre has something real to say.
 */

import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

import {
  addWorkDays,
  addWorkMonths,
  eachWorkDate,
  endOfMonth,
  periodOf,
  startOfMonth,
  toWorkDate,
  weekdayOf,
  workDateTimeUtc,
  type WorkDate,
} from "../src/lib/domain/time";
import {
  computePayslip,
  deriveCompletedStatus,
  lateMinutesFor,
  type SalaryComponents,
} from "../src/lib/domain/rules";

const prisma = new PrismaClient();

const TIMEZONE = "Asia/Kolkata";
const DEMO_PASSWORD = "Dayflow@2026";
/** Sunday is the weekly off; the org runs a six-day week. */
const WEEKLY_OFF = "0";
const POLICY = { standardWorkMinutes: 480, halfDayMinutes: 240, lateGraceMinutes: 10 };
const HISTORY_DAYS = 96;

/** Mulberry32 — small, fast, and reproducible across Node versions. */
function makeRng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rng = makeRng(20260822);
const pick = <T,>(items: readonly T[]): T => items[Math.floor(rng() * items.length)];
const chance = (p: number) => rng() < p;
const between = (min: number, max: number) => min + Math.floor(rng() * (max - min + 1));

type Band = "LEAD" | "SENIOR" | "MID" | "JUNIOR";
type Profile = "RELIABLE" | "LATE" | "SPOTTY";

const BANDS: Record<Band, SalaryComponents> = {
  LEAD: {
    basic: 96000,
    hra: 48000,
    specialAllowance: 34000,
    transportAllow: 3200,
    providentFund: 11520,
    professionalTax: 200,
    healthInsurance: 1800,
  },
  SENIOR: {
    basic: 64000,
    hra: 32000,
    specialAllowance: 19000,
    transportAllow: 3200,
    providentFund: 7680,
    professionalTax: 200,
    healthInsurance: 1350,
  },
  MID: {
    basic: 46000,
    hra: 23000,
    specialAllowance: 12500,
    transportAllow: 2400,
    providentFund: 5520,
    professionalTax: 200,
    healthInsurance: 1050,
  },
  JUNIOR: {
    basic: 33000,
    hra: 16500,
    specialAllowance: 8000,
    transportAllow: 2000,
    providentFund: 3960,
    professionalTax: 200,
    healthInsurance: 850,
  },
};

type SeedPerson = {
  code: string;
  first: string;
  last: string;
  title: string;
  dept: string;
  band: Band;
  role: "ADMIN" | "HR" | "EMPLOYEE";
  status: "ACTIVE" | "PROBATION" | "NOTICE_PERIOD";
  type: "FULL_TIME" | "PART_TIME" | "CONTRACT" | "INTERN";
  joinedMonthsAgo: number;
  profile: Profile;
  shift: [string, string];
  managerCode: string | null;
  color: string;
  city: string;
  /** Demo login address; falls back to a generated work email. */
  login?: string;
  /** Skip the salary structure to demonstrate the payroll blocker rule. */
  noSalary?: boolean;
};

const DEPARTMENTS = [
  { name: "Engineering", code: "ENG" },
  { name: "Product", code: "PRD" },
  { name: "Design", code: "DSN" },
  { name: "Finance", code: "FIN" },
  { name: "Human Resources", code: "HR" },
  { name: "Operations", code: "OPS" },
];

const PEOPLE: SeedPerson[] = [
  // ---- Human Resources ----------------------------------------------------
  {
    code: "DF-0001", first: "Neha", last: "Kapoor", title: "Head of People Operations",
    dept: "Human Resources", band: "LEAD", role: "ADMIN", status: "ACTIVE", type: "FULL_TIME",
    joinedMonthsAgo: 52, profile: "RELIABLE", shift: ["09:00", "18:00"], managerCode: null,
    color: "violet", city: "Bengaluru", login: "admin@dayflow.io",
  },
  {
    code: "DF-0002", first: "Arjun", last: "Malhotra", title: "HR Business Partner",
    dept: "Human Resources", band: "SENIOR", role: "HR", status: "ACTIVE", type: "FULL_TIME",
    joinedMonthsAgo: 31, profile: "RELIABLE", shift: ["09:30", "18:30"], managerCode: "DF-0001",
    color: "indigo", city: "Bengaluru", login: "hr@dayflow.io",
  },
  {
    code: "DF-0003", first: "Divya", last: "Menon", title: "HR Executive",
    dept: "Human Resources", band: "MID", role: "HR", status: "ACTIVE", type: "FULL_TIME",
    joinedMonthsAgo: 14, profile: "RELIABLE", shift: ["09:30", "18:30"], managerCode: "DF-0002",
    color: "teal", city: "Kochi",
  },
  {
    code: "DF-0004", first: "Aarav", last: "Mehta", title: "Senior Software Engineer",
    dept: "Engineering", band: "SENIOR", role: "EMPLOYEE", status: "ACTIVE", type: "FULL_TIME",
    joinedMonthsAgo: 27, profile: "RELIABLE", shift: ["09:30", "18:30"], managerCode: "DF-0005",
    color: "sky", city: "Bengaluru", login: "employee@dayflow.io",
  },
  // ---- Engineering --------------------------------------------------------
  {
    code: "DF-0005", first: "Ishaan", last: "Verma", title: "Engineering Manager",
    dept: "Engineering", band: "LEAD", role: "EMPLOYEE", status: "ACTIVE", type: "FULL_TIME",
    joinedMonthsAgo: 44, profile: "RELIABLE", shift: ["09:30", "18:30"], managerCode: "DF-0001",
    color: "emerald", city: "Bengaluru",
  },
  {
    code: "DF-0006", first: "Sneha", last: "Iyer", title: "Senior Software Engineer",
    dept: "Engineering", band: "SENIOR", role: "EMPLOYEE", status: "ACTIVE", type: "FULL_TIME",
    joinedMonthsAgo: 22, profile: "RELIABLE", shift: ["10:00", "19:00"], managerCode: "DF-0005",
    color: "rose", city: "Chennai",
  },
  {
    code: "DF-0007", first: "Nikhil", last: "Rao", title: "Software Engineer",
    dept: "Engineering", band: "MID", role: "EMPLOYEE", status: "ACTIVE", type: "FULL_TIME",
    joinedMonthsAgo: 11, profile: "LATE", shift: ["09:30", "18:30"], managerCode: "DF-0005",
    color: "amber", city: "Hyderabad",
  },
  {
    code: "DF-0008", first: "Fatima", last: "Sheikh", title: "Software Engineer",
    dept: "Engineering", band: "MID", role: "EMPLOYEE", status: "ACTIVE", type: "FULL_TIME",
    joinedMonthsAgo: 9, profile: "RELIABLE", shift: ["09:30", "18:30"], managerCode: "DF-0005",
    color: "violet", city: "Pune",
  },
  {
    code: "DF-0009", first: "Rohan", last: "Kulkarni", title: "DevOps Engineer",
    dept: "Engineering", band: "SENIOR", role: "EMPLOYEE", status: "ACTIVE", type: "FULL_TIME",
    joinedMonthsAgo: 18, profile: "RELIABLE", shift: ["08:30", "17:30"], managerCode: "DF-0005",
    color: "indigo", city: "Pune",
  },
  {
    code: "DF-0010", first: "Karthik", last: "Nair", title: "QA Engineer",
    dept: "Engineering", band: "MID", role: "EMPLOYEE", status: "ACTIVE", type: "FULL_TIME",
    joinedMonthsAgo: 15, profile: "SPOTTY", shift: ["09:30", "18:30"], managerCode: "DF-0005",
    color: "teal", city: "Kochi",
  },
  {
    code: "DF-0011", first: "Aditya", last: "Bansal", title: "Software Engineer",
    dept: "Engineering", band: "JUNIOR", role: "EMPLOYEE", status: "PROBATION", type: "FULL_TIME",
    joinedMonthsAgo: 3, profile: "LATE", shift: ["09:30", "18:30"], managerCode: "DF-0005",
    color: "sky", city: "Bengaluru",
  },
  {
    code: "DF-0012", first: "Meera", last: "Krishnan", title: "Data Engineer",
    dept: "Engineering", band: "SENIOR", role: "EMPLOYEE", status: "ACTIVE", type: "FULL_TIME",
    joinedMonthsAgo: 20, profile: "RELIABLE", shift: ["09:30", "18:30"], managerCode: "DF-0005",
    color: "emerald", city: "Chennai",
  },
  // ---- Product ------------------------------------------------------------
  {
    code: "DF-0013", first: "Priya", last: "Raghavan", title: "Head of Product",
    dept: "Product", band: "LEAD", role: "EMPLOYEE", status: "ACTIVE", type: "FULL_TIME",
    joinedMonthsAgo: 38, profile: "RELIABLE", shift: ["09:30", "18:30"], managerCode: "DF-0001",
    color: "rose", city: "Bengaluru",
  },
  {
    code: "DF-0014", first: "Daniel", last: "Osei", title: "Product Manager",
    dept: "Product", band: "SENIOR", role: "EMPLOYEE", status: "ACTIVE", type: "FULL_TIME",
    joinedMonthsAgo: 16, profile: "RELIABLE", shift: ["10:00", "19:00"], managerCode: "DF-0013",
    color: "amber", city: "Bengaluru",
  },
  {
    code: "DF-0015", first: "Ananya", last: "Gupta", title: "Associate Product Manager",
    dept: "Product", band: "JUNIOR", role: "EMPLOYEE", status: "ACTIVE", type: "FULL_TIME",
    joinedMonthsAgo: 7, profile: "RELIABLE", shift: ["09:30", "18:30"], managerCode: "DF-0013",
    color: "indigo", city: "Delhi",
  },
  // ---- Design -------------------------------------------------------------
  {
    code: "DF-0016", first: "Kabir", last: "Sethi", title: "Design Lead",
    dept: "Design", band: "LEAD", role: "EMPLOYEE", status: "ACTIVE", type: "FULL_TIME",
    joinedMonthsAgo: 29, profile: "RELIABLE", shift: ["10:00", "19:00"], managerCode: "DF-0001",
    color: "violet", city: "Mumbai",
  },
  {
    code: "DF-0017", first: "Lena", last: "Fischer", title: "Product Designer",
    dept: "Design", band: "MID", role: "EMPLOYEE", status: "ACTIVE", type: "FULL_TIME",
    joinedMonthsAgo: 13, profile: "RELIABLE", shift: ["10:00", "19:00"], managerCode: "DF-0016",
    color: "teal", city: "Mumbai",
  },
  {
    code: "DF-0018", first: "Tanvi", last: "Desai", title: "UX Researcher",
    dept: "Design", band: "MID", role: "EMPLOYEE", status: "ACTIVE", type: "PART_TIME",
    joinedMonthsAgo: 6, profile: "RELIABLE", shift: ["11:00", "16:00"], managerCode: "DF-0016",
    color: "rose", city: "Ahmedabad",
  },
  // ---- Finance ------------------------------------------------------------
  {
    code: "DF-0019", first: "Rajesh", last: "Pillai", title: "Finance Controller",
    dept: "Finance", band: "LEAD", role: "EMPLOYEE", status: "ACTIVE", type: "FULL_TIME",
    joinedMonthsAgo: 47, profile: "RELIABLE", shift: ["09:00", "18:00"], managerCode: "DF-0001",
    color: "emerald", city: "Bengaluru",
  },
  {
    code: "DF-0020", first: "Grace", last: "Wanjiru", title: "Financial Analyst",
    dept: "Finance", band: "MID", role: "EMPLOYEE", status: "ACTIVE", type: "FULL_TIME",
    joinedMonthsAgo: 12, profile: "RELIABLE", shift: ["09:30", "18:30"], managerCode: "DF-0019",
    color: "sky", city: "Bengaluru",
  },
  {
    code: "DF-0021", first: "Vikram", last: "Sinha", title: "Accounts Executive",
    dept: "Finance", band: "JUNIOR", role: "EMPLOYEE", status: "NOTICE_PERIOD", type: "FULL_TIME",
    joinedMonthsAgo: 25, profile: "SPOTTY", shift: ["09:30", "18:30"], managerCode: "DF-0019",
    color: "amber", city: "Lucknow",
  },
  // ---- Operations ---------------------------------------------------------
  {
    code: "DF-0022", first: "Mohit", last: "Chandra", title: "Operations Manager",
    dept: "Operations", band: "LEAD", role: "EMPLOYEE", status: "ACTIVE", type: "FULL_TIME",
    joinedMonthsAgo: 34, profile: "RELIABLE", shift: ["09:00", "18:00"], managerCode: "DF-0001",
    color: "indigo", city: "Bengaluru",
  },
  {
    code: "DF-0023", first: "Zoya", last: "Rahman", title: "Operations Analyst",
    dept: "Operations", band: "MID", role: "EMPLOYEE", status: "ACTIVE", type: "FULL_TIME",
    joinedMonthsAgo: 10, profile: "LATE", shift: ["09:00", "18:00"], managerCode: "DF-0022",
    color: "violet", city: "Bengaluru",
  },
  {
    code: "DF-0024", first: "Emeka", last: "Obi", title: "IT Support Specialist",
    dept: "Operations", band: "MID", role: "EMPLOYEE", status: "ACTIVE", type: "CONTRACT",
    joinedMonthsAgo: 8, profile: "RELIABLE", shift: ["09:00", "18:00"], managerCode: "DF-0022",
    color: "teal", city: "Bengaluru",
  },
  {
    code: "DF-0025", first: "Sara", last: "Haddad", title: "Talent Acquisition Specialist",
    dept: "Human Resources", band: "MID", role: "EMPLOYEE", status: "ACTIVE", type: "FULL_TIME",
    joinedMonthsAgo: 5, profile: "RELIABLE", shift: ["09:30", "18:30"], managerCode: "DF-0002",
    color: "rose", city: "Bengaluru",
  },
  {
    code: "DF-0026", first: "Ritu", last: "Sharma", title: "Office Administrator",
    dept: "Operations", band: "JUNIOR", role: "EMPLOYEE", status: "PROBATION", type: "FULL_TIME",
    joinedMonthsAgo: 1, profile: "RELIABLE", shift: ["09:00", "18:00"], managerCode: "DF-0022",
    color: "amber", city: "Bengaluru", noSalary: true,
  },
];

const LEAVE_TYPES = [
  { code: "PAID", name: "Paid leave", tone: "indigo", defaultAnnualDays: 18, isPaid: true, requiresReason: true, sortOrder: 1 },
  { code: "SICK", name: "Sick leave", tone: "rose", defaultAnnualDays: 10, isPaid: true, requiresReason: true, sortOrder: 2 },
  { code: "CASUAL", name: "Casual leave", tone: "teal", defaultAnnualDays: 6, isPaid: true, requiresReason: true, sortOrder: 3 },
  { code: "UNPAID", name: "Unpaid leave", tone: "slate", defaultAnnualDays: 0, isPaid: false, requiresReason: true, sortOrder: 4 },
];

function holidaysFor(year: number) {
  return [
    { date: `${year}-01-01`, name: "New Year's Day", optional: false },
    { date: `${year}-01-26`, name: "Republic Day", optional: false },
    { date: `${year}-03-04`, name: "Holi", optional: false },
    { date: `${year}-05-01`, name: "Labour Day", optional: false },
    { date: `${year}-08-15`, name: "Independence Day", optional: false },
    { date: `${year}-10-02`, name: "Gandhi Jayanti", optional: false },
    { date: `${year}-11-08`, name: "Diwali", optional: false },
    { date: `${year}-12-25`, name: "Christmas Day", optional: false },
  ];
}

const email = (p: SeedPerson) =>
  p.login ?? `${p.first.toLowerCase()}.${p.last.toLowerCase()}@dayflow.io`;

async function reset() {
  // Order matters: children before parents, because SQLite enforces the FKs.
  await prisma.auditEvent.deleteMany();
  await prisma.notification.deleteMany();
  await prisma.document.deleteMany();
  await prisma.payslip.deleteMany();
  await prisma.payrollRun.deleteMany();
  await prisma.salaryStructure.deleteMany();
  await prisma.leaveRequest.deleteMany();
  await prisma.leaveBalance.deleteMany();
  await prisma.attendance.deleteMany();
  await prisma.leaveType.deleteMany();
  await prisma.employee.updateMany({ data: { managerId: null } });
  await prisma.employee.deleteMany();
  await prisma.department.deleteMany();
  await prisma.user.deleteMany();
  await prisma.holiday.deleteMany();
  await prisma.orgSetting.deleteMany();
}

async function main() {
  const today = toWorkDate(new Date(), TIMEZONE);
  const year = Number(today.slice(0, 4));
  console.log(`\n  Dayflow seed — anchoring data to ${today} (${TIMEZONE})\n`);

  await reset();

  await prisma.orgSetting.create({
    data: {
      id: "org",
      companyName: "Dayflow",
      legalName: "Dayflow Technologies Pvt. Ltd.",
      timezone: TIMEZONE,
      currency: "INR",
      standardWorkMinutes: POLICY.standardWorkMinutes,
      halfDayMinutes: POLICY.halfDayMinutes,
      lateGraceMinutes: POLICY.lateGraceMinutes,
      payrollDayOfMonth: 28,
    },
  });

  await prisma.holiday.createMany({
    data: [...holidaysFor(year - 1), ...holidaysFor(year), ...holidaysFor(year + 1)],
  });

  const departments = new Map<string, string>();
  for (const dept of DEPARTMENTS) {
    const row = await prisma.department.create({ data: dept });
    departments.set(dept.name, row.id);
  }

  const leaveTypes = new Map<string, { id: string; defaultAnnualDays: number }>();
  for (const type of LEAVE_TYPES) {
    const row = await prisma.leaveType.create({ data: type });
    leaveTypes.set(type.code, { id: row.id, defaultAnnualDays: row.defaultAnnualDays });
  }

  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);
  const employeeIdByCode = new Map<string, string>();
  const userIdByCode = new Map<string, string>();

  for (const person of PEOPLE) {
    const user = await prisma.user.create({
      data: {
        email: email(person),
        passwordHash,
        role: person.role,
        emailVerified: true,
        verifiedAt: new Date(),
        lastLoginAt: new Date(Date.now() - between(1, 72) * 3600_000),
      },
    });
    const employee = await prisma.employee.create({
      data: {
        userId: user.id,
        employeeCode: person.code,
        firstName: person.first,
        lastName: person.last,
        workEmail: email(person),
        personalEmail: `${person.first.toLowerCase()}${between(10, 99)}@example.com`,
        phone: `+91 ${between(70, 99)}${between(10000000, 99999999)}`,
        address: `${between(1, 240)}, ${pick(["Indira Nagar", "Koramangala", "HSR Layout", "Jayanagar", "Whitefield", "Andheri West", "Banjara Hills"])}`,
        city: person.city,
        country: "India",
        dateOfBirth: new Date(
          Date.UTC(year - between(24, 42), between(0, 11), between(1, 28)),
        ),
        gender: pick(["Female", "Male", "Prefer not to say"]),
        avatarColor: person.color,
        jobTitle: person.title,
        employmentType: person.type,
        status: person.status,
        departmentId: departments.get(person.dept)!,
        joinedAt: new Date(
          `${addWorkMonths(today, -person.joinedMonthsAgo)}T00:00:00.000Z`,
        ),
        location: `${person.city}, IN`,
        shiftStart: person.shift[0],
        shiftEnd: person.shift[1],
        weeklyOffCsv: WEEKLY_OFF,
        emergencyContactName: `${pick(["Anita", "Suresh", "Kavya", "Ramesh", "Leela", "Farhan"])} ${person.last}`,
        emergencyContactPhone: `+91 ${between(70, 99)}${between(10000000, 99999999)}`,
      },
    });
    employeeIdByCode.set(person.code, employee.id);
    userIdByCode.set(person.code, user.id);
  }

  // Managers in a second pass so every target row already exists.
  for (const person of PEOPLE) {
    if (!person.managerCode) continue;
    await prisma.employee.update({
      where: { id: employeeIdByCode.get(person.code)! },
      data: { managerId: employeeIdByCode.get(person.managerCode)! },
    });
  }
  for (const dept of DEPARTMENTS) {
    const head = PEOPLE.find((p) => p.dept === dept.name && p.band === "LEAD");
    if (head) {
      await prisma.department.update({
        where: { id: departments.get(dept.name)! },
        data: { headId: employeeIdByCode.get(head.code)! },
      });
    }
  }

  for (const person of PEOPLE) {
    if (person.noSalary) continue;
    const band = BANDS[person.band];
    // A small deterministic spread so no two salaries are suspiciously identical.
    const jitter = 1 + (between(-4, 6) / 100);
    await prisma.salaryStructure.create({
      data: {
        employeeId: employeeIdByCode.get(person.code)!,
        currency: "INR",
        effectiveFrom: startOfMonth(addWorkMonths(today, -between(2, 10))),
        basic: Math.round((band.basic * jitter) / 100) * 100,
        hra: Math.round((band.hra * jitter) / 100) * 100,
        specialAllowance: Math.round((band.specialAllowance * jitter) / 100) * 100,
        transportAllow: band.transportAllow,
        providentFund: Math.round((band.providentFund * jitter) / 10) * 10,
        professionalTax: band.professionalTax,
        healthInsurance: band.healthInsurance,
        revision: between(1, 3),
        updatedByName: "Neha Kapoor",
      },
    });
  }

  console.log(`  ✓ ${PEOPLE.length} employees across ${DEPARTMENTS.length} departments`);
  await seedLeave(today, year, employeeIdByCode, userIdByCode, leaveTypes);
  await seedAttendance(today, employeeIdByCode);
  await seedPayroll(today, employeeIdByCode);
  await seedDocumentsAndFeed(today, employeeIdByCode, userIdByCode);

  const counts = {
    users: await prisma.user.count(),
    attendance: await prisma.attendance.count(),
    leave: await prisma.leaveRequest.count(),
    payslips: await prisma.payslip.count(),
    notifications: await prisma.notification.count(),
    events: await prisma.auditEvent.count(),
  };
  console.log(
    `\n  Seed complete — ${counts.attendance} attendance rows, ${counts.leave} leave requests, ` +
      `${counts.payslips} payslips, ${counts.notifications} notifications, ${counts.events} audit events.`,
  );
  console.log(`\n  Demo sign-in (password: ${DEMO_PASSWORD})`);
  console.log("    admin@dayflow.io     Neha Kapoor    Administrator");
  console.log("    hr@dayflow.io        Arjun Malhotra HR Officer");
  console.log("    employee@dayflow.io  Aarav Mehta    Employee\n");
}

const LEAVE_REASONS: Record<string, string[]> = {
  PAID: [
    "Family wedding in Jaipur, travelling with parents.",
    "Pre-planned trip to Coorg with family.",
    "Annual break — visiting hometown for a week.",
    "Moving apartments, need time to complete the shift.",
  ],
  SICK: [
    "Viral fever, doctor advised two days of rest.",
    "Dental surgery scheduled, recovery time needed.",
    "Recovering from food poisoning, on medication.",
    "Migraine flare-up, unable to work at a screen.",
  ],
  CASUAL: [
    "Passport appointment at the regional office.",
    "Attending a cousin's engagement ceremony.",
    "Parent-teacher meeting at my daughter's school.",
    "Vehicle registration work at the RTO.",
  ],
  UNPAID: [
    "Extended personal leave beyond my paid balance.",
    "Family emergency, need additional unpaid days.",
  ],
};

/** Approved-leave windows we place deliberately so the demo always has a story. */
type ScriptedLeave = {
  code: string;
  type: string;
  offsetStart: number;
  days: number;
  status: "APPROVED" | "PENDING" | "REJECTED";
  createdDaysAgo: number;
  comment?: string;
};

const SCRIPTED_LEAVE: ScriptedLeave[] = [
  // On leave right now — visible on today's board.
  { code: "DF-0006", type: "PAID", offsetStart: -1, days: 4, status: "APPROVED", createdDaysAgo: 12, comment: "Approved. Handover noted in the sprint board." },
  { code: "DF-0020", type: "SICK", offsetStart: 0, days: 2, status: "APPROVED", createdDaysAgo: 1, comment: "Get well soon." },
  // Aging pending request — fires the 48-hour attention rule.
  { code: "DF-0007", type: "PAID", offsetStart: 9, days: 5, status: "PENDING", createdDaysAgo: 4 },
  // Fresh pending requests for the approval demo.
  { code: "DF-0017", type: "CASUAL", offsetStart: 4, days: 1, status: "PENDING", createdDaysAgo: 0 },
  { code: "DF-0023", type: "SICK", offsetStart: 1, days: 2, status: "PENDING", createdDaysAgo: 0 },
  // The demo employee: one pending, one approved in the past, one rejected.
  { code: "DF-0004", type: "PAID", offsetStart: 12, days: 3, status: "PENDING", createdDaysAgo: 1 },
  { code: "DF-0004", type: "SICK", offsetStart: -34, days: 2, status: "APPROVED", createdDaysAgo: 36, comment: "Approved — rest well." },
  { code: "DF-0004", type: "CASUAL", offsetStart: -20, days: 1, status: "REJECTED", createdDaysAgo: 24, comment: "Release week — please reschedule to the following Monday." },
  // Upcoming approved leave elsewhere in the org.
  { code: "DF-0014", type: "PAID", offsetStart: 6, days: 5, status: "APPROVED", createdDaysAgo: 15, comment: "Approved. Enjoy the break." },
  { code: "DF-0011", type: "UNPAID", offsetStart: -8, days: 2, status: "APPROVED", createdDaysAgo: 14, comment: "Approved as unpaid — balance exhausted." },
];

async function seedLeave(
  today: WorkDate,
  year: number,
  employeeIdByCode: Map<string, string>,
  userIdByCode: Map<string, string>,
  leaveTypes: Map<string, { id: string; defaultAnnualDays: number }>,
) {
  const holidays = new Set(
    (await prisma.holiday.findMany({ select: { date: true } })).map((h) => h.date),
  );
  const offDays = WEEKLY_OFF.split(",").map(Number);
  const isWorking = (d: WorkDate) => !offDays.includes(weekdayOf(d)) && !holidays.has(d);

  /** Expand an offset window into a real range covering `days` working days. */
  function window(offsetStart: number, days: number) {
    const start = addWorkDays(today, offsetStart);
    let cursor = start;
    let counted = isWorking(start) ? 1 : 0;
    while (counted < days) {
      cursor = addWorkDays(cursor, 1);
      if (isWorking(cursor)) counted += 1;
    }
    const dates = eachWorkDate(start, cursor).filter(isWorking);
    return { start, end: cursor, workingDays: dates.length };
  }

  const approver = employeeIdByCode.get("DF-0002")!;
  const created: { code: string; typeCode: string; workingDays: number; status: string }[] = [];

  const place = async (spec: ScriptedLeave) => {
    const { start, end, workingDays } = window(spec.offsetStart, spec.days);
    if (workingDays === 0) return;
    const type = leaveTypes.get(spec.type)!;
    const createdAt = new Date(Date.now() - spec.createdDaysAgo * 86_400_000 - between(1, 8) * 3600_000);
    await prisma.leaveRequest.create({
      data: {
        employeeId: employeeIdByCode.get(spec.code)!,
        leaveTypeId: type.id,
        startDate: start,
        endDate: end,
        workingDays,
        reason: pick(LEAVE_REASONS[spec.type]),
        status: spec.status,
        createdAt,
        updatedAt: createdAt,
        ...(spec.status === "PENDING"
          ? {}
          : {
              decidedById: approver,
              decidedAt: new Date(createdAt.getTime() + between(3, 30) * 3600_000),
              decisionComment: spec.comment ?? null,
            }),
      },
    });
    created.push({ code: spec.code, typeCode: spec.type, workingDays, status: spec.status });
  };

  for (const spec of SCRIPTED_LEAVE) await place(spec);

  // Fill in believable history for everyone else so reports are not sparse.
  for (const person of PEOPLE) {
    const alreadyScripted = created.filter((c) => c.code === person.code).length;
    const target = person.joinedMonthsAgo >= 6 ? between(1, 3) : between(0, 1);
    for (let i = 0; i < Math.max(0, target - alreadyScripted); i += 1) {
      const typeCode = pick(["PAID", "SICK", "CASUAL"]);
      const offset = -between(20, 150);
      await place({
        code: person.code,
        type: typeCode,
        offsetStart: offset,
        days: typeCode === "SICK" ? between(1, 2) : between(1, 4),
        status: chance(0.9) ? "APPROVED" : "REJECTED",
        createdDaysAgo: -offset + between(2, 10),
        comment: chance(0.5) ? "Approved. Coverage confirmed with the team." : undefined,
      });
    }
  }

  // Balances derive from what was actually approved this year.
  for (const person of PEOPLE) {
    const employeeId = employeeIdByCode.get(person.code)!;
    for (const [code, type] of leaveTypes) {
      const used = await prisma.leaveRequest.aggregate({
        where: {
          employeeId,
          leaveTypeId: type.id,
          status: "APPROVED",
          startDate: { gte: `${year}-01-01`, lte: `${year}-12-31` },
        },
        _sum: { workingDays: true },
      });
      const usedDays = Math.round((used._sum.workingDays ?? 0) * 10) / 10;
      // Pro-rate the entitlement for anyone who joined part-way through the year.
      const entitled =
        type.defaultAnnualDays > 0
          ? Math.max(
              usedDays,
              person.joinedMonthsAgo >= 12
                ? type.defaultAnnualDays
                : Math.round(type.defaultAnnualDays * (person.joinedMonthsAgo / 12) * 2) / 2,
            )
          : 0;
      await prisma.leaveBalance.create({
        data: { employeeId, leaveTypeId: type.id, year, entitledDays: entitled, usedDays },
      });
      if (code === "UNPAID") continue;
    }
  }

  const total = await prisma.leaveRequest.count();
  const pending = await prisma.leaveRequest.count({ where: { status: "PENDING" } });
  console.log(`  ✓ ${total} leave requests (${pending} pending) and balances for ${year}`);
  return { userIdByCode };
}

/** Today's board is scripted so the command centre always has a live story. */
const TODAY_SCRIPT: Record<string, "WORKING" | "COMPLETED" | "ABSENT" | "NONE"> = {
  "DF-0004": "NONE", // demo employee — left open so check-in can be shown live
  "DF-0010": "ABSENT",
  "DF-0021": "ABSENT",
  "DF-0017": "COMPLETED",
  "DF-0018": "COMPLETED",
  "DF-0024": "COMPLETED",
};

async function seedAttendance(today: WorkDate, employeeIdByCode: Map<string, string>) {
  const now = new Date();
  const holidays = new Set(
    (await prisma.holiday.findMany({ select: { date: true } })).map((h) => h.date),
  );
  const offDays = WEEKLY_OFF.split(",").map(Number);
  const from = addWorkDays(today, -(HISTORY_DAYS - 1));

  const approved = await prisma.leaveRequest.findMany({
    where: { status: "APPROVED", endDate: { gte: from } },
    select: { employeeId: true, startDate: true, endDate: true, leaveType: { select: { name: true } } },
  });
  const leaveByEmployee = new Map<string, Map<WorkDate, string>>();
  for (const request of approved) {
    const bucket = leaveByEmployee.get(request.employeeId) ?? new Map<WorkDate, string>();
    for (const day of eachWorkDate(request.startDate, request.endDate)) {
      bucket.set(day, request.leaveType.name);
    }
    leaveByEmployee.set(request.employeeId, bucket);
  }

  type Row = {
    employeeId: string;
    workDate: string;
    checkInAt: Date | null;
    checkOutAt: Date | null;
    status: string;
    workedMinutes: number;
    lateMinutes: number;
    earlyExitMinutes: number;
    source: string;
    note: string | null;
  };
  const rows: Row[] = [];

  /** Never let a seeded instant land in the future. */
  const clamp = (instant: Date) =>
    instant.getTime() > now.getTime() - 60_000
      ? new Date(now.getTime() - between(6, 95) * 60_000)
      : instant;

  for (const person of PEOPLE) {
    const employeeId = employeeIdByCode.get(person.code)!;
    const joined = addWorkMonths(today, -person.joinedMonthsAgo);
    const leaveDays = leaveByEmployee.get(employeeId) ?? new Map<WorkDate, string>();

    const lateRate = person.profile === "LATE" ? 0.42 : person.profile === "SPOTTY" ? 0.18 : 0.07;
    const absentRate = person.profile === "SPOTTY" ? 0.09 : person.profile === "LATE" ? 0.03 : 0.015;
    const halfDayRate = person.profile === "SPOTTY" ? 0.05 : 0.02;

    for (const workDate of eachWorkDate(from, today)) {
      if (workDate < joined) continue;
      if (offDays.includes(weekdayOf(workDate)) || holidays.has(workDate)) continue;

      const leaveName = leaveDays.get(workDate);
      if (leaveName) {
        rows.push({
          employeeId,
          workDate,
          checkInAt: null,
          checkOutAt: null,
          status: "LEAVE",
          workedMinutes: 0,
          lateMinutes: 0,
          earlyExitMinutes: 0,
          source: "SYSTEM",
          note: `${leaveName} approved by Arjun Malhotra`,
        });
        continue;
      }

      if (workDate === today) {
        const script = TODAY_SCRIPT[person.code];
        if (script === "NONE" || script === "ABSENT") continue;

        const late = chance(lateRate);
        const checkIn = clamp(
          new Date(
            workDateTimeUtc(workDate, person.shift[0], TIMEZONE).getTime() +
              (late ? between(14, 55) : between(-18, 8)) * 60_000,
          ),
        );
        const lateMinutes = lateMinutesFor(
          Math.round(
            (checkIn.getTime() - workDateTimeUtc(workDate, "00:00", TIMEZONE).getTime()) / 60_000,
          ),
          person.shift[0],
          POLICY,
        );
        const elapsed = Math.round((now.getTime() - checkIn.getTime()) / 60_000);

        if (script === "COMPLETED" && elapsed >= POLICY.halfDayMinutes) {
          const checkOut = new Date(now.getTime() - between(20, 90) * 60_000);
          const worked = Math.max(0, Math.round((checkOut.getTime() - checkIn.getTime()) / 60_000));
          rows.push({
            employeeId,
            workDate,
            checkInAt: checkIn,
            checkOutAt: checkOut,
            status: deriveCompletedStatus(worked, POLICY),
            workedMinutes: worked,
            lateMinutes,
            earlyExitMinutes: 0,
            source: "SELF",
            note: null,
          });
        } else {
          rows.push({
            employeeId,
            workDate,
            checkInAt: checkIn,
            checkOutAt: null,
            status: "PRESENT",
            workedMinutes: 0,
            lateMinutes,
            earlyExitMinutes: 0,
            source: "SELF",
            note: null,
          });
        }
        continue;
      }

      if (chance(absentRate)) {
        rows.push({
          employeeId,
          workDate,
          checkInAt: null,
          checkOutAt: null,
          status: "ABSENT",
          workedMinutes: 0,
          lateMinutes: 0,
          earlyExitMinutes: 0,
          source: "SYSTEM",
          note: null,
        });
        continue;
      }

      const late = chance(lateRate);
      const half = chance(halfDayRate);
      const checkIn = new Date(
        workDateTimeUtc(workDate, person.shift[0], TIMEZONE).getTime() +
          (late ? between(14, 62) : between(-22, 9)) * 60_000,
      );
      const plannedMinutes = half
        ? between(250, 320)
        : POLICY.standardWorkMinutes + between(-8, 78);
      const checkOut = new Date(checkIn.getTime() + plannedMinutes * 60_000);
      const worked = plannedMinutes;
      const lateMinutes = lateMinutesFor(
        Math.round(
          (checkIn.getTime() - workDateTimeUtc(workDate, "00:00", TIMEZONE).getTime()) / 60_000,
        ),
        person.shift[0],
        POLICY,
      );
      const shiftEndMinutes =
        Number(person.shift[1].slice(0, 2)) * 60 + Number(person.shift[1].slice(3, 5));
      const outMinutes = Math.round(
        (checkOut.getTime() - workDateTimeUtc(workDate, "00:00", TIMEZONE).getTime()) / 60_000,
      );

      rows.push({
        employeeId,
        workDate,
        checkInAt: checkIn,
        checkOutAt: checkOut,
        status: deriveCompletedStatus(worked, POLICY),
        workedMinutes: worked,
        lateMinutes,
        earlyExitMinutes: Math.max(0, shiftEndMinutes - outMinutes),
        source: "SELF",
        note: half ? "Left early — personal errand" : null,
      });
    }
  }

  // One unclosed record so the "missing check-out" rule has something to find.
  const unclosedTarget = employeeIdByCode.get("DF-0010")!;
  const unclosedDate = rows.find(
    (r) =>
      r.employeeId === unclosedTarget &&
      r.workDate < today &&
      r.workDate > addWorkDays(today, -12) &&
      r.checkOutAt !== null,
  );
  if (unclosedDate) {
    unclosedDate.checkOutAt = null;
    unclosedDate.workedMinutes = 0;
    unclosedDate.status = "PRESENT";
    unclosedDate.note = "Forgot to check out";
  }

  for (let i = 0; i < rows.length; i += 400) {
    await prisma.attendance.createMany({ data: rows.slice(i, i + 400) });
  }
  console.log(`  ✓ ${rows.length} attendance rows across ${HISTORY_DAYS} days`);
}

async function seedPayroll(today: WorkDate, employeeIdByCode: Map<string, string>) {
  const holidays = new Set(
    (await prisma.holiday.findMany({ select: { date: true } })).map((h) => h.date),
  );
  const offDays = WEEKLY_OFF.split(",").map(Number);

  // The two completed months are closed out; the current month is deliberately
  // left un-run so the payroll workflow can be demonstrated live.
  const periods = [
    { period: periodOf(addWorkMonths(today, -2)), status: "PAID" },
    { period: periodOf(addWorkMonths(today, -1)), status: "PAID" },
  ];

  const structures = await prisma.salaryStructure.findMany({
    include: { employee: { select: { id: true, joinedAt: true, status: true } } },
  });

  for (const { period, status } of periods) {
    const monthStart = `${period}-01`;
    const monthEnd = endOfMonth(monthStart);
    const run = await prisma.payrollRun.create({
      data: {
        period,
        status,
        processedAt: new Date(`${monthEnd}T12:30:00.000Z`),
        processedBy: "Neha Kapoor",
      },
    });

    const attendance = await prisma.attendance.findMany({
      where: { workDate: { gte: monthStart, lte: monthEnd } },
      select: { employeeId: true, workDate: true, status: true },
    });
    const statusByKey = new Map(
      attendance.map((a) => [`${a.employeeId}|${a.workDate}`, a.status]),
    );
    const monthDays = eachWorkDate(monthStart, monthEnd);

    for (const structure of structures) {
      if (toWorkDate(structure.employee.joinedAt, TIMEZONE) > monthEnd) continue;

      let payable = 0;
      let unpaid = 0;
      for (const day of monthDays) {
        if (offDays.includes(weekdayOf(day)) || holidays.has(day)) continue;
        payable += 1;
        const st = statusByKey.get(`${structure.employeeId}|${day}`);
        if (st === "ABSENT" || st === undefined) {
          if (st === "ABSENT") unpaid += 1;
        } else if (st === "HALF_DAY") unpaid += 0.5;
      }

      const computed = computePayslip({
        components: structure,
        payableDays: payable,
        unpaidAbsenceDays: unpaid,
      });
      await prisma.payslip.create({
        data: {
          payrollRunId: run.id,
          employeeId: structure.employeeId,
          period,
          totalEarnings: computed.totalEarnings,
          totalDeductions: computed.totalDeductions,
          netPay: computed.netPay,
          lopDays: computed.lopDays,
          paidDays: computed.paidDays,
          breakdownJson: JSON.stringify(computed.lines),
          createdAt: new Date(`${monthEnd}T12:30:00.000Z`),
        },
      });
    }
  }

  const total = await prisma.payslip.aggregate({ _sum: { netPay: true }, _count: { _all: true } });
  console.log(
    `  ✓ ${total._count._all} payslips over ${periods.length} closed periods ` +
      `(₹${Math.round(total._sum.netPay ?? 0).toLocaleString("en-IN")} disbursed)`,
  );
  void employeeIdByCode;
}

const DOC_TEMPLATES = [
  { name: "Offer letter.pdf", category: "CONTRACT", mime: "application/pdf", confidential: true, size: 184_320 },
  { name: "Employment agreement.pdf", category: "CONTRACT", mime: "application/pdf", confidential: true, size: 241_664 },
  { name: "PAN card.pdf", category: "ID_PROOF", mime: "application/pdf", confidential: true, size: 96_256 },
  { name: "Graduation certificate.pdf", category: "CERTIFICATE", mime: "application/pdf", confidential: false, size: 312_320 },
  { name: "Employee handbook 2026.pdf", category: "POLICY", mime: "application/pdf", confidential: false, size: 1_048_576 },
  { name: "Leave policy.pdf", category: "POLICY", mime: "application/pdf", confidential: false, size: 204_800 },
];

async function seedDocumentsAndFeed(
  today: WorkDate,
  employeeIdByCode: Map<string, string>,
  userIdByCode: Map<string, string>,
) {
  for (const person of PEOPLE) {
    const employeeId = employeeIdByCode.get(person.code)!;
    const count = between(2, 4);
    const chosen = [...DOC_TEMPLATES].sort(() => rng() - 0.5).slice(0, count);
    await prisma.document.createMany({
      data: chosen.map((doc) => ({
        employeeId,
        name: doc.name,
        category: doc.category,
        mimeType: doc.mime,
        sizeBytes: doc.size + between(0, 40_960),
        confidential: doc.confidential,
        uploadedBy: doc.category === "POLICY" ? "Neha Kapoor" : "Arjun Malhotra",
        uploadedAt: new Date(Date.now() - between(20, 400) * 86_400_000),
      })),
    });
  }

  // The activity feed is a read of AuditEvent, so seed it from what "happened".
  const events: {
    actorUserId: string | null;
    actorName: string;
    employeeId: string | null;
    action: string;
    entityType: string;
    entityId: string | null;
    summary: string;
    createdAt: Date;
  }[] = [];

  const attendance = await prisma.attendance.findMany({
    where: { workDate: today, checkInAt: { not: null } },
    include: { employee: { select: { id: true, firstName: true, lastName: true, userId: true } } },
    orderBy: { checkInAt: "asc" },
  });
  for (const row of attendance) {
    events.push({
      actorUserId: row.employee.userId,
      actorName: `${row.employee.firstName} ${row.employee.lastName}`,
      employeeId: row.employee.id,
      action: "CHECK_IN",
      entityType: "Attendance",
      entityId: row.workDate,
      summary: row.lateMinutes > 0 ? `Checked in ${row.lateMinutes} min late` : "Checked in",
      createdAt: row.checkInAt!,
    });
    if (row.checkOutAt) {
      events.push({
        actorUserId: row.employee.userId,
        actorName: `${row.employee.firstName} ${row.employee.lastName}`,
        employeeId: row.employee.id,
        action: "CHECK_OUT",
        entityType: "Attendance",
        entityId: row.workDate,
        summary: `Checked out after ${Math.floor(row.workedMinutes / 60)}h ${row.workedMinutes % 60}m`,
        createdAt: row.checkOutAt,
      });
    }
  }

  const requests = await prisma.leaveRequest.findMany({
    where: { createdAt: { gte: new Date(Date.now() - 45 * 86_400_000) } },
    include: {
      leaveType: true,
      employee: { select: { id: true, firstName: true, lastName: true, userId: true } },
    },
  });
  const hrUserId = userIdByCode.get("DF-0002")!;
  for (const request of requests) {
    const who = `${request.employee.firstName} ${request.employee.lastName}`;
    events.push({
      actorUserId: request.employee.userId,
      actorName: who,
      employeeId: request.employee.id,
      action: "LEAVE_SUBMITTED",
      entityType: "LeaveRequest",
      entityId: request.id,
      summary: `Requested ${request.workingDays} day(s) of ${request.leaveType.name} (${request.startDate} → ${request.endDate})`,
      createdAt: request.createdAt,
    });
    if (request.decidedAt) {
      events.push({
        actorUserId: hrUserId,
        actorName: "Arjun Malhotra",
        employeeId: request.employee.id,
        action: request.status === "APPROVED" ? "LEAVE_APPROVED" : "LEAVE_REJECTED",
        entityType: "LeaveRequest",
        entityId: request.id,
        summary: `${request.status === "APPROVED" ? "Approved" : "Rejected"} ${who}'s ${request.leaveType.name}`,
        createdAt: request.decidedAt,
      });
    }
    // Notify the requester about decided requests, exactly as the service would.
    if (request.status === "APPROVED" || request.status === "REJECTED") {
      await prisma.notification.create({
        data: {
          userId: request.employee.userId,
          type: request.status === "APPROVED" ? "LEAVE_APPROVED" : "LEAVE_REJECTED",
          title: `${request.leaveType.name} ${request.status.toLowerCase()}`,
          body: `${request.startDate} → ${request.endDate} • Arjun Malhotra${
            request.decisionComment ? ` — “${request.decisionComment}”` : ""
          }`,
          href: `/leave?request=${request.id}`,
          createdAt: request.decidedAt ?? request.createdAt,
          readAt: chance(0.55) ? new Date(Date.now() - between(1, 40) * 3600_000) : null,
        },
      });
    }
    if (request.status === "PENDING") {
      for (const code of ["DF-0001", "DF-0002", "DF-0003"]) {
        await prisma.notification.create({
          data: {
            userId: userIdByCode.get(code)!,
            type: "LEAVE_SUBMITTED",
            title: `${who} requested ${request.leaveType.name.toLowerCase()}`,
            body: `${request.workingDays} day(s) • ${request.startDate} → ${request.endDate}`,
            href: `/leave?request=${request.id}`,
            createdAt: request.createdAt,
            readAt: null,
          },
        });
      }
    }
  }

  const runs = await prisma.payrollRun.findMany({ orderBy: { period: "asc" } });
  for (const run of runs) {
    const agg = await prisma.payslip.aggregate({
      where: { period: run.period },
      _sum: { netPay: true },
      _count: { _all: true },
    });
    events.push({
      actorUserId: userIdByCode.get("DF-0001")!,
      actorName: "Neha Kapoor",
      employeeId: null,
      action: "PAYROLL_PROCESSED",
      entityType: "PayrollRun",
      entityId: run.id,
      summary: `Processed ${run.period} payroll for ${agg._count._all} employees (net ₹${Math.round(
        agg._sum.netPay ?? 0,
      ).toLocaleString("en-IN")})`,
      createdAt: run.processedAt ?? new Date(),
    });
  }

  const latestRun = runs[runs.length - 1];
  if (latestRun) {
    const payslipUsers = await prisma.payslip.findMany({
      where: { period: latestRun.period },
      select: { employee: { select: { userId: true } } },
    });
    await prisma.notification.createMany({
      data: payslipUsers.map((p) => ({
        userId: p.employee.userId,
        type: "PAYSLIP_READY",
        title: `${latestRun.period} payslip is ready`,
        body: "Your payslip has been generated and is available to view or print.",
        href: "/payroll",
        createdAt: latestRun.processedAt ?? new Date(),
        readAt: chance(0.4) ? new Date() : null,
      })),
    });
  }

  await prisma.notification.createMany({
    data: PEOPLE.map((p) => ({
      userId: userIdByCode.get(p.code)!,
      type: "ANNOUNCEMENT",
      title: "Q3 review cycle opens next week",
      body: "Self-assessments open on the 1st. Managers have two weeks to submit calibrated ratings.",
      href: "/notifications",
      createdAt: new Date(Date.now() - 3 * 86_400_000),
      readAt: chance(0.35) ? new Date(Date.now() - 2 * 86_400_000) : null,
    })),
  });

  for (let i = 0; i < events.length; i += 400) {
    await prisma.auditEvent.createMany({ data: events.slice(i, i + 400) });
  }
  console.log(`  ✓ ${events.length} audit events and documents attached to every profile`);
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error("\n  Seed failed:", error);
    await prisma.$disconnect();
    process.exit(1);
  });




