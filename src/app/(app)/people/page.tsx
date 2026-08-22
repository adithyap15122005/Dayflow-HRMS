import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight, Building2, Mail, Phone, Users } from "lucide-react";

import { AddEmployeeDialog } from "@/components/people/add-employee-dialog";
import { DirectoryFilters } from "@/components/people/directory-filters";
import { Avatar, PersonCell } from "@/components/ui/avatar";
import { Badge, CodeChip } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { PageHeader, Pagination } from "@/components/ui/page";
import { Stat, StatRow } from "@/components/ui/stat";
import { EmptyState } from "@/components/ui/states";
import {
  RecordCard,
  RecordMeta,
  SortHeader,
  Table,
  TableScroll,
  TBody,
  TD,
  TH,
  THead,
  TR,
} from "@/components/ui/table";
import { requireActor } from "@/lib/auth/guard";
import { isManagement } from "@/lib/domain/constants";
import { formatWorkDate } from "@/lib/domain/time";
import {
  attendanceLabel,
  ATTENDANCE_TONE,
  EMPLOYEE_TONE,
  employeeStatusLabel,
  employmentTypeLabel,
  percent,
} from "@/lib/format";
import { getOrgContext } from "@/lib/services/org";
import {
  listDepartments,
  listEmployees,
  listManagerOptions,
  nextEmployeeCode,
} from "@/lib/services/people";
import { peopleQuerySchema } from "@/lib/validation";
import type { AttendanceStatus, EmployeeStatus } from "@/lib/domain/constants";

export const metadata: Metadata = {
  title: "People",
  description: "Employee directory, records and onboarding.",
};

export const dynamic = "force-dynamic";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function PeoplePage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const { user, actor } = await requireActor();
  if (!isManagement(user.role)) {
    // Employees have no directory: send them to the record they do own.
    redirect("/profile");
  }

  const raw = await searchParams;
  const flat = Object.fromEntries(
    Object.entries(raw).map(([key, value]) => [
      key,
      Array.isArray(value) ? value[0] : value,
    ]),
  );
  const query = peopleQuerySchema.parse(flat);

  const [page, departments, managers, nextCode, org] = await Promise.all([
    listEmployees(actor, query),
    listDepartments(),
    listManagerOptions(),
    nextEmployeeCode(),
    getOrgContext(),
  ]);

  const presentToday = page.rows.filter((r) =>
    ["PRESENT", "HALF_DAY"].includes(r.todayStatus),
  ).length;
  const onLeaveToday = page.rows.filter((r) => r.todayStatus === "LEAVE").length;
  const probation = page.rows.filter((r) => r.status === "PROBATION").length;

  const sortHref = (key: string) => {
    const next = new URLSearchParams(flat as Record<string, string>);
    const dir = query.sort === key && query.dir === "asc" ? "desc" : "asc";
    next.set("sort", key);
    next.set("dir", dir);
    next.delete("page");
    return `/people?${next.toString()}`;
  };
  const pageHref = (target: number) => {
    const next = new URLSearchParams(flat as Record<string, string>);
    next.set("page", String(target));
    return `/people?${next.toString()}`;
  };

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow={
          <>
            <Building2 className="size-3.5" />
            {departments.length} departments · {org.companyName}
          </>
        }
        title="People"
        description="The single record for every employee: employment details, attendance, leave, payroll and documents — each section respecting who is allowed to see it."
        actions={
          <AddEmployeeDialog
            departments={departments.map((d) => ({ id: d.id, name: d.name }))}
            managers={managers}
            nextCode={nextCode}
            today={org.today}
            viewerRole={user.role}
          />
        }
      />

      <StatRow columns={4}>
        <Stat
          label="Employees on record"
          value={page.total}
          caption={
            query.q || query.departmentId || query.status
              ? "Matching your current filters"
              : "Everyone, including inactive records"
          }
          icon={<Users className="size-4" />}
          emphasis
        />
        <Stat
          label="Present on this page"
          value={`${presentToday}/${page.rows.length}`}
          caption={`${percent(page.rows.length ? (presentToday / page.rows.length) * 100 : 0)} checked in today`}
          tone={presentToday > 0 ? "success" : "neutral"}
        />
        <Stat
          label="On leave today"
          value={onLeaveToday}
          caption="Approved leave covering today"
          tone={onLeaveToday > 0 ? "info" : "neutral"}
        />
        <Stat
          label="On probation"
          value={probation}
          caption="Confirm or extend before the review date"
          tone={probation > 0 ? "warning" : "neutral"}
        />
      </StatRow>

      <Card>
        <DirectoryFilters departments={departments} total={page.total} />

        {page.rows.length === 0 ? (
          <EmptyState
            icon={<Users className="size-5" />}
            title="No employees match those filters"
            description="Try a shorter search term, or clear the filters to see the whole organisation."
          />
        ) : (
          <>
            {/* ------------------------------------------- desktop table */}
            <div className="hidden md:block">
              <TableScroll>
                <Table>
                  <THead>
                    <TH width="26%">
                      <SortHeader
                        label="Employee"
                        active={query.sort === "name"}
                        direction={query.dir}
                        href={sortHref("name")}
                      />
                    </TH>
                    <TH width="18%">
                      <SortHeader
                        label="Role"
                        active={query.sort === "jobTitle"}
                        direction={query.dir}
                        href={sortHref("jobTitle")}
                      />
                    </TH>
                    <TH width="14%">
                      <SortHeader
                        label="Department"
                        active={query.sort === "department"}
                        direction={query.dir}
                        href={sortHref("department")}
                      />
                    </TH>
                    <TH width="12%">
                      <SortHeader
                        label="Status"
                        active={query.sort === "status"}
                        direction={query.dir}
                        href={sortHref("status")}
                      />
                    </TH>
                    <TH width="12%">Today</TH>
                    <TH width="12%">
                      <SortHeader
                        label="Joined"
                        active={query.sort === "joinedAt"}
                        direction={query.dir}
                        href={sortHref("joinedAt")}
                      />
                    </TH>
                    <TH width="6%" align="right">
                      <span className="sr-only">Open</span>
                    </TH>
                  </THead>
                  <TBody>
                    {page.rows.map((row) => (
                      <TR key={row.id} interactive>
                        <TD>
                          <Link
                            href={`/people/${row.id}`}
                            className="flex items-center gap-2.5 rounded"
                          >
                            <Avatar name={row.name} tone={row.avatarColor} size="sm" />
                            <span className="min-w-0">
                              <span className="block truncate font-medium text-ink">
                                {row.name}
                              </span>
                              <span className="block truncate text-[0.75rem] text-ink-3">
                                {row.workEmail}
                              </span>
                            </span>
                          </Link>
                        </TD>
                        <TD>
                          <span className="block truncate text-ink-2">{row.jobTitle}</span>
                          <span className="mt-0.5 block text-[0.6875rem] text-ink-4">
                            {employmentTypeLabel(row.employmentType)}
                            {row.managerName ? ` · reports to ${row.managerName}` : ""}
                          </span>
                        </TD>
                        <TD>{row.department ?? "—"}</TD>
                        <TD>
                          <Badge tone={EMPLOYEE_TONE[row.status as EmployeeStatus]} size="sm" dot>
                            {employeeStatusLabel(row.status)}
                          </Badge>
                        </TD>
                        <TD>
                          <Badge
                            tone={ATTENDANCE_TONE[row.todayStatus as AttendanceStatus]}
                            size="sm"
                          >
                            {attendanceLabel(row.todayStatus)}
                          </Badge>
                        </TD>
                        <TD nowrap>{formatWorkDate(row.joinedAt)}</TD>
                        <TD align="right">
                          <Link
                            href={`/people/${row.id}`}
                            aria-label={`Open ${row.name}'s profile`}
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
            </div>

            {/* -------------------------------------------- mobile cards */}
            <div className="md:hidden">
              {page.rows.map((row) => (
                <RecordCard key={row.id}>
                  <Link href={`/people/${row.id}`} className="block">
                    <div className="flex items-start justify-between gap-3">
                      <PersonCell
                        name={row.name}
                        meta={row.jobTitle}
                        tone={row.avatarColor}
                        size="md"
                        strong
                      />
                      <Badge tone={EMPLOYEE_TONE[row.status as EmployeeStatus]} size="sm">
                        {employeeStatusLabel(row.status)}
                      </Badge>
                    </div>
                    <RecordMeta
                      items={[
                        { label: "Department", value: row.department ?? "—" },
                        {
                          label: "Today",
                          value: (
                            <Badge
                              tone={ATTENDANCE_TONE[row.todayStatus as AttendanceStatus]}
                              size="sm"
                            >
                              {attendanceLabel(row.todayStatus)}
                            </Badge>
                          ),
                        },
                        { label: "Employee ID", value: <CodeChip>{row.employeeCode}</CodeChip> },
                        { label: "Joined", value: formatWorkDate(row.joinedAt) },
                      ]}
                    />
                    <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[0.75rem] text-ink-3">
                      <span className="inline-flex items-center gap-1">
                        <Mail className="size-3" />
                        {row.workEmail}
                      </span>
                      {row.phone ? (
                        <span className="inline-flex items-center gap-1">
                          <Phone className="size-3" />
                          {row.phone}
                        </span>
                      ) : null}
                    </div>
                  </Link>
                </RecordCard>
              ))}
            </div>

            <Pagination
              page={page.page}
              totalPages={page.totalPages}
              total={page.total}
              perPage={page.perPage}
              hrefFor={pageHref}
            />
          </>
        )}
      </Card>
    </div>
  );
}
