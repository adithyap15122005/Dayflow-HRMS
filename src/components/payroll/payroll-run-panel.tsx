"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { BadgeCheck, CircleAlert, Play, TriangleAlert } from "lucide-react";

import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import {
  RecordCard,
  RecordMeta,
  Table,
  TableScroll,
  TBody,
  TD,
  TFootRow,
  TH,
  THead,
  TR,
} from "@/components/ui/table";
import { api, describeError } from "@/lib/client/api";
import { days, money, PAYROLL_TONE } from "@/lib/format";

export type PayrollPreview = {
  period: string;
  periodLabel: string;
  status: string | null;
  rows: {
    employeeId: string;
    name: string;
    employeeCode: string;
    department: string | null;
    avatarColor: string;
    ready: boolean;
    reason: string | null;
    gross: number;
    netPay: number;
    lopDays: number;
    paidDays: number;
    payableDays: number;
  }[];
  totals: {
    headcount: number;
    ready: number;
    blocked: number;
    grossTotal: number;
    netTotal: number;
    lopDays: number;
  };
};

/**
 * Payroll run panel.
 *
 * The register is a *preview* until an administrator commits it: every figure is
 * recomputed from the current salary structures and attendance, blockers are
 * listed explicitly, and processing is confirmed in a dialog because it writes
 * payslips and notifies everyone.
 */
export function PayrollRunPanel({
  preview,
  canRun,
}: {
  preview: PayrollPreview;
  canRun: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [confirm, setConfirm] = useState<"PROCESS" | "MARK_PAID" | null>(null);
  const [busy, setBusy] = useState(false);

  async function run(action: "PROCESS" | "MARK_PAID") {
    setBusy(true);
    try {
      const result = await api.post<{ message: string }>("/api/payroll/run", {
        period: preview.period,
        action,
      });
      toast.success(
        action === "PROCESS" ? "Payroll processed" : "Payroll marked paid",
        result.message,
      );
      setConfirm(null);
      router.refresh();
    } catch (caught) {
      const described = describeError(caught);
      toast.error(described.message, described.hint);
    } finally {
      setBusy(false);
    }
  }

  const canMarkPaid = preview.status === "PROCESSED";
  const isPaid = preview.status === "PAID";

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line bg-surface-2 px-4 py-3 sm:px-5">
        <div className="flex flex-wrap items-center gap-2 text-[0.8125rem]">
          <Badge tone={preview.status ? (PAYROLL_TONE[preview.status] ?? "neutral") : "warning"} dot>
            {preview.status ? preview.status.toLowerCase() : "not started"}
          </Badge>
          <span className="text-ink-2">
            {preview.totals.ready} ready · {preview.totals.blocked} blocked ·{" "}
            {days(preview.totals.lopDays)} loss of pay
          </span>
        </div>

        {canRun ? (
          <div className="flex gap-2">
            {!isPaid ? (
              <Button
                variant={preview.status ? "secondary" : "primary"}
                size="sm"
                onClick={() => setConfirm("PROCESS")}
              >
                <Play className="size-3.5" />
                {preview.status ? "Re-process" : "Process payroll"}
              </Button>
            ) : null}
            {canMarkPaid ? (
              <Button variant="primary" size="sm" onClick={() => setConfirm("MARK_PAID")}>
                <BadgeCheck className="size-3.5" />
                Mark as paid
              </Button>
            ) : null}
            {isPaid ? (
              <Badge tone="success" dot>
                Locked — paid
              </Badge>
            ) : null}
          </div>
        ) : (
          <p className="text-[0.75rem] text-ink-3">
            Only an administrator can process or pay a run.
          </p>
        )}
      </div>

      <div className="hidden md:block">
        <TableScroll>
          <Table>
            <THead>
              <TH width="26%">Employee</TH>
              <TH width="16%">Department</TH>
              <TH width="12%" align="right">
                Payable
              </TH>
              <TH width="10%" align="right">
                LOP
              </TH>
              <TH width="12%" align="right">
                Paid days
              </TH>
              <TH width="12%" align="right">
                Gross
              </TH>
              <TH width="12%" align="right">
                Net pay
              </TH>
            </THead>
            <TBody>
              {preview.rows.map((row) => (
                <TR key={row.employeeId} interactive className={row.ready ? "" : "bg-danger-soft/40"}>
                  <TD>
                    <span className="flex items-center gap-2.5">
                      <Avatar name={row.name} tone={row.avatarColor} size="sm" />
                      <span className="min-w-0">
                        <span className="block truncate font-medium text-ink">{row.name}</span>
                        {row.ready ? (
                          <span className="block truncate font-mono text-[0.6875rem] text-ink-3">
                            {row.employeeCode}
                          </span>
                        ) : (
                          <span className="flex items-center gap-1 text-[0.6875rem] font-medium text-danger-ink">
                            <CircleAlert className="size-3" />
                            {row.reason}
                          </span>
                        )}
                      </span>
                    </span>
                  </TD>
                  <TD>{row.department ?? "—"}</TD>
                  <TD align="right">{row.payableDays}</TD>
                  <TD align="right">
                    {row.lopDays > 0 ? (
                      <span className="font-medium text-warning-ink">{row.lopDays}</span>
                    ) : (
                      <span className="text-ink-4">—</span>
                    )}
                  </TD>
                  <TD align="right">{row.ready ? row.paidDays : "—"}</TD>
                  <TD align="right">{row.ready ? money(row.gross) : "—"}</TD>
                  <TD align="right">
                    {row.ready ? (
                      <span className="font-semibold text-ink">{money(row.netPay)}</span>
                    ) : (
                      <span className="text-ink-4">Skipped</span>
                    )}
                  </TD>
                </TR>
              ))}
            </TBody>
            <TFootRow>
              <TD colSpan={5}>{preview.totals.headcount} employees</TD>
              <TD align="right">{money(preview.totals.grossTotal)}</TD>
              <TD align="right">{money(preview.totals.netTotal)}</TD>
            </TFootRow>
          </Table>
        </TableScroll>
      </div>

      <div className="md:hidden">
        {preview.rows.map((row) => (
          <RecordCard key={row.employeeId}>
            <div className="flex items-start justify-between gap-3">
              <span className="flex min-w-0 items-center gap-2.5">
                <Avatar name={row.name} tone={row.avatarColor} size="sm" />
                <span className="min-w-0">
                  <span className="block truncate font-medium text-ink">{row.name}</span>
                  <span className="block truncate text-[0.75rem] text-ink-3">
                    {row.department ?? "—"}
                  </span>
                </span>
              </span>
              {row.ready ? (
                <span className="shrink-0 font-semibold text-ink">{money(row.netPay)}</span>
              ) : (
                <Badge tone="danger" size="sm">
                  Blocked
                </Badge>
              )}
            </div>
            {row.ready ? (
              <RecordMeta
                items={[
                  { label: "Gross", value: money(row.gross) },
                  { label: "Paid days", value: row.paidDays },
                  { label: "Payable", value: row.payableDays },
                  { label: "Loss of pay", value: days(row.lopDays) },
                ]}
              />
            ) : (
              <p className="mt-2 flex items-center gap-1.5 text-[0.75rem] font-medium text-danger-ink">
                <CircleAlert className="size-3.5" />
                {row.reason}
              </p>
            )}
          </RecordCard>
        ))}
      </div>

      <Modal
        open={confirm !== null}
        onClose={() => setConfirm(null)}
        title={confirm === "PROCESS" ? `Process ${preview.periodLabel} payroll?` : `Mark ${preview.periodLabel} as paid?`}
        size="sm"
        dismissible={!busy}
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirm(null)} disabled={busy}>
              Cancel
            </Button>
            <Button variant="primary" loading={busy} onClick={() => void run(confirm!)}>
              {confirm === "PROCESS" ? "Process payroll" : "Mark as paid"}
            </Button>
          </>
        }
      >
        {confirm === "PROCESS" ? (
          <div className="space-y-3 text-[0.8125rem] leading-relaxed text-ink-2">
            <p>
              This generates {preview.totals.ready} payslips totalling{" "}
              <strong className="text-ink">{money(preview.totals.netTotal)}</strong> net, and
              notifies every affected employee.
            </p>
            {preview.totals.blocked > 0 ? (
              <p className="flex items-start gap-2 rounded-lg border border-warning/25 bg-warning-soft px-3 py-2 text-warning-ink">
                <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
                {preview.totals.blocked} employee
                {preview.totals.blocked > 1 ? "s have" : " has"} no salary structure and will be
                skipped. You can add the structure and re-process afterwards.
              </p>
            ) : null}
            <p className="text-ink-3">
              Re-processing the same period overwrites its payslips. A run that has been marked
              paid is locked and cannot be re-processed.
            </p>
          </div>
        ) : (
          <p className="text-[0.8125rem] leading-relaxed text-ink-2">
            Marking a run as paid locks it, so the payslip history stays trustworthy. Do this
            once the bank transfer has actually gone out.
          </p>
        )}
      </Modal>
    </>
  );
}
