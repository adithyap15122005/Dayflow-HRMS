import type { Metadata } from "next";
import { CalendarCheck, CalendarDays, ChartColumn, Clock, Users } from "lucide-react";

import { HorizontalBarChart } from "@/components/charts";
import { ApprovalQueue } from "@/components/leave/approval-queue";
import { LeaveList } from "@/components/leave/leave-list";
import { LeaveRequestForm } from "@/components/leave/leave-request-form";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page";
import { Meter, Stat, StatRow } from "@/components/ui/stat";
import { Tabs } from "@/components/ui/tabs";
import { EmptyState } from "@/components/ui/states";
import { getCurrentUser, requireActor } from "@/lib/auth/guard";
import {
  isManagement,
  LEAVE_STATUS_LABEL,
  LEAVE_STATUSES,
  type LeaveStatus,
} from "@/lib/domain/constants";
import { addWorkDays, formatWorkDate, formatWorkDateRange } from "@/lib/domain/time";
import { days, percent } from "@/lib/format";
import {
  getLeaveBalances,
  getLeaveUtilisation,
  getUpcomingLeave,
  listLeaveRequests,
  listLeaveTypes,
} from "@/lib/services/leave";
import { getOrgContext } from "@/lib/services/org";

export async function generateMetadata(): Promise<Metadata> {
  const user = await getCurrentUser();
  return user && isManagement(user.role)
    ? {
        title: "Leave approvals",
        description: "The approval queue, the leave register and utilisation analytics.",
      }
    : {
        title: "Time off",
        description: "Your leave balances, requests and upcoming approved leave.",
      };
}

export const dynamic = "force-dynamic";

type SearchParams = Promise<{
  status?: string;
  departmentId?: string;
  request?: string;
}>;

export default async function LeavePage({ searchParams }: { searchParams: SearchParams }) {
  const { user, actor } = await requireActor();
  const query = await searchParams;
  const org = await getOrgContext();
  const year = Number(org.today.slice(0, 4));

  if (isManagement(user.role)) {
    const statusFilter = (LEAVE_STATUSES as readonly string[]).includes(query.status ?? "")
      ? (query.status as LeaveStatus)
      : undefined;

    const [pending, all, utilisation, upcoming] = await Promise.all([
      listLeaveRequests(actor, { scope: "org", status: "PENDING", take: 60 }),
      listLeaveRequests(actor, {
        scope: "org",
        status: statusFilter,
        departmentId: query.departmentId,
        take: 120,
      }),
      getLeaveUtilisation(addWorkDays(org.today, -89), addWorkDays(org.today, 89)),
      getUpcomingLeave(null, org, 8),
    ]);

    const aging = pending.filter((p) => p.ageHours >= 48);
    const activeTab = statusFilter ?? "ALL";
    const counts: Record<string, number> = {};
    for (const request of all) {
      counts[request.status] = (counts[request.status] ?? 0) + 1;
    }

    return (
      <div className="space-y-5">
        <PageHeader
          eyebrow={
            <>
              <CalendarCheck className="size-3.5" />
              {formatWorkDate(org.today, "long")}
            </>
          }
          title="Leave approvals"
          description="Approve or reject with the employee's context in front of you. Approving deducts the balance and writes the leave onto their attendance record in one transaction."
          actions={
            <Badge tone={aging.length > 0 ? "danger" : pending.length > 0 ? "warning" : "success"} dot>
              {pending.length} pending
            </Badge>
          }
        />

        <StatRow columns={4}>
          <Stat
            label="Awaiting decision"
            value={pending.length}
            caption={
              aging.length > 0
                ? `${aging.length} waiting over 48 hours`
                : "Nothing has aged past 48 hours"
            }
            icon={<Clock className="size-4" />}
            tone={aging.length > 0 ? "danger" : pending.length > 0 ? "warning" : "success"}
            emphasis
          />
          <Stat
            label="Days requested"
            value={days(pending.reduce((s, p) => s + p.workingDays, 0))}
            caption="Total working days in the pending queue"
            icon={<CalendarDays className="size-4" />}
          />
          <Stat
            label="Approved days"
            value={days(utilisation.totalDays)}
            caption="Across the last and next 90 days"
            tone="info"
          />
          <Stat
            label="On leave today"
            value={upcoming.filter((u) => u.startsInDays === 0).length}
            caption={`${upcoming.length} approved windows upcoming`}
            icon={<Users className="size-4" />}
          />
        </StatRow>

        <Card>
          <CardHeader
            icon={<Clock className="size-4" />}
            title="Approval queue"
            subtitle="Oldest requests carry an aging badge so nothing quietly rots."
          />
          <ApprovalQueue requests={pending} />
        </Card>

        <div className="grid gap-5 xl:grid-cols-3">
          <Card className="xl:col-span-2">
            <CardHeader
              icon={<CalendarDays className="size-4" />}
              title="Leave register"
              subtitle="Every request with its decision and comment."
            />
            <Tabs
              tabs={[
                { id: "ALL", label: "All", count: all.length },
                ...LEAVE_STATUSES.map((status) => ({
                  id: status,
                  label: LEAVE_STATUS_LABEL[status],
                  count: counts[status],
                })),
              ]}
              active={activeTab}
              hrefFor={(id) =>
                `/leave${id === "ALL" ? "" : `?status=${id}`}${
                  query.departmentId
                    ? `${id === "ALL" ? "?" : "&"}departmentId=${query.departmentId}`
                    : ""
                }`
              }
            />
            <LeaveList requests={all} showEmployee />
          </Card>

          <div className="space-y-5">
            <Card>
              <CardHeader
                icon={<ChartColumn className="size-4" />}
                title="Leave by type"
                subtitle="Which leave types actually get used?"
              />
              <CardBody className="pt-2">
                {utilisation.byType.length > 0 ? (
                  <HorizontalBarChart
                    data={utilisation.byType.map((t) => ({ name: t.name, days: t.days }))}
                    labelKey="name"
                    valueKey="days"
                    tone="leave"
                    height={180}
                    valueLabel="days approved"
                  />
                ) : (
                  <EmptyState
                    title="No approved leave yet"
                    description="Once requests are approved, utilisation by type appears here."
                    compact
                  />
                )}
              </CardBody>
            </Card>

            <Card>
              <CardHeader
                icon={<Users className="size-4" />}
                title="Leave by department"
                subtitle="Where is capacity being lost?"
              />
              <CardBody className="pt-2">
                {utilisation.byDepartment.length > 0 ? (
                  <HorizontalBarChart
                    data={utilisation.byDepartment}
                    labelKey="department"
                    valueKey="days"
                    tone="present"
                    height={190}
                    valueLabel="days approved"
                  />
                ) : (
                  <EmptyState
                    title="Nothing to compare"
                    description="Departmental leave shows up once requests are approved."
                    compact
                  />
                )}
              </CardBody>
            </Card>
          </div>
        </div>

        {upcoming.length > 0 ? (
          <Card>
            <CardHeader
              icon={<CalendarDays className="size-4" />}
              title="Upcoming approved leave"
              subtitle="Arrange cover before it becomes urgent."
            />
            <ul className="divide-y divide-line">
              {upcoming.map((item) => (
                <li
                  key={item.id}
                  className="flex flex-wrap items-center gap-3 px-4 py-3 sm:px-5"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[0.875rem] font-medium text-ink">
                      {item.employeeName}
                    </span>
                    <span className="block text-[0.75rem] text-ink-3">
                      {item.leaveType} ·{" "}
                      {formatWorkDateRange(item.startDate, item.endDate)} ·{" "}
                      {days(item.workingDays)}
                    </span>
                  </span>
                  <Badge tone={item.startsInDays <= 2 ? "warning" : "neutral"} size="sm">
                    {item.startsInDays === 0
                      ? "On leave today"
                      : `in ${item.startsInDays} day${item.startsInDays > 1 ? "s" : ""}`}
                  </Badge>
                </li>
              ))}
            </ul>
          </Card>
        ) : null}
      </div>
    );
  }

  /* ---------------------------------------------------------- employee */

  if (!actor.employeeId) {
    return (
      <EmptyState
        icon={<CalendarDays className="size-5" />}
        title="No employee record"
        description="Your account is not linked to an employee profile, so leave cannot be requested yet."
      />
    );
  }

  const [balances, requests, leaveTypes, upcoming] = await Promise.all([
    getLeaveBalances(actor.employeeId, year),
    listLeaveRequests(actor, { scope: "me", take: 60 }),
    listLeaveTypes(),
    getUpcomingLeave(actor.employeeId, org, 4),
  ]);

  const capped = balances.filter((b) => b.cap !== null);
  const pending = requests.filter((r) => r.status === "PENDING");
  const totalRemaining = capped.reduce((s, b) => s + (b.remainingDays ?? 0), 0);
  const totalEntitled = capped.reduce((s, b) => s + (b.cap ?? 0), 0);

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow={
          <>
            <CalendarDays className="size-3.5" />
            {year} entitlement year
          </>
        }
        title="Time off"
        description="Check your balance, request leave, and follow each request through to a decision."
        actions={
          <LeaveRequestForm
            leaveTypes={leaveTypes}
            balances={balances}
            today={org.today}
            trigger="primary"
          />
        }
      />

      <StatRow columns={4}>
        <Stat
          label="Days available"
          value={Math.round(totalRemaining * 10) / 10}
          caption={`Of ${totalEntitled} entitled across ${capped.length} paid leave types`}
          icon={<CalendarDays className="size-4" />}
          tone={totalRemaining <= 2 ? "warning" : "success"}
          emphasis
        />
        <Stat
          label="Awaiting decision"
          value={pending.length}
          caption={
            pending.length > 0
              ? `${days(pending.reduce((s, r) => s + r.workingDays, 0))} held pending`
              : "Nothing waiting on an approver"
          }
          icon={<Clock className="size-4" />}
          tone={pending.length > 0 ? "warning" : "neutral"}
        />
        <Stat
          label="Days taken"
          value={days(capped.reduce((s, b) => s + b.usedDays, 0))}
          caption="Approved and deducted this year"
          tone="info"
        />
        <Stat
          label="Utilisation"
          value={percent(totalEntitled > 0 ? ((totalEntitled - totalRemaining) / totalEntitled) * 100 : 0)}
          caption="Of your annual entitlement, including pending"
        />
      </StatRow>

      <div className="grid gap-5 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader
            icon={<CalendarDays className="size-4" />}
            title="Your entitlements"
            subtitle="Remaining = entitled − approved − pending, so the figure is always bookable."
          />
          <CardBody>
            <div className="grid gap-5 sm:grid-cols-2">
              {balances.map((balance) => (
                <div key={balance.leaveTypeId}>
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="text-[0.8125rem] font-medium text-ink">{balance.name}</p>
                    <p className="text-[0.8125rem] text-ink-2">
                      {balance.cap === null ? (
                        <span className="text-ink-3">Uncapped</span>
                      ) : (
                        <>
                          <span className="font-semibold text-ink">{balance.remainingDays}</span>
                          <span className="text-ink-3"> / {balance.cap} left</span>
                        </>
                      )}
                    </p>
                  </div>
                  {balance.cap !== null ? (
                    <Meter
                      className="mt-2"
                      value={balance.usedDays + balance.pendingDays}
                      max={balance.cap}
                      tone={
                        (balance.remainingDays ?? 0) <= 1
                          ? "danger"
                          : (balance.remainingDays ?? 0) <= 3
                            ? "warning"
                            : "brand"
                      }
                      label={balance.name}
                    />
                  ) : null}
                  <p className="mt-1.5 text-[0.6875rem] text-ink-3">
                    {days(balance.usedDays)} taken
                    {balance.pendingDays > 0 ? ` · ${days(balance.pendingDays)} pending` : ""}
                    {balance.isPaid ? "" : " · unpaid"}
                  </p>
                </div>
              ))}
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            icon={<CalendarCheck className="size-4" />}
            title="Upcoming leave"
            subtitle="Approved and on the calendar."
          />
          <CardBody>
            {upcoming.length > 0 ? (
              <ul className="space-y-3">
                {upcoming.map((item) => (
                  <li
                    key={item.id}
                    className="rounded-lg border border-line bg-surface-2 p-3"
                  >
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
              <p className="py-6 text-center text-[0.8125rem] text-ink-3">
                No approved leave coming up.
              </p>
            )}
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardHeader
          icon={<Clock className="size-4" />}
          title={`Your requests · ${requests.length}`}
          subtitle="Including your approver's comments."
          actions={
            <LeaveRequestForm
              leaveTypes={leaveTypes}
              balances={balances}
              today={org.today}
            />
          }
        />
        <LeaveList
          requests={requests}
          allowWithdraw
          emptyAction={
            <LeaveRequestForm
              leaveTypes={leaveTypes}
              balances={balances}
              today={org.today}
              trigger="primary"
            />
          }
        />
      </Card>
    </div>
  );
}
