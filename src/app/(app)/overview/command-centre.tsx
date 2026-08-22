import Link from "next/link";
import {
  ArrowRight,
  CalendarDays,
  ChartColumn,
  CircleCheck,
  Clock,
  Sparkles,
  TrendingUp,
  TriangleAlert,
  Users,
  Wallet,
} from "lucide-react";

import { AttendanceTrendChart, HorizontalBarChart, SharePie } from "@/components/charts";
import { ActivityFeed } from "@/components/overview/activity-feed";
import { AskDayflow } from "@/components/overview/ask-dayflow";
import { AttentionQueue } from "@/components/overview/attention-queue";
import { PresenceBoard } from "@/components/overview/presence-board";
import { ApprovalQueue } from "@/components/leave/approval-queue";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page";
import { MiniStat, Stat, StatRow } from "@/components/ui/stat";
import { EmptyState } from "@/components/ui/states";
import { formatWorkDate, formatWorkDateRange, periodOf } from "@/lib/domain/time";
import { days, hours, money, moneyCompact, percent } from "@/lib/format";
import { ASSISTANT_SUGGESTIONS } from "@/lib/services/assistant";
import type { CommandCentre } from "@/lib/services/insights";

/**
 * The HR command centre.
 *
 * Reading order is deliberate: what is true right now → what needs a decision →
 * why the trend looks like that → the money → who is out. Each card states the
 * business question it answers so the screen teaches itself.
 */
export function CommandCentreView({
  data,
  firstName,
}: {
  data: CommandCentre;
  firstName: string;
}) {
  const { live, attention, payroll, headcount, trend, absence, activity, upcoming } = data;

  const criticalCount = attention.filter((f) => f.severity === "CRITICAL").length;
  const departmentAbsence = absence
    .filter((d) => d.expected > 0)
    .slice(0, 6)
    .map((d) => ({ department: d.department, ratePct: d.ratePct }));

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow={
          <>
            <Badge tone={criticalCount > 0 ? "danger" : "success"} dot live>
              Live
            </Badge>
            <span>{formatWorkDate(data.today, "long")}</span>
            <span className="text-ink-4">·</span>
            <span>{data.org.timezone.replace("_", " ")}</span>
          </>
        }
        title={`Good to see you, ${firstName}`}
        description={
          criticalCount > 0
            ? `${criticalCount} item${criticalCount > 1 ? "s" : ""} need action today. Everything below is computed from live records — no cached snapshots.`
            : "Nothing critical is outstanding. Everything below is computed from live records — no cached snapshots."
        }
        actions={
          <>
            <ButtonLink href="/reports" variant="secondary" size="sm">
              <ChartColumn className="size-4" />
              Reports
            </ButtonLink>
            <ButtonLink href="/people?new=1" variant="primary" size="sm">
              <Users className="size-4" />
              Add employee
            </ButtonLink>
          </>
        }
      />

      {/* ------------------------------------------------- live workforce */}
      <StatRow columns={5}>
        <Stat
          label="Present today"
          value={`${live.present}/${live.expected}`}
          caption={`${percent(live.presenceRatePct)} of people expected in. Week offs and holidays excluded.`}
          icon={<CircleCheck className="size-4" />}
          tone={live.presenceRatePct >= 85 ? "success" : "warning"}
          href="/attendance"
          emphasis
        />
        <Stat
          label="Working now"
          value={live.workingNow}
          caption={`${live.completed} already checked out`}
          icon={<Clock className="size-4" />}
          tone="brand"
          href="/attendance"
        />
        <Stat
          label="On approved leave"
          value={live.onLeave}
          caption={
            upcoming.length > 0
              ? `${upcoming.length} more leave window${upcoming.length > 1 ? "s" : ""} upcoming`
              : "No upcoming leave booked"
          }
          icon={<CalendarDays className="size-4" />}
          tone="info"
          href="/leave?status=APPROVED"
        />
        <Stat
          label="Late arrivals"
          value={live.late}
          caption="Measured against each person's own shift start"
          icon={<TrendingUp className="size-4" />}
          tone={live.late > 0 ? "warning" : "neutral"}
          href="/reports?report=attendance"
        />
        <Stat
          label="Unaccounted"
          value={live.unaccounted}
          caption="No check-in and no approved leave"
          icon={<TriangleAlert className="size-4" />}
          tone={live.unaccounted > 0 ? "danger" : "success"}
          href="/attendance"
        />
      </StatRow>

      {/* ------------------------------- attention queue + ask dayflow */}
      <div className="grid gap-5 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader
            icon={<TriangleAlert className="size-4" />}
            title="Attention queue"
            subtitle="Which decisions are overdue, and why? Every row names the rule that produced it."
            actions={
              attention.length > 0 ? (
                <Badge tone={criticalCount > 0 ? "danger" : "warning"}>
                  {attention.length} open
                </Badge>
              ) : (
                <Badge tone="success" dot>
                  Clear
                </Badge>
              )
            }
          />
          <AttentionQueue flags={attention} />
        </Card>

        <Card className="flex flex-col">
          <CardHeader
            icon={<Sparkles className="size-4" />}
            title="Ask Dayflow"
            subtitle="Plain-English questions, answered from your tables."
          />
          <AskDayflow suggestions={ASSISTANT_SUGGESTIONS.management} />
        </Card>
      </div>

      {/* -------------------------------------------- trend + payroll */}
      <div className="grid gap-5 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader
            icon={<ChartColumn className="size-4" />}
            title="Attendance over the last 30 days"
            subtitle="Is attendance improving, and which days went wrong?"
            actions={
              <div className="hidden items-center gap-3 sm:flex">
                <MiniStat
                  label="Avg day"
                  value={hours(data.weekAverageMinutes)}
                  tone="brand"
                />
              </div>
            }
          />
          <CardBody className="pt-2">
            <AttendanceTrendChart data={trend} />
            <p className="mt-2 text-[0.75rem] text-ink-3">
              Bars are headcount per status; the dark line is the presence rate. Only
              expected working days appear — {data.completedDaysThisWeek} completed days
              this week averaged {hours(data.weekAverageMinutes)}.
            </p>
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            icon={<Wallet className="size-4" />}
            title="Payroll"
            subtitle={`${payroll.currentPeriodLabel} · ${
              payroll.currentRun?.status.toLowerCase() ?? "not started"
            }`}
            actions={
              <ButtonLink href="/payroll" variant="ghost" size="sm">
                Open
                <ArrowRight className="size-3.5" />
              </ButtonLink>
            }
          />
          <CardBody className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <MiniStat
                label="Monthly commitment"
                value={moneyCompact(payroll.monthlyCommitment)}
                tone="brand"
              />
              <MiniStat
                label="Average gross"
                value={moneyCompact(payroll.averageGross)}
              />
              <MiniStat label="Payslips issued" value={payroll.processedCount} />
              <MiniStat
                label="Net last period"
                value={moneyCompact(
                  payroll.netByPeriod[payroll.netByPeriod.length - 1]?.netPay ?? 0,
                )}
                tone="success"
              />
            </div>

            {payroll.byDepartment.length > 0 ? (
              <div>
                <p className="mb-1 text-[0.75rem] font-medium text-ink-2">
                  Where the salary commitment sits
                </p>
                <SharePie
                  data={payroll.byDepartment.map((d) => ({
                    department: d.department,
                    gross: d.gross,
                  }))}
                  nameKey="department"
                  valueKey="gross"
                  height={190}
                  asMoney
                />
              </div>
            ) : null}

            {payroll.currentRun === null ? (
              <p className="rounded-lg border border-warning/25 bg-warning-soft px-3 py-2 text-[0.75rem] text-warning-ink">
                {periodOf(data.today)} has no payroll run yet. Total exposure if run today:{" "}
                <span className="font-semibold">{money(payroll.monthlyCommitment)}</span>.
              </p>
            ) : null}
          </CardBody>
        </Card>
      </div>

      {/* ------------------------------------ approvals + presence board */}
      <div className="grid gap-5 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader
            icon={<CalendarDays className="size-4" />}
            title="Awaiting your decision"
            subtitle="How much leave is pending, and how long has it been waiting?"
            actions={
              <ButtonLink href="/leave?status=PENDING" variant="ghost" size="sm">
                Full queue
                <ArrowRight className="size-3.5" />
              </ButtonLink>
            }
          />
          <ApprovalQueue requests={data.pendingLeave.slice(0, 4)} compact />
        </Card>

        <Card>
          <CardHeader
            icon={<Users className="size-4" />}
            title="Today's board"
            subtitle="Who is in, out and unexplained."
          />
          <PresenceBoard
            rows={live.rows}
            timezone={data.org.timezone}
            limitPerGroup={4}
          />
        </Card>
      </div>

      {/* ------------------------------------- analytics + activity feed */}
      <div className="grid gap-5 xl:grid-cols-3">
        <Card>
          <CardHeader
            icon={<TriangleAlert className="size-4" />}
            title="Absence by department"
            subtitle="Which teams lose the most working days? Last 30 days."
          />
          <CardBody className="pt-2">
            {departmentAbsence.length > 0 ? (
              <>
                <HorizontalBarChart
                  data={departmentAbsence}
                  labelKey="department"
                  valueKey="ratePct"
                  unit="%"
                  tone="absent"
                  height={200}
                  formatValue={(value) => `${value}% of expected days`}
                />
                <p className="mt-1 text-[0.75rem] text-ink-3">
                  Unexcused absence as a share of expected working days. Approved leave is
                  excluded — this is unplanned loss only.
                </p>
              </>
            ) : (
              <EmptyState
                title="Not enough history"
                description="Absence rates appear once there are at least a few working days of attendance."
                compact
              />
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            icon={<Users className="size-4" />}
            title="Headcount"
            subtitle={`${headcount.total} employed across ${headcount.byDepartment.length} teams.`}
            actions={
              <ButtonLink href="/people" variant="ghost" size="sm">
                Directory
                <ArrowRight className="size-3.5" />
              </ButtonLink>
            }
          />
          <CardBody className="pt-2">
            <HorizontalBarChart
              data={headcount.byDepartment}
              labelKey="department"
              valueKey="count"
              tone="present"
              height={200}
              formatValue={(value) => `${value} people`}
            />
            <ul className="mt-3 flex flex-wrap gap-1.5">
              {headcount.byStatus.map((item) => (
                <li key={item.status}>
                  <Badge
                    tone={
                      item.status === "ACTIVE"
                        ? "success"
                        : item.status === "PROBATION"
                          ? "info"
                          : item.status === "NOTICE_PERIOD"
                            ? "warning"
                            : "neutral"
                    }
                    size="sm"
                  >
                    {item.status.toLowerCase().replace("_", " ")} · {item.count}
                  </Badge>
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>

        <Card className="flex flex-col">
          <CardHeader
            icon={<Clock className="size-4" />}
            title="Recent activity"
            subtitle="Written by the app itself — this is the audit trail."
          />
          <div className="min-h-0 flex-1 overflow-y-auto">
            <ActivityFeed items={activity} linkPeople />
          </div>
        </Card>
      </div>

      {/* ------------------------------------------------ upcoming leave */}
      {upcoming.length > 0 ? (
        <Card>
          <CardHeader
            icon={<CalendarDays className="size-4" />}
            title="Upcoming approved leave"
            subtitle="Plan cover before it becomes a surprise."
          />
          <ul className="divide-y divide-line">
            {upcoming.map((item) => (
              <li key={item.id}>
                <Link
                  href={`/people/${item.employeeId}`}
                  className="flex flex-wrap items-center gap-3 px-4 py-3 transition-colors hover:bg-surface-2 sm:px-5"
                >
                  <Avatar name={item.employeeName} tone={item.avatarColor} size="sm" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[0.8125rem] font-medium text-ink">
                      {item.employeeName}
                    </span>
                    <span className="block text-[0.75rem] text-ink-3">
                      {item.leaveType} · {formatWorkDateRange(item.startDate, item.endDate)}
                    </span>
                  </span>
                  <Badge tone={item.startsInDays <= 2 ? "warning" : "neutral"} size="sm">
                    {item.startsInDays === 0
                      ? "Starts today"
                      : `in ${item.startsInDays} day${item.startsInDays > 1 ? "s" : ""}`}
                  </Badge>
                  <span className="text-[0.75rem] text-ink-3">
                    {days(item.workingDays)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
    </div>
  );
}
