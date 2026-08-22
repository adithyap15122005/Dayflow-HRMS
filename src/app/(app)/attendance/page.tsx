import type { Metadata } from "next";
import Link from "next/link";
import {
  CalendarDays,
  ChartColumn,
  CircleCheck,
  Clock,
  TriangleAlert,
  Users,
} from "lucide-react";

import { AttendanceTrendChart } from "@/components/charts";
import { AttendanceFilters } from "@/components/attendance/attendance-filters";
import {
  AttendanceCalendar,
  AttendanceTimeline,
} from "@/components/attendance/attendance-views";
import { OrgAttendanceTable } from "@/components/attendance/org-attendance-table";
import { TodayPanel } from "@/components/attendance/today-panel";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page";
import { SegmentedLinks } from "@/components/ui/tabs";
import { Stat, StatRow } from "@/components/ui/stat";
import { EmptyState } from "@/components/ui/states";
import { getCurrentUser, requireActor } from "@/lib/auth/guard";
import { isManagement } from "@/lib/domain/constants";
import {
  endOfMonth,
  endOfWeek,
  formatPeriod,
  formatWorkDate,
  isWorkDate,
  periodOf,
  startOfMonth,
  startOfWeek,
} from "@/lib/domain/time";
import { hours, percent } from "@/lib/format";
import {
  findUnclosedRecords,
  getAttendanceSeries,
  getAttendanceTrend,
  getOrgDay,
  getTodayState,
  summariseAttendance,
} from "@/lib/services/attendance";
import { getOrgContext } from "@/lib/services/org";
import { listDepartments } from "@/lib/services/people";
import type { AttendanceStatus } from "@/lib/domain/constants";

export async function generateMetadata(): Promise<Metadata> {
  const user = await getCurrentUser();
  return user && isManagement(user.role)
    ? {
        title: "Attendance",
        description: "Organisation-wide presence, trends and record corrections.",
      }
    : {
        title: "My attendance",
        description: "Check in and out, and review your own attendance history.",
      };
}

export const dynamic = "force-dynamic";

type SearchParams = Promise<{
  date?: string;
  departmentId?: string;
  status?: string;
  range?: string;
  filter?: string;
}>;

export default async function AttendancePage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const { user, actor } = await requireActor();
  const query = await searchParams;
  const org = await getOrgContext();

  return isManagement(user.role) ? (
    <OrgAttendance query={query} org={org} />
  ) : (
    <MyAttendance query={query} org={org} employeeId={actor.employeeId} firstName={user.firstName} />
  );
}

/* ============================================================== employee */

async function MyAttendance({
  query,
  org,
  employeeId,
  firstName,
}: {
  query: Awaited<SearchParams>;
  org: Awaited<ReturnType<typeof getOrgContext>>;
  employeeId: string | null;
  firstName: string;
}) {
  if (!employeeId) {
    return (
      <EmptyState
        icon={<Clock className="size-5" />}
        title="No employee record"
        description="Your account is not linked to an employee profile, so there is no attendance to show."
      />
    );
  }

  const range = query.range === "week" ? "week" : "month";
  const anchor = isWorkDate(query.date) ? query.date : org.today;
  const from = range === "week" ? startOfWeek(anchor) : startOfMonth(anchor);
  const to = range === "week" ? endOfWeek(anchor) : endOfMonth(anchor);

  const [today, days] = await Promise.all([
    getTodayState(employeeId, org),
    getAttendanceSeries(employeeId, from, to, org),
  ]);
  const totals = summariseAttendance(days.filter((d) => d.workDate <= org.today));

  const hrefFor = (id: string) =>
    `/attendance?range=${id}${query.date ? `&date=${query.date}` : ""}`;

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow={
          <>
            <Clock className="size-3.5" />
            {formatWorkDate(org.today, "long")}
          </>
        }
        title="My attendance"
        description="Check in and out, and see exactly how your month is tracking. Weekly offs and public holidays are never counted against you."
        actions={
          <SegmentedLinks
            label="Range"
            active={range}
            hrefFor={hrefFor}
            options={[
              { id: "week", label: "This week" },
              { id: "month", label: "This month" },
            ]}
          />
        }
      />

      <TodayPanel initial={today} timezone={org.timezone} firstName={firstName} />

      <StatRow columns={5}>
        <Stat
          label="Present"
          value={totals.present}
          caption="Full days recorded"
          tone="success"
          icon={<CircleCheck className="size-4" />}
        />
        <Stat label="Half days" value={totals.halfDay} caption="Under the full-day threshold" tone="warning" />
        <Stat label="On leave" value={totals.leave} caption="Approved leave days" tone="info" />
        <Stat label="Absent" value={totals.absent} caption="No record and no approved leave" tone="danger" />
        <Stat
          label="Hours logged"
          value={(totals.workedMinutes / 60).toFixed(1)}
          caption={`Average ${hours(totals.avgWorkedMinutes)} per worked day`}
          tone="brand"
          emphasis
        />
      </StatRow>

      <div className="grid gap-5 xl:grid-cols-2">
        <Card>
          <CardHeader
            icon={<CalendarDays className="size-4" />}
            title={range === "week" ? "This week" : formatPeriod(periodOf(anchor))}
            subtitle={`Attendance rate ${percent(totals.attendanceRatePct, 1)} across ${totals.expectedWorkingDays} expected working days.`}
          />
          <AttendanceCalendar
            days={days}
            timezone={org.timezone}
            today={org.today}
            monthLabel={
              range === "week"
                ? `${formatWorkDate(from, "short")} – ${formatWorkDate(to)}`
                : formatPeriod(periodOf(anchor))
            }
          />
        </Card>

        <Card>
          <CardHeader
            icon={<Clock className="size-4" />}
            title="Day by day"
            subtitle="Exact check-in and check-out times, newest first."
          />
          <AttendanceTimeline days={days} timezone={org.timezone} today={org.today} />
        </Card>
      </div>
    </div>
  );
}

/* ============================================================ management */

async function OrgAttendance({
  query,
  org,
}: {
  query: Awaited<SearchParams>;
  org: Awaited<ReturnType<typeof getOrgContext>>;
}) {
  const workDate = isWorkDate(query.date) && query.date <= org.today ? query.date : org.today;
  const status = query.status as AttendanceStatus | undefined;

  const [rows, departments, trend, unclosed] = await Promise.all([
    getOrgDay(workDate, { departmentId: query.departmentId, status }, org),
    listDepartments(),
    getAttendanceTrend(30, { departmentId: query.departmentId }, org),
    findUnclosedRecords(12, org),
  ]);

  const showingUnclosed = query.filter === "unclosed";
  const present = rows.filter((r) => ["PRESENT", "HALF_DAY"].includes(r.status)).length;
  const expected = rows.filter((r) => !["WEEK_OFF", "HOLIDAY"].includes(r.status)).length;
  const working = rows.filter((r) => r.checkInAt && !r.checkOutAt).length;
  const late = rows.filter((r) => r.lateMinutes > 0).length;
  const absent = rows.filter((r) => r.status === "ABSENT").length;

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow={
          <>
            <Users className="size-3.5" />
            {workDate === org.today ? "Live · today" : "Historical view"} ·{" "}
            {formatWorkDate(workDate, "long")}
          </>
        }
        title="Attendance"
        description="One board for the whole organisation. Days without a stored record are derived from the calendar — week off, holiday, approved leave, or absent — and can be corrected in place."
        actions={
          unclosed.length > 0 ? (
            <Link
              href={showingUnclosed ? "/attendance" : "/attendance?filter=unclosed"}
              className="inline-flex h-8 items-center gap-1.5 rounded-md border border-warning/30 bg-warning-soft px-3 text-[0.8125rem] font-medium text-warning-ink transition-colors hover:brightness-97"
            >
              <TriangleAlert className="size-3.5" />
              {showingUnclosed ? "Show all records" : `${unclosed.length} unclosed`}
            </Link>
          ) : null
        }
      />

      <StatRow columns={5}>
        <Stat
          label="Present"
          value={`${present}/${expected}`}
          caption={`${percent(expected ? (present / expected) * 100 : 0)} of expected staff`}
          tone={expected === 0 ? "neutral" : present / expected >= 0.85 ? "success" : "warning"}
          emphasis
        />
        <Stat label="Working now" value={working} caption="Checked in, day still open" tone="brand" />
        <Stat
          label="On leave"
          value={rows.filter((r) => r.status === "LEAVE").length}
          caption="Approved leave covering this date"
          tone="info"
        />
        <Stat
          label="Late arrivals"
          value={late}
          caption="After each person's own shift start"
          tone={late > 0 ? "warning" : "neutral"}
        />
        <Stat
          label="Absent"
          value={absent}
          caption="No record and no approved leave"
          tone={absent > 0 ? "danger" : "success"}
        />
      </StatRow>

      {showingUnclosed ? (
        <Card>
          <CardHeader
            icon={<TriangleAlert className="size-4" />}
            title={`Unclosed attendance · ${unclosed.length}`}
            subtitle="Checked in on a past day with no check-out, so hours cannot be computed. Open the employee's record to correct the day."
          />
          {unclosed.length > 0 ? (
            <ul className="divide-y divide-line">
              {unclosed.map((row) => (
                <li key={`${row.employeeId}-${row.workDate}`}>
                  <Link
                    href={`/attendance?date=${row.workDate}`}
                    className="flex flex-wrap items-center gap-3 px-4 py-3 transition-colors hover:bg-surface-2 sm:px-5"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[0.875rem] font-medium text-ink">
                        {row.name}
                      </span>
                      <span className="block text-[0.75rem] text-ink-3">
                        {formatWorkDate(row.workDate, "long")} · checked in, never closed
                      </span>
                    </span>
                    <Badge tone="warning" size="sm">
                      Needs correction
                    </Badge>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState
              title="Nothing unclosed"
              description="Every past check-in has a matching check-out."
              compact
            />
          )}
        </Card>
      ) : null}

      <Card>
        <CardHeader
          icon={<ChartColumn className="size-4" />}
          title="Attendance over the last 30 days"
          subtitle={
            query.departmentId
              ? `Filtered to ${departments.find((d) => d.id === query.departmentId)?.name ?? "a department"}.`
              : "Is attendance improving, and which days went wrong?"
          }
        />
        <CardBody className="pt-2">
          <AttendanceTrendChart data={trend} height={230} />
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          icon={<Users className="size-4" />}
          title={`Board for ${formatWorkDate(workDate)}`}
          subtitle="Select a date, filter by team or status, and correct any record."
        />
        <AttendanceFilters
          departments={departments}
          today={org.today}
          workDate={workDate}
          count={rows.length}
        />
        <OrgAttendanceTable
          rows={rows}
          workDate={workDate}
          timezone={org.timezone}
          canAdjust
        />
      </Card>
    </div>
  );
}
