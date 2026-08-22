import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Banknote, ChartColumn, Coins, ReceiptText, Wallet } from "lucide-react";

import { PeriodBarChart, SharePie } from "@/components/charts";
import { PayrollRunPanel } from "@/components/payroll/payroll-run-panel";
import { PayslipList } from "@/components/payroll/payslip-list";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page";
import { MiniStat, Stat, StatRow } from "@/components/ui/stat";
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
import { getCurrentUser, requireActor } from "@/lib/auth/guard";
import { isManagement } from "@/lib/domain/constants";
import { addPeriods, formatPeriod, formatWorkDate, periodOf } from "@/lib/domain/time";
import { money, moneyCompact, PAYROLL_TONE, percent } from "@/lib/format";
import {
  getPayrollOverview,
  getSalaryStructure,
  listPayslips,
  listSalaryStructures,
  previewPayrollRun,
} from "@/lib/services/payroll";
import { getOrgContext } from "@/lib/services/org";

/**
 * The page description differs by role, because the two views genuinely differ:
 * an employee sees only their own compensation, management sees the whole run.
 */
export async function generateMetadata(): Promise<Metadata> {
  const user = await getCurrentUser();
  return user && isManagement(user.role)
    ? {
        title: "Payroll",
        description: "Salary structures, payroll runs and the payslip register.",
      }
    : {
        title: "My payroll",
        description: "Your salary structure and payslips, visible only to you and HR.",
      };
}

export const dynamic = "force-dynamic";

export default async function PayrollPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string }>;
}) {
  const { user, actor } = await requireActor();
  const { period: requested } = await searchParams;
  const org = await getOrgContext();

  return isManagement(user.role) ? (
    <OrgPayroll
      actorRole={user.role === "ADMIN" ? "ADMIN" : "HR"}
      requested={requested}
      org={org}
      actor={actor}
    />
  ) : (
    <MyPayroll actor={actor} org={org} />
  );
}

/* ============================================================== employee */

async function MyPayroll({
  actor,
  org,
}: {
  actor: { employeeId: string | null; role: "ADMIN" | "HR" | "EMPLOYEE"; userId: string };
  org: Awaited<ReturnType<typeof getOrgContext>>;
}) {
  if (!actor.employeeId) {
    return (
      <EmptyState
        icon={<Wallet className="size-5" />}
        title="No employee record"
        description="Your account is not linked to an employee profile, so there is no compensation to show."
      />
    );
  }

  const [salary, payslips] = await Promise.all([
    getSalaryStructure(actor, actor.employeeId),
    listPayslips(actor, { employeeId: actor.employeeId, take: 24 }),
  ]);

  const latest = payslips[0] ?? null;
  const ytd = payslips
    .filter((p) => p.period.startsWith(org.today.slice(0, 4)))
    .reduce((sum, p) => sum + p.netPay, 0);
  const nextPayDate = `${periodOf(org.today)}-${String(org.payrollDayOfMonth).padStart(2, "0")}`;

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow={
          <>
            <Wallet className="size-3.5" />
            Read-only · visible to you and HR only
          </>
        }
        title="My payroll"
        description="Your salary structure and every payslip Dayflow has generated. Earnings are pro-rated from your own attendance, so each figure traces back to a recorded day."
      />

      {salary ? (
        <>
          <StatRow columns={4}>
            <Stat
              label="Gross / month"
              value={money(salary.gross)}
              caption="Basic, HRA and allowances"
              icon={<Coins className="size-4" />}
              tone="brand"
              emphasis
            />
            <Stat
              label="Deductions / month"
              value={money(salary.deductions)}
              caption="PF, professional tax, insurance"
              tone="danger"
            />
            <Stat
              label="Net / month"
              value={money(salary.netMonthly)}
              caption="Before any loss of pay"
              tone="success"
            />
            <Stat
              label="Paid this year"
              value={money(ytd)}
              caption={`Across ${payslips.filter((p) => p.period.startsWith(org.today.slice(0, 4))).length} payslips`}
              icon={<Banknote className="size-4" />}
            />
          </StatRow>

          <div className="grid gap-5 xl:grid-cols-3">
            <Card className="xl:col-span-2">
              <CardHeader
                icon={<Coins className="size-4" />}
                title="Salary structure"
                subtitle={`Revision ${salary.revision} · effective ${formatWorkDate(salary.effectiveFrom)}. Changes are made by HR and you are notified each time.`}
              />
              <CardBody>
                <div className="grid gap-6 sm:grid-cols-2">
                  <div>
                    <h3 className="mb-2 text-[0.6875rem] font-semibold tracking-wider text-success-ink uppercase">
                      Earnings
                    </h3>
                    <ul>
                      {[
                        ["Basic salary", salary.basic],
                        ["House rent allowance", salary.hra],
                        ["Special allowance", salary.specialAllowance],
                        ["Transport allowance", salary.transportAllow],
                      ].map(([label, value]) => (
                        <li
                          key={label as string}
                          className="flex items-baseline justify-between gap-3 border-b border-line py-2 text-[0.8125rem] last:border-0"
                        >
                          <span className="text-ink-2">{label}</span>
                          <span className="font-medium text-ink">{money(value as number)}</span>
                        </li>
                      ))}
                      <li className="flex items-baseline justify-between gap-3 border-t-2 border-line-2 pt-2 text-[0.8125rem] font-semibold">
                        <span>Gross</span>
                        <span>{money(salary.gross)}</span>
                      </li>
                    </ul>
                  </div>
                  <div>
                    <h3 className="mb-2 text-[0.6875rem] font-semibold tracking-wider text-danger-ink uppercase">
                      Deductions
                    </h3>
                    <ul>
                      {[
                        ["Provident fund", salary.providentFund],
                        ["Professional tax", salary.professionalTax],
                        ["Health insurance", salary.healthInsurance],
                      ].map(([label, value]) => (
                        <li
                          key={label as string}
                          className="flex items-baseline justify-between gap-3 border-b border-line py-2 text-[0.8125rem] last:border-0"
                        >
                          <span className="text-ink-2">{label}</span>
                          <span className="font-medium text-ink">{money(value as number)}</span>
                        </li>
                      ))}
                      <li className="flex items-baseline justify-between gap-3 border-t-2 border-line-2 pt-2 text-[0.8125rem] font-semibold">
                        <span>Total</span>
                        <span>{money(salary.deductions)}</span>
                      </li>
                    </ul>
                  </div>
                </div>
              </CardBody>
            </Card>

            <Card>
              <CardHeader
                icon={<ReceiptText className="size-4" />}
                title="Latest payslip"
                subtitle={latest ? latest.periodLabel : "None generated yet"}
              />
              <CardBody className="space-y-3">
                {latest ? (
                  <>
                    <p className="text-[0.6875rem] font-semibold tracking-wider text-ink-4 uppercase">
                      Net pay
                    </p>
                    <p className="-mt-2 text-[1.75rem] leading-8 font-semibold text-ink">
                      {money(latest.netPay)}
                    </p>
                    <div className="grid grid-cols-2 gap-2">
                      <MiniStat label="Earnings" value={money(latest.totalEarnings)} tone="success" />
                      <MiniStat label="Deductions" value={money(latest.totalDeductions)} tone="danger" />
                      <MiniStat label="Paid days" value={latest.paidDays} />
                      <MiniStat
                        label="Loss of pay"
                        value={latest.lopDays}
                        tone={latest.lopDays > 0 ? "warning" : "neutral"}
                      />
                    </div>
                    <Badge tone={PAYROLL_TONE[latest.runStatus] ?? "neutral"} dot>
                      {latest.runStatus.toLowerCase()}
                    </Badge>
                  </>
                ) : (
                  <p className="text-[0.8125rem] text-ink-3">
                    Your first payslip appears once HR processes a run for a month you worked.
                  </p>
                )}
                <p className="border-t border-line pt-3 text-[0.75rem] text-ink-3">
                  Next payroll date: {formatWorkDate(nextPayDate, "long")}
                </p>
              </CardBody>
            </Card>
          </div>
        </>
      ) : (
        <Card>
          <EmptyState
            icon={<Wallet className="size-5" />}
            title="No salary structure yet"
            description="HR has not published your compensation details. Until then, payroll will not include you — reach out to your HR contact."
          />
        </Card>
      )}

      <PayslipList
        payslips={payslips}
        org={{ companyName: org.companyName, legalName: org.legalName }}
        emptyHint="Payslips appear here once HR processes a payroll run for a month you worked."
      />
    </div>
  );
}

/* ============================================================ management */

async function OrgPayroll({
  actorRole,
  requested,
  org,
  actor,
}: {
  actorRole: "ADMIN" | "HR";
  requested: string | undefined;
  org: Awaited<ReturnType<typeof getOrgContext>>;
  actor: { employeeId: string | null; role: "ADMIN" | "HR" | "EMPLOYEE"; userId: string };
}) {
  const currentPeriod = periodOf(org.today);
  const period = /^\d{4}-(0[1-9]|1[0-2])$/.test(requested ?? "")
    ? (requested as string)
    : currentPeriod;

  const [overview, preview, structures, payslips] = await Promise.all([
    getPayrollOverview(org),
    previewPayrollRun(actor, period),
    listSalaryStructures(actor),
    listPayslips(actor, { period, take: 60 }),
  ]);

  const missing = structures.filter((s) => !s.salary);
  const periodOptions = [0, -1, -2, -3].map((offset) => addPeriods(currentPeriod, offset));

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow={
          <>
            <Wallet className="size-3.5" />
            {org.companyName} · {org.currency} · payday {org.payrollDayOfMonth} of the month
          </>
        }
        title="Payroll"
        description="Salary structures, the monthly run and the payslip register. Loss of pay is derived from attendance, so payroll and the attendance board can never disagree."
        actions={
          <div className="flex flex-wrap gap-2">
            {periodOptions.map((option) => (
              <Link
                key={option}
                href={`/payroll?period=${option}`}
                className={`inline-flex h-8 items-center rounded-md border px-3 text-[0.8125rem] font-medium transition-colors ${
                  option === period
                    ? "border-brand bg-brand text-white"
                    : "border-line-2 bg-surface text-ink-2 hover:bg-surface-2"
                }`}
              >
                {formatPeriod(option)}
              </Link>
            ))}
          </div>
        }
      />

      <StatRow columns={4}>
        <Stat
          label="Monthly commitment"
          value={money(overview.monthlyCommitment)}
          caption={`${structures.length - missing.length} structures on file · ${money(overview.averageGross)} average gross`}
          icon={<Coins className="size-4" />}
          tone="brand"
          emphasis
        />
        <Stat
          label={`${formatPeriod(period)} net`}
          value={money(preview.totals.netTotal)}
          caption={`${preview.totals.ready} ready · ${preview.totals.blocked} blocked`}
          icon={<Banknote className="size-4" />}
          tone={preview.totals.blocked > 0 ? "warning" : "success"}
        />
        <Stat
          label="Annual commitment"
          value={moneyCompact(overview.annualCommitment)}
          caption="Current gross × 12, employed staff only"
        />
        <Stat
          label="Run status"
          value={preview.status ? preview.status.toLowerCase() : "not started"}
          caption={
            preview.status === "PAID"
              ? "Locked — the register cannot be re-processed"
              : preview.status === "PROCESSED"
                ? "Awaiting confirmation of payment"
                : "No payslips generated for this period yet"
          }
          tone={
            preview.status === "PAID"
              ? "success"
              : preview.status === "PROCESSED"
                ? "info"
                : "warning"
          }
        />
      </StatRow>

      <Card>
        <CardHeader
          icon={<Banknote className="size-4" />}
          title={`Payroll run — ${formatPeriod(period)}`}
          subtitle="A live preview: gross from the salary structure, loss of pay from attendance. Nothing is stored until an administrator processes it."
        />
        <PayrollRunPanel preview={preview} canRun={actorRole === "ADMIN"} />
      </Card>

      <div className="grid gap-5 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader
            icon={<ChartColumn className="size-4" />}
            title="Net pay by period"
            subtitle="What has actually gone out of the door?"
          />
          <CardBody className="pt-2">
            {overview.netByPeriod.length > 0 ? (
              <PeriodBarChart data={overview.netByPeriod} height={210} />
            ) : (
              <EmptyState
                title="No processed periods yet"
                description="Process a payroll run and its total appears here."
                compact
              />
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            icon={<Coins className="size-4" />}
            title="Cost by department"
            subtitle="Where the salary commitment sits."
          />
          <CardBody className="pt-2">
            {overview.byDepartment.length > 0 ? (
              <SharePie
                data={overview.byDepartment.map((d) => ({
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
                description="Add salary structures to see the departmental split."
                compact
              />
            )}
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardHeader
          icon={<Coins className="size-4" />}
          title={`Salary structures · ${structures.length}`}
          subtitle={
            missing.length > 0
              ? `${missing.length} employee${missing.length > 1 ? "s" : ""} still have no structure and are skipped by payroll.`
              : "Every employed person has a published structure."
          }
        />
        <TableScroll>
          <Table>
            <THead>
              <TH width="28%">Employee</TH>
              <TH width="16%">Department</TH>
              <TH width="12%" align="right">
                Basic
              </TH>
              <TH width="12%" align="right">
                Gross
              </TH>
              <TH width="12%" align="right">
                Deductions
              </TH>
              <TH width="12%" align="right">
                Annual CTC
              </TH>
              <TH width="8%" align="right">
                <span className="sr-only">Open</span>
              </TH>
            </THead>
            <TBody>
              {structures.map((row) => (
                <TR key={row.employeeId} interactive className={row.salary ? "" : "bg-danger-soft/40"}>
                  <TD>
                    <Link
                      href={`/people/${row.employeeId}?tab=payroll`}
                      className="flex items-center gap-2.5"
                    >
                      <Avatar name={row.name} tone={row.avatarColor} size="sm" />
                      <span className="min-w-0">
                        <span className="block truncate font-medium text-ink">{row.name}</span>
                        <span className="block truncate text-[0.6875rem] text-ink-3">
                          {row.jobTitle}
                        </span>
                      </span>
                    </Link>
                  </TD>
                  <TD>{row.department ?? "—"}</TD>
                  <TD align="right">{row.salary ? money(row.salary.basic) : "—"}</TD>
                  <TD align="right">
                    {row.salary ? (
                      <span className="font-medium text-ink">{money(row.salary.gross)}</span>
                    ) : (
                      <Badge tone="danger" size="sm">
                        Not set
                      </Badge>
                    )}
                  </TD>
                  <TD align="right">{row.salary ? money(row.salary.deductions) : "—"}</TD>
                  <TD align="right">{row.salary ? moneyCompact(row.salary.annualCtc) : "—"}</TD>
                  <TD align="right">
                    <Link
                      href={`/people/${row.employeeId}?tab=payroll`}
                      aria-label={`Open ${row.name}'s payroll`}
                      className="inline-grid size-8 place-items-center rounded-md text-ink-4 transition-colors hover:bg-surface-3 hover:text-brand"
                    >
                      <ArrowRight className="size-4" />
                    </Link>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </TableScroll>
      </Card>

      <PayslipList
        payslips={payslips}
        showEmployee
        org={{ companyName: org.companyName, legalName: org.legalName }}
        emptyHint={`No payslips exist for ${formatPeriod(period)} yet. Process the run above to generate them.`}
      />

      <p className="px-1 text-[0.75rem] text-ink-3">
        Coverage: {percent(
          structures.length > 0
            ? ((structures.length - missing.length) / structures.length) * 100
            : 0,
        )}{" "}
        of employed staff have a salary structure.
      </p>
    </div>
  );
}
