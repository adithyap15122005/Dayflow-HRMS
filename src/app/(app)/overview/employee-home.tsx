import Link from "next/link";
import {
  ArrowRight,
  CalendarDays,
  CalendarPlus,
  ChartColumn,
  Clock,
  ReceiptText,
  Sparkles,
  Users,
  Wallet,
} from "lucide-react";

import { HoursAreaChart } from "@/components/charts";
import { TodayPanel } from "@/components/attendance/today-panel";
import { ActivityFeed } from "@/components/overview/activity-feed";
import { AskDayflow } from "@/components/overview/ask-dayflow";
import { Avatar, PersonCell } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page";
import { Meter, MiniStat, Stat, StatRow } from "@/components/ui/stat";
import { EmptyState } from "@/components/ui/states";
import {
  formatPeriod,
  formatWorkDate,
  formatWorkDateRange,
} from "@/lib/domain/time";
import {
  attendanceLabel,
  ATTENDANCE_TONE,
  days,
  hours,
  LEAVE_TONE,
  leaveLabel,
  money,
  percent,
} from "@/lib/format";
import { ASSISTANT_SUGGESTIONS } from "@/lib/services/assistant";
import type { EmployeeHome } from "@/lib/services/insights";
import type { TodayState } from "@/components/attendance/today-panel";
import type { AttendanceStatus, LeaveStatus } from "@/lib/domain/constants";

const WEEKDAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/**
 * The employee overview.
 *
 * Ordered around the questions someone actually opens an HR app to answer:
 * am I checked in, how am I tracking, where is my leave request, what am I paid.
 */
export function EmployeeHomeView({
  data,
  today,
  firstName,
}: {
  data: EmployeeHome;
  today: TodayState;
  firstName: string;
}) {
  const { monthTotals, weekTotals, balances, requests, upcoming, payslips } = data;
  const latestPayslip = payslips[0] ?? null;
  const pending = requests.filter((r) => r.status === "PENDING");
  const cappedBalances = balances.filter((b) => b.cap !== null);

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow={
          <>
            <Badge tone="brand" dot>
              {data.employee?.jobTitle ?? "Employee"}
            </Badge>
            <span>{formatWorkDate(data.today, "long")}</span>
          </>
        }
        title="Your workday"
        description="Everything you need in one place: today's status, your leave, and your pay."
        actions={
          <>
            <ButtonLink href="/leave" variant="secondary" size="sm">
              <CalendarPlus className="size-4" />
              Apply for leave
            </ButtonLink>
            <ButtonLink href="/payroll" variant="secondary" size="sm">
              <ReceiptText className="size-4" />
              Payslips
            </ButtonLink>
          </>
        }
      />

      <TodayPanel initial={today} timezone={data.org.timezone} firstName={firstName} />

      {/* ------------------------------------------------- month snapshot */}
      <StatRow columns={4}>
        <Stat
          label="Hours this month"
          value={(monthTotals.workedMinutes / 60).toFixed(1)}
          caption={`${monthTotals.present} present · ${monthTotals.halfDay} half · ${monthTotals.leave} leave`}
          icon={<Clock className="size-4" />}
          tone="brand"
          href="/attendance"
          emphasis
        />
        <Stat
          label="Attendance rate"
          value={percent(monthTotals.attendanceRatePct, 1)}
          caption={`Credited days ÷ ${monthTotals.expectedWorkingDays} expected working days`}
          icon={<ChartColumn className="size-4" />}
          tone={monthTotals.attendanceRatePct >= 90 ? "success" : "warning"}
        />
        <Stat
          label="This week"
          value={hours(weekTotals.workedMinutes)}
          caption={`Average ${hours(weekTotals.avgWorkedMinutes)} per worked day`}
          icon={<CalendarDays className="size-4" />}
        />
        <Stat
          label="Late arrivals"
          value={monthTotals.lateDays}
          caption={
            monthTotals.lateDays === 0
              ? "Perfect punctuality this month"
              : "Counted after your shift's grace period"
          }
          icon={<Clock className="size-4" />}
          tone={monthTotals.lateDays > 2 ? "warning" : "success"}
        />
      </StatRow>

      {/* -------------------------------------------- leave + assistant */}
      <div className="grid gap-5 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader
            icon={<CalendarDays className="size-4" />}
            title="Leave balances"
            subtitle="Pending requests are already deducted, so what you see is what you can book."
            actions={
              <ButtonLink href="/leave" variant="ghost" size="sm">
                Manage
                <ArrowRight className="size-3.5" />
              </ButtonLink>
            }
          />
          <CardBody>
            {cappedBalances.length > 0 ? (
              <ul className="grid gap-4 sm:grid-cols-2">
                {cappedBalances.map((balance) => (
                  <li key={balance.leaveTypeId}>
                    <div className="flex items-baseline justify-between gap-2">
                      <p className="text-[0.8125rem] font-medium text-ink">{balance.name}</p>
                      <p className="text-[0.8125rem] text-ink-2">
                        <span className="font-semibold text-ink">
                          {balance.remainingDays}
                        </span>
                        <span className="text-ink-3"> / {balance.cap} left</span>
                      </p>
                    </div>
                    <Meter
                      className="mt-2"
                      value={balance.usedDays + balance.pendingDays}
                      max={balance.cap ?? 1}
                      tone={
                        (balance.remainingDays ?? 0) <= 1
                          ? "danger"
                          : (balance.remainingDays ?? 0) <= 3
                            ? "warning"
                            : "brand"
                      }
                      label={`${balance.name} used`}
                    />
                    <p className="mt-1.5 text-[0.6875rem] text-ink-3">
                      {days(balance.usedDays)} taken
                      {balance.pendingDays > 0
                        ? ` · ${days(balance.pendingDays)} pending approval`
                        : ""}
                    </p>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState
                title="No leave entitlement configured"
                description="Ask HR to set your annual entitlements in Settings → Leave types."
                compact
              />
            )}
          </CardBody>
        </Card>

        <Card className="flex flex-col">
          <CardHeader
            icon={<Sparkles className="size-4" />}
            title="Ask Dayflow"
            subtitle="Your own numbers, answered from the database."
          />
          <AskDayflow suggestions={ASSISTANT_SUGGESTIONS.employee} />
        </Card>
      </div>

      {/* ------------------------------------------- requests + payslip */}
      <div className="grid gap-5 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader
            icon={<CalendarDays className="size-4" />}
            title="Your leave requests"
            subtitle={
              pending.length > 0
                ? `${pending.length} awaiting a decision`
                : "Latest requests and their outcome"
            }
            actions={
              <ButtonLink href="/leave" variant="ghost" size="sm">
                All requests
                <ArrowRight className="size-3.5" />
              </ButtonLink>
            }
          />
          {requests.length > 0 ? (
            <ul className="divide-y divide-line">
              {requests.map((request) => (
                <li key={request.id} className="px-4 py-3 sm:px-5">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-[0.875rem] font-medium text-ink">
                        {request.leaveType}
                        <span className="ml-2 text-[0.8125rem] font-normal text-ink-3">
                          {formatWorkDateRange(request.startDate, request.endDate)}
                        </span>
                      </p>
                      <p className="mt-0.5 text-[0.75rem] text-ink-3">
                        {days(request.workingDays)} requested
                      </p>
                    </div>
                    <Badge tone={LEAVE_TONE[request.status as LeaveStatus]} dot>
                      {leaveLabel(request.status)}
                    </Badge>
                  </div>
                  {request.decisionComment ? (
                    <p className="mt-2 rounded-md bg-surface-3 px-2.5 py-1.5 text-[0.8125rem] leading-snug text-ink-2">
                      “{request.decisionComment}”
                    </p>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState
              icon={<CalendarPlus className="size-5" />}
              title="No leave requested yet"
              description="Pick a leave type and date range, and Dayflow checks your balance and clashes before submitting."
              action={
                <ButtonLink href="/leave" variant="primary" size="sm">
                  Apply for leave
                </ButtonLink>
              }
              compact
            />
          )}
        </Card>

        <Card>
          <CardHeader
            icon={<Wallet className="size-4" />}
            title="Latest payslip"
            subtitle={
              latestPayslip
                ? `${latestPayslip.periodLabel} · ${latestPayslip.runStatus.toLowerCase()}`
                : "No payslip generated yet"
            }
            actions={
              <ButtonLink href="/payroll" variant="ghost" size="sm">
                Open
                <ArrowRight className="size-3.5" />
              </ButtonLink>
            }
          />
          <CardBody>
            {latestPayslip ? (
              <>
                <p className="text-[0.6875rem] font-semibold tracking-wider text-ink-4 uppercase">
                  Net pay
                </p>
                <p className="mt-1 text-[1.75rem] leading-8 font-semibold text-ink">
                  {money(latestPayslip.netPay)}
                </p>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <MiniStat
                    label="Earnings"
                    value={money(latestPayslip.totalEarnings)}
                    tone="success"
                  />
                  <MiniStat
                    label="Deductions"
                    value={money(latestPayslip.totalDeductions)}
                    tone="danger"
                  />
                  <MiniStat label="Paid days" value={latestPayslip.paidDays} />
                  <MiniStat
                    label="Loss of pay"
                    value={days(latestPayslip.lopDays)}
                    tone={latestPayslip.lopDays > 0 ? "warning" : "neutral"}
                  />
                </div>
                <p className="mt-3 text-[0.75rem] leading-snug text-ink-3">
                  Pro-rated from your attendance for {latestPayslip.periodLabel}. Only you
                  and HR can see this.
                </p>
              </>
            ) : (
              <EmptyState
                title="Nothing to show yet"
                description="Your first payslip appears here once HR processes a payroll run for a month you worked."
                compact
              />
            )}
          </CardBody>
        </Card>
      </div>

      {/* --------------------------------------- hours chart + this week */}
      <div className="grid gap-5 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader
            icon={<ChartColumn className="size-4" />}
            title={`Hours logged in ${formatPeriod(data.nextPayrollPeriod)}`}
            subtitle="Are my days consistent, or am I front-loading the week?"
          />
          <CardBody className="pt-2">
            <HoursAreaChart
              data={data.monthDays.map((d) => ({
                workDate: d.workDate,
                minutes: d.workedMinutes,
                status: d.status,
              }))}
              height={200}
            />
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            icon={<CalendarDays className="size-4" />}
            title="This week"
            subtitle="Your own week, day by day."
          />
          <CardBody>
            <ul className="space-y-1.5">
              {data.weekDays.map((day) => {
                const weekday = WEEKDAY[new Date(`${day.workDate}T12:00:00Z`).getUTCDay()];
                const isToday = day.workDate === data.today;
                const isFuture = day.workDate > data.today;
                return (
                  <li
                    key={day.workDate}
                    className={`flex items-center gap-3 rounded-lg px-2 py-1.5 ${
                      isToday ? "bg-brand-soft" : ""
                    }`}
                  >
                    <span className="w-8 shrink-0 text-[0.6875rem] font-semibold tracking-wide text-ink-3 uppercase">
                      {weekday}
                    </span>
                    <span className="w-6 shrink-0 text-[0.8125rem] font-medium text-ink">
                      {Number(day.workDate.slice(8))}
                    </span>
                    <span className="min-w-0 flex-1">
                      {isFuture ? (
                        <span className="text-[0.75rem] text-ink-4">—</span>
                      ) : (
                        <Badge
                          tone={ATTENDANCE_TONE[day.status as AttendanceStatus]}
                          size="sm"
                        >
                          {attendanceLabel(day.status)}
                        </Badge>
                      )}
                    </span>
                    <span className="shrink-0 font-mono text-[0.75rem] text-ink-2">
                      {day.workedMinutes > 0 ? hours(day.workedMinutes) : ""}
                    </span>
                  </li>
                );
              })}
            </ul>
          </CardBody>
        </Card>
      </div>

      {/* ---------------------------------------- team + upcoming + feed */}
      <div className="grid gap-5 xl:grid-cols-3">
        <Card>
          <CardHeader
            icon={<Users className="size-4" />}
            title="Your team today"
            subtitle="Who is away in your department."
          />
          <CardBody>
            {data.teamOnLeaveToday.length > 0 ? (
              <ul className="space-y-2.5">
                {data.teamOnLeaveToday.map((person) => (
                  <li key={person.id} className="flex items-center justify-between gap-3">
                    <PersonCell
                      name={person.name}
                      meta={person.leaveType}
                      tone={person.avatarColor}
                      size="xs"
                    />
                    <span className="shrink-0 text-[0.75rem] text-ink-3">
                      back {formatWorkDate(person.endDate, "short")}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="py-4 text-center text-[0.8125rem] text-ink-3">
                Nobody in your department is on leave today.
              </p>
            )}

            {data.employee?.manager ? (
              <div className="mt-4 border-t border-line pt-3.5">
                <p className="text-[0.6875rem] font-semibold tracking-wider text-ink-4 uppercase">
                  Reports to
                </p>
                <div className="mt-2 flex items-center gap-2.5">
                  <Avatar
                    name={`${data.employee.manager.firstName} ${data.employee.manager.lastName}`}
                    tone={data.employee.manager.avatarColor}
                    size="sm"
                  />
                  <div className="min-w-0">
                    <p className="truncate text-[0.8125rem] font-medium text-ink">
                      {data.employee.manager.firstName} {data.employee.manager.lastName}
                    </p>
                    <p className="truncate text-[0.75rem] text-ink-3">
                      {data.employee.manager.jobTitle}
                    </p>
                  </div>
                </div>
              </div>
            ) : null}
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            icon={<CalendarDays className="size-4" />}
            title="Upcoming leave"
            subtitle="Approved and on the calendar."
          />
          <CardBody>
            {upcoming.length > 0 ? (
              <ul className="space-y-3">
                {upcoming.map((item) => (
                  <li key={item.id} className="rounded-lg border border-line bg-surface-2 p-3">
                    <p className="text-[0.8125rem] font-medium text-ink">{item.leaveType}</p>
                    <p className="mt-0.5 text-[0.75rem] text-ink-3">
                      {formatWorkDateRange(item.startDate, item.endDate)} ·{" "}
                      {days(item.workingDays)}
                    </p>
                    <Badge
                      tone={item.startsInDays <= 2 ? "warning" : "info"}
                      size="sm"
                      className="mt-2"
                    >
                      {item.startsInDays === 0
                        ? "Starts today"
                        : `Starts in ${item.startsInDays} day${item.startsInDays > 1 ? "s" : ""}`}
                    </Badge>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="py-4 text-center text-[0.8125rem] text-ink-3">
                No approved leave coming up.{" "}
                <Link href="/leave" className="font-medium text-brand hover:underline">
                  Plan some time off
                </Link>
                .
              </p>
            )}
          </CardBody>
        </Card>

        <Card className="flex flex-col">
          <CardHeader
            icon={<Clock className="size-4" />}
            title="Your recent activity"
            subtitle="Recorded automatically as you use Dayflow."
          />
          <div className="min-h-0 flex-1 overflow-y-auto">
            <ActivityFeed items={data.activity} showActor={false} />
          </div>
        </Card>
      </div>
    </div>
  );
}
