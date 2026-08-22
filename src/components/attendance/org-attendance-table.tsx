"use client";

import Link from "next/link";
import { useState } from "react";
import { Pencil } from "lucide-react";

import { Avatar, PersonCell } from "@/components/ui/avatar";
import { Badge, CodeChip } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/states";
import {
  RecordCard,
  RecordMeta,
  Table,
  TableScroll,
  TBody,
  TD,
  TH,
  THead,
  TR,
} from "@/components/ui/table";
import { formatInstantTime, toClockTime } from "@/lib/domain/time";
import { attendanceLabel, ATTENDANCE_TONE, hours } from "@/lib/format";
import type { AttendanceStatus } from "@/lib/domain/constants";
import { Users } from "lucide-react";

import { AdjustAttendanceDialog, type AdjustTarget } from "./adjust-dialog";

export type OrgAttendanceRow = {
  employeeId: string;
  employeeCode: string;
  name: string;
  jobTitle: string;
  department: string | null;
  avatarColor: string;
  status: string;
  checkInAt: string | null;
  checkOutAt: string | null;
  workedMinutes: number;
  lateMinutes: number;
  derived: boolean;
};

/**
 * Organisation attendance for one day.
 *
 * Rows without a stored record are shown as derived (week off, holiday, approved
 * leave or absent) and can still be corrected — that is how HR closes a gap
 * without a nightly backfill job.
 */
export function OrgAttendanceTable({
  rows,
  workDate,
  timezone,
  canAdjust,
}: {
  rows: OrgAttendanceRow[];
  workDate: string;
  timezone: string;
  canAdjust: boolean;
}) {
  const [target, setTarget] = useState<AdjustTarget | null>(null);

  const openAdjust = (row: OrgAttendanceRow) =>
    setTarget({
      employeeId: row.employeeId,
      employeeName: row.name,
      workDate,
      status: row.status,
      checkIn: row.checkInAt ? toClockTime(new Date(row.checkInAt), timezone) : "",
      checkOut: row.checkOutAt ? toClockTime(new Date(row.checkOutAt), timezone) : "",
      note: "",
    });

  if (rows.length === 0) {
    return (
      <EmptyState
        icon={<Users className="size-5" />}
        title="No attendance rows for these filters"
        description="Try a different date, clear the department filter, or pick another status."
      />
    );
  }

  return (
    <>
      <div className="hidden md:block">
        <TableScroll>
          <Table>
            <THead>
              <TH width="26%">Employee</TH>
              <TH width="14%">Department</TH>
              <TH width="12%">Status</TH>
              <TH width="14%">Check-in</TH>
              <TH width="14%">Check-out</TH>
              <TH width="10%" align="right">
                Hours
              </TH>
              <TH width="10%" align="right">
                {canAdjust ? "Adjust" : "Late"}
              </TH>
            </THead>
            <TBody>
              {rows.map((row) => (
                <TR key={row.employeeId} interactive>
                  <TD>
                    <Link href={`/people/${row.employeeId}`} className="flex items-center gap-2.5">
                      <Avatar name={row.name} tone={row.avatarColor} size="sm" />
                      <span className="min-w-0">
                        <span className="block truncate font-medium text-ink">{row.name}</span>
                        <span className="block truncate text-[0.75rem] text-ink-3">
                          {row.jobTitle}
                        </span>
                      </span>
                    </Link>
                  </TD>
                  <TD>{row.department ?? "—"}</TD>
                  <TD>
                    <Badge tone={ATTENDANCE_TONE[row.status as AttendanceStatus]} size="sm" dot>
                      {attendanceLabel(row.status)}
                    </Badge>
                  </TD>
                  <TD nowrap>
                    <span className="font-mono text-[0.8125rem]">
                      {formatInstantTime(row.checkInAt, timezone)}
                    </span>
                    {row.lateMinutes > 0 ? (
                      <span className="ml-1.5 text-[0.6875rem] font-medium text-warning-ink">
                        +{row.lateMinutes}m
                      </span>
                    ) : null}
                  </TD>
                  <TD nowrap>
                    {row.checkInAt && !row.checkOutAt ? (
                      <Badge tone="success" size="sm" dot live>
                        Working
                      </Badge>
                    ) : (
                      <span className="font-mono text-[0.8125rem]">
                        {formatInstantTime(row.checkOutAt, timezone)}
                      </span>
                    )}
                  </TD>
                  <TD align="right">
                    {row.workedMinutes > 0 ? hours(row.workedMinutes) : "—"}
                  </TD>
                  <TD align="right">
                    {canAdjust ? (
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Adjust ${row.name}'s attendance`}
                        onClick={() => openAdjust(row)}
                      >
                        <Pencil className="size-3.5" />
                      </Button>
                    ) : row.lateMinutes > 0 ? (
                      <span className="text-warning-ink">{row.lateMinutes}m</span>
                    ) : (
                      "—"
                    )}
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </TableScroll>
      </div>

      <div className="md:hidden">
        {rows.map((row) => (
          <RecordCard key={row.employeeId}>
            <div className="flex items-start justify-between gap-3">
              <Link href={`/people/${row.employeeId}`}>
                <PersonCell
                  name={row.name}
                  meta={row.department ?? row.jobTitle}
                  tone={row.avatarColor}
                  size="md"
                  strong
                />
              </Link>
              <Badge tone={ATTENDANCE_TONE[row.status as AttendanceStatus]} size="sm" dot>
                {attendanceLabel(row.status)}
              </Badge>
            </div>
            <RecordMeta
              items={[
                {
                  label: "Check-in",
                  value: formatInstantTime(row.checkInAt, timezone),
                },
                {
                  label: "Check-out",
                  value:
                    row.checkInAt && !row.checkOutAt
                      ? "Working"
                      : formatInstantTime(row.checkOutAt, timezone),
                },
                { label: "Hours", value: row.workedMinutes > 0 ? hours(row.workedMinutes) : "—" },
                { label: "ID", value: <CodeChip>{row.employeeCode}</CodeChip> },
              ]}
            />
            {canAdjust ? (
              <Button
                variant="secondary"
                size="sm"
                className="mt-3 w-full"
                onClick={() => openAdjust(row)}
              >
                <Pencil className="size-3.5" />
                Adjust record
              </Button>
            ) : null}
          </RecordCard>
        ))}
      </div>

      <AdjustAttendanceDialog target={target} onClose={() => setTarget(null)} />
    </>
  );
}
