"use client";

import { useState } from "react";
import { Printer, ReceiptText } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/states";
import {
  Table,
  TableScroll,
  TBody,
  TD,
  TH,
  THead,
  TR,
  RecordCard,
  RecordMeta,
} from "@/components/ui/table";
import { days, money, moneyExact, PAYROLL_TONE } from "@/lib/format";
import type { PayslipView } from "@/lib/services/payroll";

import { PayslipDocument } from "./payslip-document";

/**
 * Payslip history with a printable document.
 *
 * "Download" is browser print-to-PDF rather than a bundled PDF library: it needs
 * no extra dependency, produces a correct A4 document, and cannot fail at runtime
 * — the print stylesheet in globals.css does the work.
 */
export function PayslipList({
  payslips,
  employeeName,
  showEmployee = false,
  emptyHint,
  org,
}: {
  payslips: PayslipView[];
  employeeName?: string;
  showEmployee?: boolean;
  emptyHint?: string;
  org?: { companyName: string; legalName: string };
}) {
  const [selected, setSelected] = useState<PayslipView | null>(null);

  return (
    <>
      <Card>
        <CardHeader
          icon={<ReceiptText className="size-4" />}
          title={`Payslips · ${payslips.length}`}
          subtitle={
            payslips.length > 0
              ? "Open any period to see the full breakdown, or print it to PDF."
              : "Nothing generated yet."
          }
        />

        {payslips.length === 0 ? (
          <EmptyState
            icon={<ReceiptText className="size-5" />}
            title="No payslips yet"
            description={
              emptyHint ??
              "Payslips are created when a payroll run is processed for a month with recorded attendance."
            }
            compact
          />
        ) : (
          <>
            <div className="hidden md:block">
              <TableScroll>
                <Table>
                  <THead>
                    <TH width="18%">Period</TH>
                    {showEmployee ? <TH width="22%">Employee</TH> : null}
                    <TH width="12%" align="right">
                      Paid days
                    </TH>
                    <TH width="10%" align="right">
                      LOP
                    </TH>
                    <TH width="14%" align="right">
                      Earnings
                    </TH>
                    <TH width="14%" align="right">
                      Deductions
                    </TH>
                    <TH width="14%" align="right">
                      Net pay
                    </TH>
                    <TH width="10%" align="right">
                      <span className="sr-only">Actions</span>
                    </TH>
                  </THead>
                  <TBody>
                    {payslips.map((payslip) => (
                      <TR key={payslip.id} interactive>
                        <TD nowrap>
                          <span className="font-medium text-ink">{payslip.periodLabel}</span>
                          <Badge
                            tone={PAYROLL_TONE[payslip.runStatus] ?? "neutral"}
                            size="sm"
                            className="ml-2"
                          >
                            {payslip.runStatus.toLowerCase()}
                          </Badge>
                        </TD>
                        {showEmployee ? (
                          <TD>
                            <span className="block truncate font-medium text-ink">
                              {payslip.employeeName}
                            </span>
                            <span className="block truncate text-[0.6875rem] text-ink-3">
                              {payslip.department ?? "Unassigned"}
                            </span>
                          </TD>
                        ) : null}
                        <TD align="right">{payslip.paidDays}</TD>
                        <TD align="right">
                          {payslip.lopDays > 0 ? (
                            <span className="font-medium text-warning-ink">
                              {payslip.lopDays}
                            </span>
                          ) : (
                            <span className="text-ink-4">—</span>
                          )}
                        </TD>
                        <TD align="right">{money(payslip.totalEarnings)}</TD>
                        <TD align="right">{money(payslip.totalDeductions)}</TD>
                        <TD align="right">
                          <span className="font-semibold text-ink">
                            {money(payslip.netPay)}
                          </span>
                        </TD>
                        <TD align="right">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setSelected(payslip)}
                          >
                            <Printer className="size-3.5" />
                            View
                          </Button>
                        </TD>
                      </TR>
                    ))}
                  </TBody>
                </Table>
              </TableScroll>
            </div>

            <div className="md:hidden">
              {payslips.map((payslip) => (
                <RecordCard key={payslip.id}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-[0.875rem] font-semibold text-ink">
                        {payslip.periodLabel}
                      </p>
                      {showEmployee ? (
                        <p className="truncate text-[0.75rem] text-ink-3">
                          {payslip.employeeName}
                        </p>
                      ) : null}
                    </div>
                    <Badge tone={PAYROLL_TONE[payslip.runStatus] ?? "neutral"} size="sm">
                      {payslip.runStatus.toLowerCase()}
                    </Badge>
                  </div>
                  <p className="mt-2 text-xl font-semibold text-ink">
                    {money(payslip.netPay)}
                  </p>
                  <RecordMeta
                    items={[
                      { label: "Earnings", value: money(payslip.totalEarnings) },
                      { label: "Deductions", value: money(payslip.totalDeductions) },
                      { label: "Paid days", value: payslip.paidDays },
                      { label: "Loss of pay", value: days(payslip.lopDays) },
                    ]}
                  />
                  <Button
                    variant="secondary"
                    size="sm"
                    className="mt-3 w-full"
                    onClick={() => setSelected(payslip)}
                  >
                    <Printer className="size-3.5" />
                    View payslip
                  </Button>
                </RecordCard>
              ))}
            </div>
          </>
        )}
      </Card>

      {selected ? (
        <PayslipDocument
          payslip={selected}
          onClose={() => setSelected(null)}
          employeeName={showEmployee ? selected.employeeName : (employeeName ?? selected.employeeName)}
          org={org}
        />
      ) : null}
    </>
  );
}

export { moneyExact };
