import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { CalendarDays, ChartColumn, Clock, Users, Wallet } from "lucide-react";

import {
  AttendanceTrendChart,
  HorizontalBarChart,
  PeriodBarChart,
  SharePie,
} from "@/components/charts";
import { ReportControls } from "@/components/reports/report-controls";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page";
import { Stat, StatRow } from "@/components/ui/stat";
import { EmptyState } from "@/components/ui/states";
import { Tabs } from "@/components/ui/tabs";
import {
  Table,
  TableScroll,
  TBody,
  TD,
  TFootRow,
  TH,
  THead,
  TR,
} from "@/components/ui/table";
import { requireActor } from "@/lib/auth/guard";
import { isManagement } from "@/lib/domain/constants";
import { formatWorkDate, startOfMonth } from "@/lib/domain/time";
import { money, number as fmtNumber } from "@/lib/format";
import { getOrgContext } from "@/lib/services/org";
import { listDepartments } from "@/lib/services/people";
import {
  attendanceReport,
  headcountReport,
  leaveReport,
  payrollReport,
  type ReportTable,
} from "@/lib/services/reports";
import { reportQuerySchema } from "@/lib/validation";

export const metadata: Metadata = {
  title: "Reports",
  description: "Attendance, leave, payroll and headcount analytics with CSV export.",
};

export const dynamic = "force-dynamic";

const REPORTS = [
  { id: "attendance", label: "Attendance", icon: <Clock className="size-3.5" /> },
  { id: "leave", label: "Leave", icon: <CalendarDays className="size-3.5" /> },
  { id: "payroll", label: "Payroll", icon: <Wallet className="size-3.5" /> },
  { id: "headcount", label: "Headcount", icon: <Users className="size-3.5" /> },
];

const QUESTIONS: Record<string, string> = {
  attendance:
    "Who is showing up, who is not, and is the trend improving? Rates exclude weekly offs and public holidays.",
  leave:
    "How much leave is being consumed, by whom and of which type — including requests still awaiting a decision.",
  payroll:
    "What did a period actually cost, and how much was lost to unpaid absence?",
  headcount:
    "How is the organisation shaped, and how has it grown month by month?",
};

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { user, actor } = await requireActor();
  if (!isManagement(user.role)) redirect("/overview");

  const raw = await searchParams;
  const flat = Object.fromEntries(
    Object.entries(raw).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v]),
  );
  const query = reportQuerySchema.parse(flat);
  const org = await getOrgContext();
  const departments = await listDepartments();

  const filters = {
    from: query.from,
    to: query.to,
    departmentId: query.departmentId,
    employeeId: query.employeeId,
    status: query.status,
  };

  const attendance = query.report === "attendance" ? await attendanceReport(actor, filters) : null;
  const leave = query.report === "leave" ? await leaveReport(actor, filters) : null;
  const payroll = query.report === "payroll" ? await payrollReport(actor, filters) : null;
  const headcount = query.report === "headcount" ? await headcountReport(actor) : null;

  const table: ReportTable =
    attendance?.table ?? leave?.table ?? payroll?.table ?? headcount!.table;
  const range =
    attendance?.range ?? leave?.range ?? { from: startOfMonth(org.today), to: org.today };

  const hrefFor = (id: string) => {
    const next = new URLSearchParams(flat as Record<string, string>);
    next.set("report", id);
    next.delete("status");
    return `/reports?${next.toString()}`;
  };

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow={
          <>
            <ChartColumn className="size-3.5" />
            Every figure is a count or an average over stored records
          </>
        }
        title="Reports"
        description={QUESTIONS[query.report]}
      />

      {/* -------------------------------------------- report-specific charts */}
      {attendance ? (
        <>
          <StatRow columns={4}>
            <Stat
              label="Present days"
              value={fmtNumber(Number(table.totals?.present ?? 0))}
              caption={`Across ${table.rows.length} employees, ${range.from} to ${range.to}`}
              tone="success"
              emphasis
            />
            <Stat
              label="Absent days"
              value={fmtNumber(Number(table.totals?.absent ?? 0))}
              caption="No record and no approved leave"
              tone="danger"
            />
            <Stat
              label="Leave days"
              value={fmtNumber(Number(table.totals?.leave ?? 0))}
              caption="Approved leave inside the range"
              tone="info"
            />
            <Stat
              label="Hours logged"
              value={fmtNumber(Number(table.totals?.hours ?? 0))}
              caption={`Average rate ${table.totals?.ratePct ?? 0}%`}
              tone="brand"
            />
          </StatRow>

          <Card>
            <CardHeader
              icon={<ChartColumn className="size-4" />}
              title="Attendance trend"
              subtitle="Stacked headcount by status; the line is the presence rate."
            />
            <CardBody className="pt-2">
              <AttendanceTrendChart data={attendance.trend} height={240} />
            </CardBody>
          </Card>
        </>
      ) : null}

      {leave ? (
        <>
          <StatRow columns={4}>
            <Stat
              label="Requests"
              value={leave.utilisation.totalRequests}
              caption={`${range.from} to ${range.to}`}
              emphasis
            />
            <Stat
              label="Approved days"
              value={leave.utilisation.totalDays}
              caption="Working days only — weekends excluded"
              tone="info"
            />
            <Stat
              label="Leave types used"
              value={leave.utilisation.byType.length}
              caption="Of the configured types"
            />
            <Stat
              label="Departments affected"
              value={leave.utilisation.byDepartment.length}
              caption="With at least one approved day"
            />
          </StatRow>

          <div className="grid gap-5 xl:grid-cols-2">
            <Card>
              <CardHeader
                icon={<CalendarDays className="size-4" />}
                title="Days by leave type"
                subtitle="Which entitlements actually get used?"
              />
              <CardBody className="pt-2">
                {leave.utilisation.byType.length > 0 ? (
                  <HorizontalBarChart
                    data={leave.utilisation.byType.map((t) => ({ name: t.name, days: t.days }))}
                    labelKey="name"
                    valueKey="days"
                    tone="leave"
                    height={200}
                    valueLabel="days"
                  />
                ) : (
                  <EmptyState
                    title="No approved leave in range"
                    description="Widen the date range or approve a pending request."
                    compact
                  />
                )}
              </CardBody>
            </Card>
            <Card>
              <CardHeader
                icon={<Users className="size-4" />}
                title="Days by department"
                subtitle="Where capacity is being lost."
              />
              <CardBody className="pt-2">
                {leave.utilisation.byDepartment.length > 0 ? (
                  <HorizontalBarChart
                    data={leave.utilisation.byDepartment}
                    labelKey="department"
                    valueKey="days"
                    tone="present"
                    height={200}
                    valueLabel="days"
                  />
                ) : (
                  <EmptyState
                    title="Nothing to compare"
                    description="Departmental leave appears once requests are approved."
                    compact
                  />
                )}
              </CardBody>
            </Card>
          </div>
        </>
      ) : null}

      {payroll ? (
        <>
          <StatRow columns={4}>
            <Stat
              label="Net paid"
              value={money(Number(table.totals?.netPay ?? 0))}
              caption={`${table.rows.length} payslips in ${payroll.period}`}
              tone="success"
              emphasis
            />
            <Stat
              label="Gross earnings"
              value={money(Number(table.totals?.earnings ?? 0))}
              caption="After loss-of-pay pro-rating"
              tone="brand"
            />
            <Stat
              label="Deductions"
              value={money(Number(table.totals?.deductions ?? 0))}
              caption="PF, professional tax, insurance"
              tone="danger"
            />
            <Stat
              label="Loss of pay"
              value={`${table.totals?.lopDays ?? 0} days`}
              caption="Unpaid absence charged in this period"
              tone={Number(table.totals?.lopDays ?? 0) > 0 ? "warning" : "neutral"}
            />
          </StatRow>

          <div className="grid gap-5 xl:grid-cols-2">
            <Card>
              <CardHeader
                icon={<Wallet className="size-4" />}
                title="Net pay by period"
                subtitle="Trend of what actually left the account."
              />
              <CardBody className="pt-2">
                {payroll.overview.netByPeriod.length > 0 ? (
                  <PeriodBarChart data={payroll.overview.netByPeriod} height={210} />
                ) : (
                  <EmptyState
                    title="No processed periods"
                    description="Process a payroll run to populate this chart."
                    compact
                  />
                )}
              </CardBody>
            </Card>
            <Card>
              <CardHeader
                icon={<Users className="size-4" />}
                title="Cost by department"
                subtitle="Share of the monthly commitment."
              />
              <CardBody className="pt-2">
                {payroll.overview.byDepartment.length > 0 ? (
                  <SharePie
                    data={payroll.overview.byDepartment.map((d) => ({
                      department: d.department,
                      gross: d.gross,
                    }))}
                    nameKey="department"
                    valueKey="gross"
                    height={210}
                    asMoney
                  />
                ) : (
                  <EmptyState
                    title="No salary structures"
                    description="Add structures to see the departmental split."
                    compact
                  />
                )}
              </CardBody>
            </Card>
          </div>
        </>
      ) : null}

      {headcount ? (
        <>
          <StatRow columns={4}>
            <Stat
              label="Employed"
              value={headcount.stats.total}
              caption={`Across ${headcount.stats.byDepartment.length} departments`}
              emphasis
            />
            <Stat
              label="Records on file"
              value={table.rows.length}
              caption="Including inactive employees"
            />
            <Stat
              label="Joined this month"
              value={headcount.growth[headcount.growth.length - 1]?.joiners ?? 0}
              caption={headcount.growth[headcount.growth.length - 1]?.label ?? ""}
              tone="success"
            />
            <Stat
              label="Salary commitment"
              value={money(Number(table.totals?.gross ?? 0))}
              caption="Sum of gross across all records"
              tone="brand"
            />
          </StatRow>

          <div className="grid gap-5 xl:grid-cols-2">
            <Card>
              <CardHeader
                icon={<ChartColumn className="size-4" />}
                title="Headcount growth"
                subtitle="Joiners per month over the last year, derived from joining dates."
              />
              <CardBody className="pt-2">
                <HorizontalBarChart
                  data={headcount.growth.filter((g) => g.joiners > 0).map((g) => ({
                    label: g.label,
                    joiners: g.joiners,
                  }))}
                  labelKey="label"
                  valueKey="joiners"
                  tone="present"
                  height={220}
                  valueLabel="joiners"
                />
              </CardBody>
            </Card>
            <Card>
              <CardHeader
                icon={<Users className="size-4" />}
                title="Shape of the organisation"
                subtitle="Employed staff per department."
              />
              <CardBody className="pt-2">
                <SharePie
                  data={headcount.stats.byDepartment}
                  nameKey="department"
                  valueKey="count"
                  height={220}
                />
              </CardBody>
            </Card>
          </div>
        </>
      ) : null}

      {/* ------------------------------------------------------- the table */}
      <Card>
        <Tabs tabs={REPORTS} active={query.report} hrefFor={hrefFor} />
        <CardHeader title={table.title} subtitle={table.subtitle} dense />
        <ReportControls
          report={query.report}
          departments={departments.map((d) => ({ id: d.id, name: d.name }))}
          from={query.from ?? range.from}
          to={query.to ?? range.to}
          today={org.today}
          showRange={query.report !== "headcount"}
        />

        {table.rows.length === 0 ? (
          <EmptyState
            icon={<ChartColumn className="size-5" />}
            title="No rows for these filters"
            description="Widen the date range, clear the department filter, or pick a different report."
          />
        ) : (
          <TableScroll>
            <Table>
              <THead>
                {table.columns.map((column) => (
                  <TH key={column.key} align={column.align === "right" ? "right" : "left"}>
                    {column.label}
                  </TH>
                ))}
              </THead>
              <TBody>
                {table.rows.map((row, index) => (
                  <TR key={index} interactive>
                    {table.columns.map((column) => (
                      <TD
                        key={column.key}
                        align={column.align === "right" ? "right" : "left"}
                        nowrap={column.align === "right"}
                      >
                        {formatCell(column.key, row[column.key])}
                      </TD>
                    ))}
                  </TR>
                ))}
              </TBody>
              {table.totals ? (
                <TFootRow>
                  {table.columns.map((column) => (
                    <TD
                      key={column.key}
                      align={column.align === "right" ? "right" : "left"}
                      nowrap
                    >
                      {formatCell(column.key, table.totals?.[column.key] ?? "")}
                    </TD>
                  ))}
                </TFootRow>
              ) : null}
            </Table>
          </TableScroll>
        )}
      </Card>

      <p className="px-1 text-[0.75rem] text-ink-3">
        Generated {formatWorkDate(org.today, "long")} from live records. CSV exports contain the
        same rows, totals row included.
      </p>
    </div>
  );
}

const MONEY_KEYS = new Set(["earnings", "deductions", "netPay", "gross"]);

function formatCell(key: string, value: string | number | undefined) {
  if (value === undefined || value === "") return "—";
  if (MONEY_KEYS.has(key) && typeof value === "number") return money(value);
  if (key === "status") return String(value).toLowerCase().replace("_", " ");
  return value;
}
