import "server-only";

import { prisma } from "@/lib/db";
import { EMPLOYED_STATUSES, isManagement } from "@/lib/domain/constants";
import { formatDays, type Actor } from "@/lib/domain/rules";
import {
  addWorkDays,
  formatPeriod,
  formatWorkDate,
  formatWorkDateRange,
  periodOf,
  startOfMonth,
  type WorkDate,
} from "@/lib/domain/time";
import {
  getAttendanceSeries,
  getLiveWorkforce,
  getOrgDay,
  summariseAttendance,
} from "./attendance";
import { getLeaveBalances, getPendingLeave } from "./leave";
import { getOrgContext } from "./org";
import { getPayrollOverview } from "./payroll";

/**
 * "Ask Dayflow" — a deterministic natural-language query layer.
 *
 * This is intentionally *not* a language model. A question is matched against a
 * fixed set of intents; the matched intent then runs an ordinary database query
 * and the reply is assembled from those rows. That means:
 *
 *   - every figure shown is traceable to a table (reported in `sources`)
 *   - the feature works with no network access and no API key
 *   - it cannot hallucinate an HR fact, because it never generates one
 *
 * Answers are scoped by the caller's role: an employee can only ask about
 * themselves and non-sensitive team facts.
 */

export type AssistantMetric = {
  label: string;
  value: string;
  tone?: "default" | "positive" | "warning" | "critical";
};

export type AssistantAnswer = {
  intent: string;
  /** One-sentence direct answer. */
  headline: string;
  /** Optional supporting sentence. */
  detail?: string;
  metrics: AssistantMetric[];
  people: { id: string; name: string; meta: string; avatarColor: string }[];
  /** Tables consulted, shown to the user so the answer is auditable. */
  sources: string[];
  action?: { label: string; href: string };
  confident: boolean;
};

type Intent = {
  id: string;
  /** Every keyword group must match at least one term. */
  requires: string[][];
  /** Terms that add confidence but are not required. */
  boosts?: string[];
  managementOnly?: boolean;
  run: (ctx: IntentContext) => Promise<AssistantAnswer>;
};

type IntentContext = {
  actor: Actor;
  question: string;
  today: WorkDate;
  /** Department name detected in the question, if any. */
  department: { id: string; name: string } | null;
};

const has = (text: string, terms: string[]) => terms.some((t) => text.includes(t));

/* ------------------------------------------------------------------ intents */

const INTENTS: Intent[] = [
  {
    id: "absent-today",
    requires: [["absent", "absence", "missing", "not in", "away", "unaccounted"]],
    boosts: ["today", "now"],
    managementOnly: true,
    run: async ({ today }) => {
      const rows = await getOrgDay(today);
      const absent = rows.filter((r) => r.status === "ABSENT");
      const onLeave = rows.filter((r) => r.status === "LEAVE");
      return {
        intent: "absent-today",
        headline:
          absent.length === 0
            ? `Nobody is unaccounted for on ${formatWorkDate(today)}.`
            : `${absent.length} ${absent.length === 1 ? "person is" : "people are"} unaccounted for on ${formatWorkDate(today)}.`,
        detail:
          onLeave.length > 0
            ? `A further ${onLeave.length} ${onLeave.length === 1 ? "is" : "are"} on approved leave, which is not counted as an absence.`
            : undefined,
        metrics: [
          { label: "Unaccounted", value: String(absent.length), tone: absent.length > 0 ? "warning" : "positive" },
          { label: "On approved leave", value: String(onLeave.length) },
          { label: "Present", value: String(rows.filter((r) => r.status === "PRESENT" || r.status === "HALF_DAY").length), tone: "positive" },
        ],
        people: absent.slice(0, 8).map((r) => ({
          id: r.employeeId,
          name: r.name,
          meta: `${r.jobTitle}${r.department ? ` • ${r.department}` : ""}`,
          avatarColor: r.avatarColor,
        })),
        sources: ["Attendance", "LeaveRequest", "Holiday", "Employee"],
        action: { label: "Open attendance", href: "/attendance" },
        confident: true,
      };
    },
  },
  {
    id: "on-leave-today",
    requires: [["leave", "off", "vacation", "holiday"]],
    boosts: ["today", "who"],
    managementOnly: true,
    run: async ({ today }) => {
      const rows = await prisma.leaveRequest.findMany({
        where: { status: "APPROVED", startDate: { lte: today }, endDate: { gte: today } },
        include: {
          leaveType: { select: { name: true } },
          employee: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              avatarColor: true,
              jobTitle: true,
            },
          },
        },
      });
      return {
        intent: "on-leave-today",
        headline:
          rows.length === 0
            ? `No one is on approved leave on ${formatWorkDate(today)}.`
            : `${rows.length} ${rows.length === 1 ? "person is" : "people are"} on approved leave on ${formatWorkDate(today)}.`,
        metrics: [
          { label: "On leave", value: String(rows.length) },
          {
            label: "Returning within 3 days",
            value: String(rows.filter((r) => r.endDate <= addWorkDays(today, 3)).length),
          },
        ],
        people: rows.slice(0, 8).map((r) => ({
          id: r.employee.id,
          name: `${r.employee.firstName} ${r.employee.lastName}`,
          meta: `${r.leaveType.name} • back ${formatWorkDate(addWorkDays(r.endDate, 1), "short")}`,
          avatarColor: r.employee.avatarColor,
        })),
        sources: ["LeaveRequest", "LeaveType", "Employee"],
        action: { label: "Open leave", href: "/leave" },
        confident: true,
      };
    },
  },
  {
    id: "pending-leave",
    requires: [["pending", "waiting", "approve", "approval", "queue", "unapproved"]],
    managementOnly: true,
    run: async () => {
      const pending = await getPendingLeave(50);
      const aging = pending.filter((p) => p.ageHours >= 48);
      const days = pending.reduce((s, p) => s + p.workingDays, 0);
      return {
        intent: "pending-leave",
        headline:
          pending.length === 0
            ? "There are no leave requests waiting for a decision."
            : `${pending.length} leave ${pending.length === 1 ? "request is" : "requests are"} waiting for a decision.`,
        detail:
          aging.length > 0
            ? `${aging.length} ${aging.length === 1 ? "has" : "have"} been pending for more than 48 hours.`
            : undefined,
        metrics: [
          { label: "Pending", value: String(pending.length), tone: pending.length > 0 ? "warning" : "positive" },
          { label: "Over 48h", value: String(aging.length), tone: aging.length > 0 ? "critical" : "positive" },
          { label: "Days requested", value: formatDays(days) },
        ],
        people: pending.slice(0, 8).map((p) => ({
          id: p.employeeId,
          name: p.employeeName,
          meta: `${p.leaveType} • ${formatWorkDateRange(p.startDate, p.endDate)} • ${p.ageHours}h old`,
          avatarColor: p.avatarColor,
        })),
        sources: ["LeaveRequest", "LeaveType", "Employee"],
        action: { label: "Review queue", href: "/leave?status=PENDING" },
        confident: true,
      };
    },
  },
  {
    id: "late-today",
    requires: [["late", "delayed", "tardy"]],
    managementOnly: true,
    run: async ({ today }) => {
      const rows = await getOrgDay(today);
      const late = rows.filter((r) => r.lateMinutes > 0).sort((a, b) => b.lateMinutes - a.lateMinutes);
      return {
        intent: "late-today",
        headline:
          late.length === 0
            ? `No late arrivals recorded on ${formatWorkDate(today)}.`
            : `${late.length} late ${late.length === 1 ? "arrival" : "arrivals"} on ${formatWorkDate(today)}.`,
        detail: "Late is measured against each employee's own shift start plus the grace period in Settings.",
        metrics: [
          { label: "Late arrivals", value: String(late.length), tone: late.length > 0 ? "warning" : "positive" },
          {
            label: "Worst delay",
            value: late.length > 0 ? `${late[0].lateMinutes} min` : "—",
          },
        ],
        people: late.slice(0, 8).map((r) => ({
          id: r.employeeId,
          name: r.name,
          meta: `${r.lateMinutes} min late • ${r.department ?? "Unassigned"}`,
          avatarColor: r.avatarColor,
        })),
        sources: ["Attendance", "Employee", "OrgSetting"],
        action: { label: "Open attendance", href: "/attendance" },
        confident: true,
      };
    },
  },
  {
    id: "department-attendance",
    requires: [["attendance", "present", "presence", "working", "in office"]],
    boosts: ["team", "department"],
    managementOnly: true,
    run: async ({ today, department }) => {
      const rows = await getOrgDay(today, department ? { departmentId: department.id } : {});
      const present = rows.filter((r) => r.status === "PRESENT" || r.status === "HALF_DAY").length;
      const expected = rows.filter((r) => !["WEEK_OFF", "HOLIDAY"].includes(r.status)).length;
      const scope = department ? department.name : "the organisation";
      return {
        intent: "department-attendance",
        headline:
          expected === 0
            ? `${formatWorkDate(today)} is a non-working day for ${scope}.`
            : `${present} of ${expected} expected in ${scope} are present on ${formatWorkDate(today)}.`,
        detail:
          expected > 0
            ? `That is a ${Math.round((present / expected) * 100)}% presence rate. Week offs and public holidays are excluded from the denominator.`
            : undefined,
        metrics: [
          { label: "Present", value: String(present), tone: "positive" },
          { label: "Expected", value: String(expected) },
          { label: "On leave", value: String(rows.filter((r) => r.status === "LEAVE").length) },
          {
            label: "Working now",
            value: String(rows.filter((r) => r.checkInAt && !r.checkOutAt).length),
          },
        ],
        people: rows
          .filter((r) => r.checkInAt && !r.checkOutAt)
          .slice(0, 8)
          .map((r) => ({
            id: r.employeeId,
            name: r.name,
            meta: `Working • ${r.department ?? "Unassigned"}`,
            avatarColor: r.avatarColor,
          })),
        sources: ["Attendance", "Employee", "Department", "Holiday"],
        action: {
          label: "Open attendance",
          href: department ? `/attendance?departmentId=${department.id}` : "/attendance",
        },
        confident: true,
      };
    },
  },
  {
    id: "payroll-status",
    requires: [["payroll", "salary", "payslip", "pay run", "paid"]],
    managementOnly: true,
    run: async () => {
      const overview = await getPayrollOverview();
      const status = overview.currentRun?.status ?? "NOT_STARTED";
      const label: Record<string, string> = {
        NOT_STARTED: "has not been created yet",
        DRAFT: "is still a draft",
        PROCESSED: "is processed and awaiting payment",
        PAID: "is fully paid",
      };
      return {
        intent: "payroll-status",
        headline: `${overview.currentPeriodLabel} payroll ${label[status]}.`,
        detail: `The monthly salary commitment across employed staff is ${inr(overview.monthlyCommitment)}.`,
        metrics: [
          { label: "Payslips generated", value: String(overview.processedCount) },
          { label: "Net this period", value: inr(overview.currentNet) },
          { label: "Monthly commitment", value: inr(overview.monthlyCommitment) },
          {
            label: "Status",
            value: status === "NOT_STARTED" ? "Not started" : status,
            tone: status === "PAID" ? "positive" : status === "NOT_STARTED" ? "warning" : "default",
          },
        ],
        people: [],
        sources: ["PayrollRun", "Payslip", "SalaryStructure", "Employee"],
        action: { label: "Open payroll", href: "/payroll" },
        confident: true,
      };
    },
  },
  {
    id: "headcount",
    requires: [["how many", "headcount", "employees", "staff", "team size", "people"]],
    managementOnly: true,
    run: async () => {
      const [total, byDept, joinedThisMonth] = await Promise.all([
        prisma.employee.count({ where: { status: { in: EMPLOYED_STATUSES } } }),
        prisma.employee.groupBy({
          by: ["departmentId"],
          where: { status: { in: EMPLOYED_STATUSES } },
          _count: { _all: true },
        }),
        prisma.employee.count({
          where: { joinedAt: { gte: new Date(`${periodOf(new Date().toISOString().slice(0, 10))}-01T00:00:00Z`) } },
        }),
      ]);
      const departments = await prisma.department.findMany({ select: { id: true, name: true } });
      const nameById = new Map(departments.map((d) => [d.id, d.name]));
      const largest = byDept
        .map((d) => ({
          name: d.departmentId ? (nameById.get(d.departmentId) ?? "Unassigned") : "Unassigned",
          count: d._count._all,
        }))
        .sort((a, b) => b.count - a.count)[0];

      return {
        intent: "headcount",
        headline: `There are ${total} employed people across ${byDept.length} departments.`,
        detail: largest ? `${largest.name} is the largest team with ${largest.count}.` : undefined,
        metrics: [
          { label: "Employed", value: String(total) },
          { label: "Departments", value: String(byDept.length) },
          { label: "Joined this month", value: String(joinedThisMonth) },
        ],
        people: [],
        sources: ["Employee", "Department"],
        action: { label: "Open directory", href: "/people" },
        confident: true,
      };
    },
  },
  {
    id: "my-leave-balance",
    requires: [["my", "i ", "me", "mine"], ["balance", "leave", "holiday", "time off"]],
    run: async ({ actor, today }) => {
      if (!actor.employeeId) {
        return unknownAnswer("Your account is not linked to an employee record.");
      }
      const balances = await getLeaveBalances(actor.employeeId, Number(today.slice(0, 4)));
      const capped = balances.filter((b) => b.cap !== null);
      return {
        intent: "my-leave-balance",
        headline: capped.length
          ? `You have ${capped
              .map((b) => `${formatDays(b.remainingDays ?? 0)} of ${b.name.toLowerCase()}`)
              .join(", ")} remaining.`
          : "No capped leave types are configured for you.",
        detail: "Pending requests are already deducted from these figures.",
        metrics: capped.map((b) => ({
          label: b.name,
          value: `${b.remainingDays ?? 0} / ${b.cap}`,
          tone: (b.remainingDays ?? 0) <= 1 ? "warning" : "default",
        })),
        people: [],
        sources: ["LeaveBalance", "LeaveRequest", "LeaveType"],
        action: { label: "Apply for leave", href: "/leave" },
        confident: true,
      };
    },
  },
  {
    id: "my-hours",
    requires: [["my", "i ", "me", "mine"], ["hours", "worked", "time", "attendance"]],
    run: async ({ actor, today }) => {
      if (!actor.employeeId) {
        return unknownAnswer("Your account is not linked to an employee record.");
      }
      const days = await getAttendanceSeries(actor.employeeId, startOfMonth(today), today);
      const totals = summariseAttendance(days);
      return {
        intent: "my-hours",
        headline: `You have logged ${(totals.workedMinutes / 60).toFixed(1)} hours so far in ${formatPeriod(periodOf(today))}.`,
        detail: `Across ${totals.present + totals.halfDay} worked days, averaging ${(totals.avgWorkedMinutes / 60).toFixed(1)} hours a day.`,
        metrics: [
          { label: "Hours this month", value: (totals.workedMinutes / 60).toFixed(1) },
          { label: "Present days", value: String(totals.present) },
          { label: "Leave days", value: String(totals.leave) },
          {
            label: "Late arrivals",
            value: String(totals.lateDays),
            tone: totals.lateDays > 2 ? "warning" : "default",
          },
        ],
        people: [],
        sources: ["Attendance", "Holiday", "LeaveRequest"],
        action: { label: "Open my attendance", href: "/attendance" },
        confident: true,
      };
    },
  },
];

function inr(value: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(value);
}

function unknownAnswer(reason: string): AssistantAnswer {
  return {
    intent: "unknown",
    headline: reason,
    metrics: [],
    people: [],
    sources: [],
    confident: false,
  };
}

export const ASSISTANT_SUGGESTIONS = {
  management: [
    "Who is absent today?",
    "How many leave requests are pending?",
    "Show attendance for the Engineering team",
    "What is the latest payroll status?",
    "Who was late today?",
    "How many employees do we have?",
  ],
  employee: [
    "What is my leave balance?",
    "How many hours have I worked this month?",
  ],
} as const;

/**
 * Match a question to an intent and answer it from the database.
 *
 * Scoring is transparent: an intent must match every required keyword group, and
 * ties are broken by the number of optional boost terms present.
 */
export async function askDayflow(
  actor: Actor,
  question: string,
): Promise<AssistantAnswer> {
  const text = ` ${question.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ")} `;
  const org = await getOrgContext();
  const management = isManagement(actor.role);

  const departments = await prisma.department.findMany({ select: { id: true, name: true } });
  const department =
    departments.find((d) => text.includes(d.name.toLowerCase())) ?? null;

  const candidates = INTENTS.filter((intent) => {
    if (intent.managementOnly && !management) return false;
    return intent.requires.every((group) => has(text, group));
  }).map((intent) => ({
    intent,
    score:
      intent.requires.length * 2 +
      (intent.boosts?.filter((b) => text.includes(b)).length ?? 0),
  }));

  if (candidates.length === 0) {
    const suggestions = management
      ? ASSISTANT_SUGGESTIONS.management
      : ASSISTANT_SUGGESTIONS.employee;
    return {
      intent: "unknown",
      headline: "I can only answer questions I can verify against your data.",
      detail: `Try one of these: “${suggestions[0]}” or “${suggestions[1]}”.`,
      metrics: [],
      people: [],
      sources: [],
      confident: false,
    };
  }

  candidates.sort((a, b) => b.score - a.score);
  return candidates[0].intent.run({
    actor,
    question,
    today: org.today,
    department,
  });
}

/** Live snapshot appended to every answer so the reply always has context. */
export async function assistantContext() {
  const live = await getLiveWorkforce();
  return {
    workDate: live.workDate,
    present: live.present,
    expected: live.expected,
    onLeave: live.onLeave,
    workingNow: live.workingNow,
  };
}
