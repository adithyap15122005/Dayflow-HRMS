import type { Metadata } from "next";
import {
  Building2,
  CalendarDays,
  Clock,
  Info,
  ShieldCheck,
  Settings as SettingsIcon,
  Users,
} from "lucide-react";

import {
  AnnouncementForm,
  WorkPolicyForm,
} from "@/components/settings/settings-forms";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader, DetailList } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page";
import { EmptyState } from "@/components/ui/states";
import {
  Table,
  TableScroll,
  TBody,
  TD,
  TH,
  THead,
  TR,
} from "@/components/ui/table";
import { requireActor } from "@/lib/auth/guard";
import { prisma } from "@/lib/db";
import { isManagement } from "@/lib/domain/constants";
import { addWorkDays, formatWorkDate } from "@/lib/domain/time";
import { hours, roleLabel } from "@/lib/format";
import { getHolidays, getOrgContext } from "@/lib/services/org";
import { listDepartments } from "@/lib/services/people";
import { listLeaveTypes } from "@/lib/services/leave";
import { PASSWORD_RULES } from "@/lib/auth/password-policy";

export const metadata: Metadata = {
  title: "Settings",
  description: "Work policy, leave types, holidays and account security.",
};

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const { user } = await requireActor();
  const org = await getOrgContext();
  const management = isManagement(user.role);

  const [leaveTypes, holidays, departments, sessionHours] = await Promise.all([
    listLeaveTypes(),
    getHolidays(`${org.today.slice(0, 4)}-01-01`, `${org.today.slice(0, 4)}-12-31`),
    management ? listDepartments() : Promise.resolve([]),
    Promise.resolve(Number(process.env.SESSION_TTL_HOURS ?? 12)),
  ]);

  const employeeRow = user.employeeId
    ? await prisma.employee.findUnique({
        where: { id: user.employeeId },
        select: { shiftStart: true, shiftEnd: true, weeklyOffCsv: true, location: true },
      })
    : null;

  const upcomingHolidays = holidays.filter((h) => h.date >= org.today).slice(0, 6);

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow={
          <>
            <SettingsIcon className="size-3.5" />
            {org.companyName} · {org.timezone.replace("_", " ")}
          </>
        }
        title="Settings"
        description={
          management
            ? "Organisation policy, leave entitlements and the holiday calendar. Changes here immediately affect how attendance is classified and how payroll pro-rates."
            : "Your working pattern, the organisation's leave policy, and the holiday calendar."
        }
      />

      {management ? (
        <div className="grid gap-5 xl:grid-cols-2">
          <WorkPolicyForm
            initial={{
              standardWorkMinutes: org.policy.standardWorkMinutes,
              halfDayMinutes: org.policy.halfDayMinutes,
              lateGraceMinutes: org.policy.lateGraceMinutes,
              payrollDayOfMonth: org.payrollDayOfMonth,
              timezone: org.timezone,
            }}
            canEdit={user.role === "ADMIN"}
          />
          <AnnouncementForm departments={departments} />
        </div>
      ) : null}

      <div className="grid gap-5 xl:grid-cols-3">
        <Card>
          <CardHeader
            icon={<ShieldCheck className="size-4" />}
            title="Your account"
            subtitle="Session and access details."
          />
          <CardBody>
            <DetailList
              columns={1}
              items={[
                { label: "Name", value: user.fullName },
                { label: "Sign-in email", value: user.email },
                {
                  label: "Role",
                  value: (
                    <Badge tone={user.role === "EMPLOYEE" ? "neutral" : "brand"} size="sm">
                      {roleLabel(user.role)}
                    </Badge>
                  ),
                },
                { label: "Employee ID", value: user.employeeCode ?? "—" },
                {
                  label: "Email verified",
                  value: user.emailVerified ? "Yes" : "No — verification required",
                },
                {
                  label: "Session length",
                  value: `${sessionHours} hours, then re-authentication is required`,
                },
              ]}
            />
            <div className="mt-4 rounded-lg border border-info/20 bg-info-soft px-3 py-2.5">
              <p className="flex items-center gap-1.5 text-[0.75rem] font-semibold text-info-ink">
                <Info className="size-3.5" />
                Password requirements
              </p>
              <ul className="mt-1 list-inside list-disc text-[0.75rem] text-info-ink/85">
                {PASSWORD_RULES.map((rule) => (
                  <li key={rule}>{rule}</li>
                ))}
              </ul>
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            icon={<Clock className="size-4" />}
            title="Your working pattern"
            subtitle="Set by HR on your employee record."
          />
          <CardBody>
            {employeeRow ? (
              <DetailList
                columns={1}
                items={[
                  {
                    label: "Shift",
                    value: `${employeeRow.shiftStart} – ${employeeRow.shiftEnd}`,
                  },
                  {
                    label: "Weekly off",
                    value: employeeRow.weeklyOffCsv
                      .split(",")
                      .map(
                        (d) =>
                          ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][
                            Number(d)
                          ],
                      )
                      .filter(Boolean)
                      .join(", "),
                  },
                  { label: "Location", value: employeeRow.location },
                  {
                    label: "Full working day",
                    value: `${hours(org.policy.standardWorkMinutes)} (half day from ${hours(org.policy.halfDayMinutes)})`,
                  },
                  {
                    label: "Late after",
                    value: `${org.policy.lateGraceMinutes} minutes past your shift start`,
                  },
                ]}
              />
            ) : (
              <EmptyState
                title="No employee record"
                description="Your login is not linked to an employee profile yet."
                compact
              />
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            icon={<CalendarDays className="size-4" />}
            title="Upcoming holidays"
            subtitle={`${holidays.length} in ${org.today.slice(0, 4)}. Holidays never count as absence.`}
          />
          <CardBody>
            {upcomingHolidays.length > 0 ? (
              <ul className="space-y-2.5">
                {upcomingHolidays.map((holiday) => (
                  <li key={holiday.id} className="flex items-baseline justify-between gap-3">
                    <span className="text-[0.8125rem] font-medium text-ink">{holiday.name}</span>
                    <span className="shrink-0 text-[0.75rem] text-ink-3">
                      {formatWorkDate(holiday.date, "weekday")}
                      {holiday.date === org.today ? " · today" : ""}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-[0.8125rem] text-ink-3">
                No more holidays this year. The next calendar year is already seeded.
              </p>
            )}
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardHeader
          icon={<CalendarDays className="size-4" />}
          title="Leave types"
          subtitle="Default annual entitlement per type. Individual entitlements can differ and are pro-rated for mid-year joiners."
        />
        <TableScroll>
          <Table>
            <THead>
              <TH width="24%">Type</TH>
              <TH width="16%">Code</TH>
              <TH width="16%" align="right">
                Annual days
              </TH>
              <TH width="16%">Paid</TH>
              <TH width="28%">Reason required</TH>
            </THead>
            <TBody>
              {leaveTypes.map((type) => (
                <TR key={type.id} interactive>
                  <TD>
                    <span className="font-medium text-ink">{type.name}</span>
                  </TD>
                  <TD>
                    <span className="font-mono text-[0.75rem] text-ink-3">{type.code}</span>
                  </TD>
                  <TD align="right">
                    {type.defaultAnnualDays > 0 ? type.defaultAnnualDays : "Uncapped"}
                  </TD>
                  <TD>
                    <Badge tone={type.isPaid ? "success" : "neutral"} size="sm">
                      {type.isPaid ? "Paid" : "Unpaid"}
                    </Badge>
                  </TD>
                  <TD>{type.requiresReason ? "Yes — at least 10 characters" : "Optional"}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </TableScroll>
      </Card>

      {management ? (
        <div className="grid gap-5 xl:grid-cols-2">
          <Card>
            <CardHeader
              icon={<Building2 className="size-4" />}
              title={`Departments · ${departments.length}`}
              subtitle="Used for filtering, reports and departmental cost analysis."
            />
            <CardBody>
              <ul className="grid gap-2 sm:grid-cols-2">
                {departments.map((department) => (
                  <li
                    key={department.id}
                    className="flex items-center justify-between gap-3 rounded-lg border border-line bg-surface-2 px-3 py-2.5"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-[0.8125rem] font-medium text-ink">
                        {department.name}
                      </span>
                      <span className="block font-mono text-[0.6875rem] text-ink-3">
                        {department.code}
                      </span>
                    </span>
                    <span className="flex shrink-0 items-center gap-1 text-[0.8125rem] text-ink-2">
                      <Users className="size-3.5 text-ink-4" />
                      {department.headcount}
                    </span>
                  </li>
                ))}
              </ul>
            </CardBody>
          </Card>

          <Card>
            <CardHeader
              icon={<CalendarDays className="size-4" />}
              title="Holiday calendar"
              subtitle={`${org.today.slice(0, 4)} · seeded for the previous, current and next year.`}
            />
            <CardBody>
              <ul className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
                {holidays.map((holiday) => (
                  <li
                    key={holiday.id}
                    className="flex items-baseline justify-between gap-3 border-b border-line pb-1.5 text-[0.8125rem]"
                  >
                    <span
                      className={
                        holiday.date < org.today ? "text-ink-4" : "font-medium text-ink"
                      }
                    >
                      {holiday.name}
                    </span>
                    <span className="shrink-0 text-[0.75rem] text-ink-3">
                      {formatWorkDate(holiday.date, "weekday")}
                    </span>
                  </li>
                ))}
              </ul>
              <p className="mt-3 text-[0.75rem] text-ink-3">
                Next holiday after today:{" "}
                {upcomingHolidays[0]
                  ? `${upcomingHolidays[0].name} on ${formatWorkDate(upcomingHolidays[0].date, "long")}`
                  : `none — the calendar resumes on ${formatWorkDate(addWorkDays(`${Number(org.today.slice(0, 4)) + 1}-01-01`, 0), "long")}`}
              </p>
            </CardBody>
          </Card>
        </div>
      ) : null}
    </div>
  );
}
