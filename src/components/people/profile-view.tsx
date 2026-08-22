import Link from "next/link";
import {
  Activity as ActivityIcon,
  ArrowLeft,
  BadgeCheck,
  Briefcase,
  CalendarDays,
  Clock,
  FileText,
  IdCard,
  Mail,
  Phone,
  ShieldCheck,
  UserRound,
  Wallet,
} from "lucide-react";

import { AttendanceCalendar, AttendanceTimeline } from "@/components/attendance/attendance-views";
import { ActivityFeed, type ActivityItem } from "@/components/overview/activity-feed";
import { EditProfileDialog } from "@/components/people/edit-profile-dialog";
import { SalaryEditor } from "@/components/payroll/salary-editor";
import { PayslipList } from "@/components/payroll/payslip-list";
import { Avatar, PersonCell } from "@/components/ui/avatar";
import { Badge, CodeChip } from "@/components/ui/badge";
import { Card, CardBody, CardHeader, DetailList } from "@/components/ui/card";
import { Meter, Stat, StatRow } from "@/components/ui/stat";
import { EmptyState, InlineWarning } from "@/components/ui/states";
import { Tabs, type TabDef } from "@/components/ui/tabs";
import { formatWorkDate, formatWorkDateRange } from "@/lib/domain/time";
import {
  days,
  EMPLOYEE_TONE,
  employeeStatusLabel,
  employmentTypeLabel,
  fileSize,
  hours,
  LEAVE_TONE,
  leaveLabel,
  money,
  percent,
  roleLabel,
} from "@/lib/format";
import { DOCUMENT_CATEGORY_LABEL } from "@/lib/domain/constants";
import type {
  DocumentCategory,
  EmployeeStatus,
  LeaveStatus,
} from "@/lib/domain/constants";
import type { AttendanceTotals } from "@/lib/services/attendance";
import type { LeaveBalanceRow, LeaveListItem } from "@/lib/services/leave";
import type { EmployeeProfile } from "@/lib/services/people";
import type { PayslipView, SalaryView } from "@/lib/services/payroll";
import type { AttendanceDayView } from "@/components/attendance/attendance-views";

export const PROFILE_TABS: TabDef[] = [
  { id: "overview", label: "Overview", icon: <UserRound className="size-3.5" /> },
  { id: "personal", label: "Personal", icon: <IdCard className="size-3.5" /> },
  { id: "employment", label: "Employment", icon: <Briefcase className="size-3.5" /> },
  { id: "attendance", label: "Attendance", icon: <Clock className="size-3.5" /> },
  { id: "leave", label: "Leave", icon: <CalendarDays className="size-3.5" /> },
  { id: "payroll", label: "Payroll", icon: <Wallet className="size-3.5" /> },
  { id: "documents", label: "Documents", icon: <FileText className="size-3.5" /> },
  { id: "activity", label: "Activity", icon: <ActivityIcon className="size-3.5" /> },
];

export type ProfileTabData = {
  attendance?: {
    days: AttendanceDayView[];
    totals: AttendanceTotals;
    monthLabel: string;
  };
  balances?: LeaveBalanceRow[];
  leave?: LeaveListItem[];
  payslips?: PayslipView[];
  salary?: SalaryView | null;
  activity?: ActivityItem[];
};

/**
 * The employee record.
 *
 * One page, tabbed, with every sensitive section gated by the same rules the API
 * uses: `profile.canSeeSalary` and `profile.editableFields` come from the server,
 * so the UI physically cannot present data or an action the viewer is not entitled
 * to.
 */
export function ProfileView({
  profile,
  tab,
  data,
  timezone,
  today,
  departments,
  managers,
  backHref,
  isSelfView,
}: {
  profile: EmployeeProfile;
  tab: string;
  data: ProfileTabData;
  timezone: string;
  today: string;
  departments: { id: string; name: string }[];
  managers: { id: string; name: string; jobTitle: string }[];
  backHref: string | null;
  isSelfView: boolean;
}) {
  const hrefFor = (id: string) =>
    `${isSelfView ? "/profile" : `/people/${profile.id}`}?tab=${id}`;

  const tabs = PROFILE_TABS.map((t) =>
    t.id === "documents" ? { ...t, count: profile.documents.length } : t,
  ).filter((t) => (t.id === "payroll" ? profile.canSeeSalary : true));

  return (
    <div className="space-y-5">
      {backHref ? (
        <Link
          href={backHref}
          className="inline-flex items-center gap-1.5 text-[0.8125rem] font-medium text-ink-3 transition-colors hover:text-brand"
        >
          <ArrowLeft className="size-3.5" />
          Back to directory
        </Link>
      ) : null}

      {/* ------------------------------------------------------- header */}
      <Card className="overflow-hidden">
        <div className="relative border-b border-line bg-sidebar px-4 pt-5 pb-14 sm:px-6">
          <div
            aria-hidden
            className="pointer-events-none absolute -top-24 -right-16 size-72 rounded-full bg-brand/25 blur-3xl"
          />
          <div className="relative flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[0.75rem] text-white/55">
                {profile.department?.name ?? "Unassigned"} · {profile.location}
              </p>
              <h1 className="mt-1 text-xl font-semibold text-white sm:text-[1.375rem]">
                {profile.fullName}
              </h1>
              <p className="mt-0.5 text-[0.875rem] text-white/70">{profile.jobTitle}</p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {profile.editableFields.length > 0 ? (
                <EditProfileDialog
                  profile={{
                    id: profile.id,
                    firstName: profile.firstName,
                    lastName: profile.lastName,
                    workEmail: profile.workEmail,
                    personalEmail: profile.personalEmail,
                    phone: profile.phone,
                    address: profile.address,
                    city: profile.city,
                    country: profile.country,
                    dateOfBirth: profile.dateOfBirth,
                    gender: profile.gender,
                    avatarColor: profile.avatarColor,
                    jobTitle: profile.jobTitle,
                    employmentType: profile.employmentType,
                    status: profile.status,
                    location: profile.location,
                    shiftStart: profile.shiftStart,
                    shiftEnd: profile.shiftEnd,
                    emergencyContactName: profile.emergencyContactName,
                    emergencyContactPhone: profile.emergencyContactPhone,
                    department: profile.department,
                    manager: profile.manager ? { id: profile.manager.id } : null,
                    editableFields: profile.editableFields,
                  }}
                  departments={departments}
                  managers={managers}
                  label={isSelfView ? "Edit my details" : "Edit record"}
                />
              ) : null}
            </div>
          </div>
        </div>

        <div className="relative -mt-10 px-4 sm:px-6">
          <Avatar
            name={profile.fullName}
            tone={profile.avatarColor}
            size="2xl"
            className="ring-4 ring-surface"
          />
        </div>

        <CardBody className="pt-3">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={EMPLOYEE_TONE[profile.status as EmployeeStatus]} dot>
              {employeeStatusLabel(profile.status)}
            </Badge>
            <Badge tone="neutral">{employmentTypeLabel(profile.employmentType)}</Badge>
            <Badge tone={profile.role === "EMPLOYEE" ? "neutral" : "brand"}>
              <ShieldCheck className="size-3" />
              {roleLabel(profile.role)}
            </Badge>
            <CodeChip>{profile.employeeCode}</CodeChip>
            {profile.emailVerified ? (
              <Badge tone="success" size="sm">
                <BadgeCheck className="size-3" />
                Email verified
              </Badge>
            ) : (
              <Badge tone="warning" size="sm">
                Email unverified
              </Badge>
            )}
          </div>

          <dl className="mt-4 grid gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-4">
            <ProfileFact
              icon={<Mail className="size-3.5" />}
              label="Work email"
              value={profile.workEmail}
            />
            <ProfileFact
              icon={<Phone className="size-3.5" />}
              label="Phone"
              value={profile.phone ?? "Not provided"}
            />
            <ProfileFact
              icon={<CalendarDays className="size-3.5" />}
              label="Joined"
              value={`${formatWorkDate(profile.joinedAt)} · ${tenureLabel(profile.tenureMonths)}`}
            />
            <ProfileFact
              icon={<Clock className="size-3.5" />}
              label="Shift"
              value={`${profile.shiftStart} – ${profile.shiftEnd}`}
            />
          </dl>
        </CardBody>

        <Tabs tabs={tabs} active={tab} hrefFor={hrefFor} />
      </Card>

      {/* ------------------------------------------------------ panels */}
      {tab === "overview" ? (
        <OverviewPanel profile={profile} data={data} timezone={timezone} />
      ) : null}
      {tab === "personal" ? <PersonalPanel profile={profile} /> : null}
      {tab === "employment" ? <EmploymentPanel profile={profile} /> : null}
      {tab === "attendance" ? (
        <AttendancePanel data={data} timezone={timezone} today={today} />
      ) : null}
      {tab === "leave" ? <LeavePanel data={data} /> : null}
      {tab === "payroll" ? (
        <PayrollPanel profile={profile} data={data} today={today} />
      ) : null}
      {tab === "documents" ? <DocumentsPanel profile={profile} /> : null}
      {tab === "activity" ? (
        <Card>
          <CardHeader
            icon={<ActivityIcon className="size-4" />}
            title="Activity trail"
            subtitle="Every recorded action on this employee, newest first."
          />
          <ActivityFeed items={data.activity ?? []} />
        </Card>
      ) : null}
    </div>
  );
}

function tenureLabel(months: number): string {
  if (months < 1) return "joined this month";
  if (months < 12) return `${months} month${months > 1 ? "s" : ""}`;
  const years = Math.floor(months / 12);
  const rest = months % 12;
  return rest === 0
    ? `${years} year${years > 1 ? "s" : ""}`
    : `${years}y ${rest}m`;
}

function ProfileFact({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="min-w-0">
      <dt className="flex items-center gap-1.5 text-[0.6875rem] font-semibold tracking-wider text-ink-4 uppercase">
        {icon}
        {label}
      </dt>
      <dd className="mt-1 truncate text-[0.8125rem] text-ink">{value}</dd>
    </div>
  );
}

/* ============================================================== panels */

function OverviewPanel({
  profile,
  data,
  timezone,
}: {
  profile: EmployeeProfile;
  data: ProfileTabData;
  timezone: string;
}) {
  const totals = data.attendance?.totals;
  const capped = (data.balances ?? []).filter((b) => b.cap !== null);
  const recentLeave = (data.leave ?? []).slice(0, 4);

  return (
    <div className="space-y-5">
      {totals ? (
        <StatRow columns={4}>
          <Stat
            label="Hours this month"
            value={(totals.workedMinutes / 60).toFixed(1)}
            caption={`${totals.present} present · ${totals.halfDay} half · ${totals.absent} absent`}
            icon={<Clock className="size-4" />}
            tone="brand"
            emphasis
          />
          <Stat
            label="Attendance rate"
            value={percent(totals.attendanceRatePct, 1)}
            caption={`Over ${totals.expectedWorkingDays} expected working days`}
            tone={totals.attendanceRatePct >= 90 ? "success" : "warning"}
          />
          <Stat
            label="Average day"
            value={hours(totals.avgWorkedMinutes)}
            caption="Across days actually worked"
          />
          <Stat
            label="Late arrivals"
            value={totals.lateDays}
            caption="Against this employee's own shift start"
            tone={totals.lateDays > 2 ? "warning" : "success"}
          />
        </StatRow>
      ) : null}

      <div className="grid gap-5 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader
            icon={<Clock className="size-4" />}
            title={`Attendance — ${data.attendance?.monthLabel ?? "this month"}`}
            subtitle="Colour is the recorded status; the dot marks a late arrival."
          />
          {data.attendance ? (
            <AttendanceCalendar
              days={data.attendance.days}
              timezone={timezone}
              today={data.attendance.days[data.attendance.days.length - 1]?.workDate ?? ""}
              monthLabel={data.attendance.monthLabel}
            />
          ) : null}
        </Card>

        <Card>
          <CardHeader
            icon={<CalendarDays className="size-4" />}
            title="Leave balances"
            subtitle="Approved plus pending, against entitlement."
          />
          <CardBody className="space-y-4">
            {capped.length > 0 ? (
              capped.map((balance) => (
                <div key={balance.leaveTypeId}>
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="text-[0.8125rem] font-medium text-ink">{balance.name}</p>
                    <p className="text-[0.8125rem] text-ink-2">
                      <span className="font-semibold text-ink">{balance.remainingDays}</span>
                      <span className="text-ink-3"> / {balance.cap}</span>
                    </p>
                  </div>
                  <Meter
                    className="mt-2"
                    value={balance.usedDays + balance.pendingDays}
                    max={balance.cap ?? 1}
                    tone={(balance.remainingDays ?? 0) <= 2 ? "warning" : "brand"}
                    label={balance.name}
                  />
                </div>
              ))
            ) : (
              <p className="text-[0.8125rem] text-ink-3">
                No capped leave types configured.
              </p>
            )}
          </CardBody>
        </Card>
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        <Card>
          <CardHeader
            icon={<CalendarDays className="size-4" />}
            title="Recent leave"
            subtitle="Latest requests and their outcome."
          />
          {recentLeave.length > 0 ? (
            <ul className="divide-y divide-line">
              {recentLeave.map((request) => (
                <li key={request.id} className="flex items-start justify-between gap-3 px-4 py-3 sm:px-5">
                  <div className="min-w-0">
                    <p className="text-[0.8125rem] font-medium text-ink">
                      {request.leaveType}
                      <span className="ml-2 font-normal text-ink-3">
                        {formatWorkDateRange(request.startDate, request.endDate)}
                      </span>
                    </p>
                    <p className="mt-0.5 text-[0.75rem] text-ink-3">
                      {days(request.workingDays)}
                      {request.decidedByName ? ` · decided by ${request.decidedByName}` : ""}
                    </p>
                  </div>
                  <Badge tone={LEAVE_TONE[request.status]} size="sm" dot>
                    {leaveLabel(request.status)}
                  </Badge>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState
              title="No leave on record"
              description="Requests appear here as soon as they are submitted."
              compact
            />
          )}
        </Card>

        <Card>
          <CardHeader
            icon={<ActivityIcon className="size-4" />}
            title="Recent activity"
            subtitle="From the audit trail."
          />
          <ActivityFeed items={(data.activity ?? []).slice(0, 6)} />
        </Card>
      </div>

      {profile.reports.length > 0 ? (
        <Card>
          <CardHeader
            icon={<UserRound className="size-4" />}
            title={`Direct reports · ${profile.reports.length}`}
            subtitle="People who report to this employee."
          />
          <CardBody>
            <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {profile.reports.map((report) => (
                <li key={report.id}>
                  <Link
                    href={`/people/${report.id}`}
                    className="flex items-center gap-2.5 rounded-lg border border-line bg-surface-2 p-2.5 transition-colors hover:border-brand hover:bg-brand-soft"
                  >
                    <PersonCell
                      name={report.fullName}
                      meta={report.jobTitle}
                      tone={report.avatarColor}
                      size="sm"
                    />
                  </Link>
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
      ) : null}
    </div>
  );
}

function PersonalPanel({ profile }: { profile: EmployeeProfile }) {
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <Card>
        <CardHeader
          icon={<IdCard className="size-4" />}
          title="Personal details"
          subtitle="Visible to the employee and to HR only."
        />
        <CardBody>
          <DetailList
            columns={2}
            items={[
              { label: "Full name", value: profile.fullName },
              { label: "Date of birth", value: profile.dateOfBirth ? formatWorkDate(profile.dateOfBirth) : "—" },
              { label: "Gender", value: profile.gender ?? "—" },
              { label: "Personal email", value: profile.personalEmail ?? "—" },
              { label: "Phone", value: profile.phone ?? "—" },
              { label: "City", value: profile.city ?? "—" },
              { label: "Country", value: profile.country ?? "—" },
              { label: "Address", value: profile.address ?? "—", span: true },
            ]}
          />
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          icon={<Phone className="size-4" />}
          title="Emergency contact"
          subtitle="Used only in a genuine emergency."
        />
        <CardBody>
          {profile.emergencyContactName || profile.emergencyContactPhone ? (
            <DetailList
              columns={1}
              items={[
                { label: "Name", value: profile.emergencyContactName ?? "—" },
                { label: "Phone", value: profile.emergencyContactPhone ?? "—" },
              ]}
            />
          ) : (
            <EmptyState
              title="No emergency contact"
              description="Add a name and number so HR can reach someone if it is ever needed."
              compact
            />
          )}
        </CardBody>
      </Card>
    </div>
  );
}

function EmploymentPanel({ profile }: { profile: EmployeeProfile }) {
  return (
    <div className="grid gap-5 lg:grid-cols-3">
      <Card className="lg:col-span-2">
        <CardHeader
          icon={<Briefcase className="size-4" />}
          title="Employment"
          subtitle="Maintained by HR. Every change is written to the audit trail."
        />
        <CardBody>
          <DetailList
            columns={2}
            items={[
              { label: "Employee ID", value: <CodeChip>{profile.employeeCode}</CodeChip> },
              { label: "Job title", value: profile.jobTitle },
              { label: "Department", value: profile.department?.name ?? "Unassigned" },
              { label: "Employment type", value: employmentTypeLabel(profile.employmentType) },
              {
                label: "Status",
                value: (
                  <Badge tone={EMPLOYEE_TONE[profile.status as EmployeeStatus]} size="sm" dot>
                    {employeeStatusLabel(profile.status)}
                  </Badge>
                ),
              },
              { label: "Account role", value: roleLabel(profile.role) },
              { label: "Joined", value: formatWorkDate(profile.joinedAt, "long") },
              { label: "Tenure", value: tenureLabel(profile.tenureMonths) },
              { label: "Work location", value: profile.location },
              { label: "Shift", value: `${profile.shiftStart} – ${profile.shiftEnd}` },
              {
                label: "Weekly off",
                value: profile.weeklyOffCsv
                  .split(",")
                  .map((d) => ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][Number(d)])
                  .filter(Boolean)
                  .join(", "),
              },
              {
                label: "Last sign-in",
                value: profile.lastLoginAt
                  ? new Date(profile.lastLoginAt).toLocaleString("en-GB")
                  : "Never",
              },
            ]}
          />
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          icon={<UserRound className="size-4" />}
          title="Reporting line"
          subtitle="Who approves and who reports in."
        />
        <CardBody className="space-y-4">
          <div>
            <p className="text-[0.6875rem] font-semibold tracking-wider text-ink-4 uppercase">
              Reports to
            </p>
            {profile.manager ? (
              <Link
                href={`/people/${profile.manager.id}`}
                className="mt-2 flex items-center gap-2.5 rounded-lg border border-line bg-surface-2 p-2.5 transition-colors hover:border-brand hover:bg-brand-soft"
              >
                <PersonCell
                  name={profile.manager.fullName}
                  meta={profile.manager.jobTitle}
                  tone={profile.manager.avatarColor}
                  size="sm"
                />
              </Link>
            ) : (
              <p className="mt-1.5 text-[0.8125rem] text-ink-3">No manager assigned.</p>
            )}
          </div>

          <div>
            <p className="text-[0.6875rem] font-semibold tracking-wider text-ink-4 uppercase">
              Direct reports · {profile.reports.length}
            </p>
            {profile.reports.length > 0 ? (
              <ul className="mt-2 space-y-1.5">
                {profile.reports.map((report) => (
                  <li key={report.id}>
                    <Link
                      href={`/people/${report.id}`}
                      className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 transition-colors hover:bg-surface-3"
                    >
                      <PersonCell
                        name={report.fullName}
                        meta={report.jobTitle}
                        tone={report.avatarColor}
                        size="xs"
                      />
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-1.5 text-[0.8125rem] text-ink-3">No direct reports.</p>
            )}
          </div>
        </CardBody>
      </Card>
    </div>
  );
}

function AttendancePanel({
  data,
  timezone,
  today,
}: {
  data: ProfileTabData;
  timezone: string;
  today: string;
}) {
  const attendance = data.attendance;
  if (!attendance) return null;
  const { totals } = attendance;

  return (
    <div className="space-y-5">
      <StatRow columns={5}>
        <Stat label="Present" value={totals.present} caption="Full days recorded" tone="success" />
        <Stat label="Half days" value={totals.halfDay} caption="Below the full-day threshold" tone="warning" />
        <Stat label="On leave" value={totals.leave} caption="Approved leave days" tone="info" />
        <Stat label="Absent" value={totals.absent} caption="No record and no approved leave" tone="danger" />
        <Stat
          label="Hours"
          value={(totals.workedMinutes / 60).toFixed(1)}
          caption={`Average ${hours(totals.avgWorkedMinutes)} per worked day`}
          tone="brand"
        />
      </StatRow>

      <div className="grid gap-5 xl:grid-cols-2">
        <Card>
          <CardHeader
            icon={<CalendarDays className="size-4" />}
            title={attendance.monthLabel}
            subtitle="Month at a glance."
          />
          <AttendanceCalendar
            days={attendance.days}
            timezone={timezone}
            today={today}
            monthLabel={attendance.monthLabel}
          />
        </Card>

        <Card>
          <CardHeader
            icon={<Clock className="size-4" />}
            title="Day by day"
            subtitle="Exact check-in and check-out times, newest first."
          />
          <AttendanceTimeline days={attendance.days} timezone={timezone} today={today} />
        </Card>
      </div>
    </div>
  );
}

function LeavePanel({ data }: { data: ProfileTabData }) {
  const balances = data.balances ?? [];
  const requests = data.leave ?? [];

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader
          icon={<CalendarDays className="size-4" />}
          title="Entitlements"
          subtitle="Remaining = entitled − approved − pending."
        />
        <CardBody>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {balances.map((balance) => (
              <div key={balance.leaveTypeId} className="rounded-lg border border-line bg-surface-2 p-3">
                <p className="text-[0.8125rem] font-medium text-ink">{balance.name}</p>
                <p className="mt-1 text-xl font-semibold text-ink">
                  {balance.cap === null ? "—" : balance.remainingDays}
                  {balance.cap !== null ? (
                    <span className="text-[0.8125rem] font-normal text-ink-3"> / {balance.cap}</span>
                  ) : null}
                </p>
                {balance.cap !== null ? (
                  <Meter
                    className="mt-2"
                    value={balance.usedDays + balance.pendingDays}
                    max={balance.cap}
                    tone={(balance.remainingDays ?? 0) <= 2 ? "warning" : "brand"}
                    label={balance.name}
                  />
                ) : (
                  <p className="mt-1 text-[0.6875rem] text-ink-3">Uncapped (unpaid)</p>
                )}
                <p className="mt-1.5 text-[0.6875rem] text-ink-3">
                  {days(balance.usedDays)} taken
                  {balance.pendingDays > 0 ? ` · ${days(balance.pendingDays)} pending` : ""}
                </p>
              </div>
            ))}
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          icon={<CalendarDays className="size-4" />}
          title={`Request history · ${requests.length}`}
          subtitle="Including comments left by the approver."
        />
        {requests.length > 0 ? (
          <ul className="divide-y divide-line">
            {requests.map((request) => (
              <li key={request.id} className="px-4 py-3.5 sm:px-5">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-[0.875rem] font-medium text-ink">
                      {request.leaveType}
                      <span className="ml-2 text-[0.8125rem] font-normal text-ink-3">
                        {formatWorkDateRange(request.startDate, request.endDate)}
                      </span>
                    </p>
                    <p className="mt-0.5 text-[0.75rem] text-ink-3">
                      {days(request.workingDays)}
                      {request.halfDay ? " (half day)" : ""} · requested{" "}
                      {formatWorkDate(request.createdAt.slice(0, 10))}
                      {request.decidedByName ? ` · decided by ${request.decidedByName}` : ""}
                    </p>
                  </div>
                  <Badge tone={LEAVE_TONE[request.status as LeaveStatus]} dot>
                    {leaveLabel(request.status)}
                  </Badge>
                </div>
                {request.reason ? (
                  <p className="mt-2 text-[0.8125rem] leading-snug text-ink-2">{request.reason}</p>
                ) : null}
                {request.decisionComment ? (
                  <p className="mt-1.5 rounded-md bg-surface-3 px-2.5 py-1.5 text-[0.8125rem] leading-snug text-ink-2">
                    “{request.decisionComment}”
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState
            title="No leave requests"
            description="Nothing has been requested yet. Requests appear here the moment they are submitted."
            compact
          />
        )}
      </Card>
    </div>
  );
}

function PayrollPanel({
  profile,
  data,
  today,
}: {
  profile: EmployeeProfile;
  data: ProfileTabData;
  today: string;
}) {
  const salary = data.salary ?? null;

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader
          icon={<Wallet className="size-4" />}
          title="Salary structure"
          subtitle={
            salary
              ? `Revision ${salary.revision} · effective ${formatWorkDate(salary.effectiveFrom)}${
                  salary.updatedByName ? ` · last changed by ${salary.updatedByName}` : ""
                }`
              : "No structure on file — payroll will skip this employee."
          }
          actions={
            profile.canEditSalary ? (
              <SalaryEditor
                employeeId={profile.id}
                employeeName={profile.fullName}
                initial={
                  salary
                    ? {
                        basic: salary.basic,
                        hra: salary.hra,
                        specialAllowance: salary.specialAllowance,
                        transportAllow: salary.transportAllow,
                        providentFund: salary.providentFund,
                        professionalTax: salary.professionalTax,
                        healthInsurance: salary.healthInsurance,
                      }
                    : null
                }
                effectiveFrom={salary?.effectiveFrom ?? `${today.slice(0, 7)}-01`}
                revision={salary?.revision ?? null}
              />
            ) : null
          }
        />
        <CardBody>
          {salary ? (
            <>
              <StatRow columns={4}>
                <Stat label="Gross / month" value={money(salary.gross)} caption="Sum of earnings" tone="brand" emphasis />
                <Stat label="Deductions" value={money(salary.deductions)} caption="PF, professional tax, insurance" tone="danger" />
                <Stat label="Net / month" value={money(salary.netMonthly)} caption="Before loss of pay" tone="success" />
                <Stat label="Annual CTC" value={money(salary.annualCtc)} caption="Gross × 12" />
              </StatRow>

              <div className="mt-5 grid gap-5 sm:grid-cols-2">
                <div>
                  <h3 className="mb-2 text-[0.6875rem] font-semibold tracking-wider text-success-ink uppercase">
                    Earnings
                  </h3>
                  <ul className="space-y-1.5">
                    {[
                      ["Basic salary", salary.basic],
                      ["House rent allowance", salary.hra],
                      ["Special allowance", salary.specialAllowance],
                      ["Transport allowance", salary.transportAllow],
                    ].map(([label, value]) => (
                      <li
                        key={label as string}
                        className="flex items-baseline justify-between gap-3 border-b border-line pb-1.5 text-[0.8125rem] last:border-0"
                      >
                        <span className="text-ink-2">{label}</span>
                        <span className="font-medium text-ink">{money(value as number)}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                <div>
                  <h3 className="mb-2 text-[0.6875rem] font-semibold tracking-wider text-danger-ink uppercase">
                    Deductions
                  </h3>
                  <ul className="space-y-1.5">
                    {[
                      ["Provident fund", salary.providentFund],
                      ["Professional tax", salary.professionalTax],
                      ["Health insurance", salary.healthInsurance],
                    ].map(([label, value]) => (
                      <li
                        key={label as string}
                        className="flex items-baseline justify-between gap-3 border-b border-line pb-1.5 text-[0.8125rem] last:border-0"
                      >
                        <span className="text-ink-2">{label}</span>
                        <span className="font-medium text-ink">{money(value as number)}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </>
          ) : (
            <EmptyState
              icon={<Wallet className="size-5" />}
              title="No salary structure yet"
              description={
                profile.canEditSalary
                  ? "Add monthly earnings and deductions so this employee is included in the next payroll run."
                  : "HR has not published a salary structure for this record yet."
              }
              compact
            />
          )}
        </CardBody>
      </Card>

      <PayslipList
        payslips={data.payslips ?? []}
        employeeName={profile.fullName}
        emptyHint="Payslips appear here once a payroll run covering a worked month is processed."
      />
    </div>
  );
}

function DocumentsPanel({ profile }: { profile: EmployeeProfile }) {
  const confidentialCount = profile.documents.filter((d) => d.confidential).length;

  return (
    <Card>
      <CardHeader
        icon={<FileText className="size-4" />}
        title={`Documents · ${profile.documents.length}`}
        subtitle={
          confidentialCount > 0
            ? `${confidentialCount} marked confidential and restricted to HR.`
            : "Contracts, ID proofs, certificates and policies."
        }
      />
      {profile.documents.length > 0 ? (
        <>
          <ul className="divide-y divide-line">
            {profile.documents.map((doc) => (
              <li
                key={doc.id}
                className="flex flex-wrap items-center gap-3 px-4 py-3 sm:px-5"
              >
                <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-surface-3 text-ink-3">
                  <FileText className="size-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[0.875rem] font-medium text-ink">
                    {doc.name}
                  </span>
                  <span className="block truncate text-[0.75rem] text-ink-3">
                    {DOCUMENT_CATEGORY_LABEL[doc.category as DocumentCategory] ?? doc.category} ·{" "}
                    {fileSize(doc.sizeBytes)} · uploaded by {doc.uploadedBy} on{" "}
                    {formatWorkDate(doc.uploadedAt.slice(0, 10))}
                  </span>
                </span>
                {doc.confidential ? (
                  <Badge tone="warning" size="sm">
                    <ShieldCheck className="size-3" />
                    Confidential
                  </Badge>
                ) : null}
              </li>
            ))}
          </ul>
          <div className="border-t border-line px-4 py-3 sm:px-5">
            <InlineWarning>
              This build stores document metadata only — the seeded files have no binary
              content, so there is nothing to download. Access control is real: confidential
              documents are filtered out server-side for non-HR viewers.
            </InlineWarning>
          </div>
        </>
      ) : (
        <EmptyState
          icon={<FileText className="size-5" />}
          title="No documents"
          description="Contracts, ID proofs and certificates attached to this employee will be listed here."
          compact
        />
      )}
    </Card>
  );
}
