"use client";

import { Printer, X } from "lucide-react";

import { LogoMark } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";
import { moneyExact } from "@/lib/format";
import type { PayslipView } from "@/lib/services/payroll";

/**
 * A real, printable payslip.
 *
 * Rendered as a full-screen overlay that the print stylesheet turns into a clean
 * A4 document (`.print-full` strips the overlay chrome). Every figure is read from
 * the stored payslip breakdown, so what prints is exactly what payroll computed.
 */
export function PayslipDocument({
  payslip,
  employeeName,
  onClose,
  org,
}: {
  payslip: PayslipView;
  employeeName: string;
  onClose: () => void;
  org?: { companyName: string; legalName: string };
}) {
  const earnings = payslip.lines.filter((l) => l.kind === "EARNING");
  const deductions = payslip.lines.filter((l) => l.kind === "DEDUCTION");
  const company = org?.companyName ?? "Dayflow";
  const legal = org?.legalName ?? "Dayflow Technologies Pvt. Ltd.";

  return (
    <div className="fixed inset-0 z-100 overflow-y-auto bg-ink/50 p-3 sm:p-6 print:static print:bg-white print:p-0">
      <div className="no-print sticky top-0 z-10 mx-auto mb-3 flex max-w-3xl items-center justify-between gap-3 rounded-lg border border-line bg-surface px-3 py-2 shadow-e2">
        <p className="truncate text-[0.8125rem] font-medium text-ink">
          Payslip · {payslip.periodLabel} · {employeeName}
        </p>
        <div className="flex shrink-0 gap-2">
          <Button variant="primary" size="sm" onClick={() => window.print()}>
            <Printer className="size-3.5" />
            Print / save PDF
          </Button>
          <Button variant="secondary" size="icon-sm" onClick={onClose} aria-label="Close payslip">
            <X className="size-4" />
          </Button>
        </div>
      </div>

      <article className="print-full mx-auto max-w-3xl rounded-xl border border-line bg-surface p-6 shadow-e3 sm:p-9 print:rounded-none print:border-0 print:shadow-none">
        {/* ------------------------------------------------------ header */}
        <header className="flex flex-wrap items-start justify-between gap-4 border-b-2 border-ink pb-4">
          <div className="flex items-start gap-3">
            <LogoMark />
            <div>
              <p className="font-display text-lg leading-none font-semibold text-ink">
                {company}
              </p>
              <p className="mt-1 text-[0.75rem] text-ink-3">{legal}</p>
              <p className="text-[0.75rem] text-ink-3">Bengaluru, Karnataka, India</p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-[0.6875rem] font-semibold tracking-wider text-ink-3 uppercase">
              Payslip
            </p>
            <p className="text-base font-semibold text-ink">{payslip.periodLabel}</p>
            <p className="mt-0.5 text-[0.75rem] text-ink-3">
              {payslip.runStatus === "PAID" ? "Paid" : "Processed"}
              {payslip.processedAt
                ? ` on ${new Date(payslip.processedAt).toLocaleDateString("en-GB")}`
                : ""}
            </p>
          </div>
        </header>

        {/* ---------------------------------------------------- employee */}
        <dl className="mt-5 grid grid-cols-2 gap-x-8 gap-y-2.5 sm:grid-cols-4">
          {[
            ["Employee", employeeName],
            ["Employee ID", payslip.employeeCode],
            ["Designation", payslip.jobTitle],
            ["Department", payslip.department ?? "Unassigned"],
            ["Paid days", String(payslip.paidDays)],
            ["Loss of pay", payslip.lopDays > 0 ? `${payslip.lopDays} days` : "None"],
            ["Currency", payslip.currency],
            ["Period", payslip.period],
          ].map(([label, value]) => (
            <div key={label} className="min-w-0">
              <dt className="text-[0.625rem] font-semibold tracking-wider text-ink-4 uppercase">
                {label}
              </dt>
              <dd className="mt-0.5 truncate text-[0.8125rem] font-medium text-ink">
                {value}
              </dd>
            </div>
          ))}
        </dl>

        {/* --------------------------------------------------- breakdown */}
        <div className="mt-6 grid gap-6 sm:grid-cols-2">
          <section>
            <h3 className="border-b border-line pb-1.5 text-[0.6875rem] font-semibold tracking-wider text-ink uppercase">
              Earnings
            </h3>
            <table className="mt-2 w-full text-[0.8125rem]">
              <tbody>
                {earnings.map((line) => (
                  <tr key={line.key}>
                    <td className="py-1.5 text-ink-2">{line.label}</td>
                    <td className="py-1.5 text-right font-medium text-ink tabular-nums">
                      {moneyExact(line.amount)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-line-2">
                  <th scope="row" className="py-2 text-left font-semibold text-ink">
                    Gross earnings
                  </th>
                  <td className="py-2 text-right font-semibold text-ink tabular-nums">
                    {moneyExact(payslip.totalEarnings)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </section>

          <section>
            <h3 className="border-b border-line pb-1.5 text-[0.6875rem] font-semibold tracking-wider text-ink uppercase">
              Deductions
            </h3>
            <table className="mt-2 w-full text-[0.8125rem]">
              <tbody>
                {deductions.map((line) => (
                  <tr key={line.key}>
                    <td className="py-1.5 text-ink-2">{line.label}</td>
                    <td className="py-1.5 text-right font-medium text-ink tabular-nums">
                      {moneyExact(line.amount)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-line-2">
                  <th scope="row" className="py-2 text-left font-semibold text-ink">
                    Total deductions
                  </th>
                  <td className="py-2 text-right font-semibold text-ink tabular-nums">
                    {moneyExact(payslip.totalDeductions)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </section>
        </div>

        {/* --------------------------------------------------------- net */}
        <div className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-lg border-2 border-ink bg-surface-2 px-4 py-3.5 print-plain">
          <div>
            <p className="text-[0.6875rem] font-semibold tracking-wider text-ink-3 uppercase">
              Net pay for {payslip.periodLabel}
            </p>
            <p className="mt-0.5 text-[0.75rem] text-ink-3">
              Gross earnings less total deductions
            </p>
          </div>
          <p className="text-2xl font-semibold text-ink tabular-nums">
            {moneyExact(payslip.netPay)}
          </p>
        </div>

        <footer className="mt-5 border-t border-line pt-3 text-[0.6875rem] leading-relaxed text-ink-3">
          <p>
            Earnings are pro-rated on payable days (calendar days excluding weekly offs and
            public holidays). {payslip.lopDays > 0
              ? `${payslip.lopDays} day(s) of loss of pay were applied from the attendance record for this period.`
              : "No loss of pay was applied for this period."}{" "}
            Statutory deductions are charged in full.
          </p>
          <p className="mt-1.5">
            This is a computer-generated payslip produced by {company} and does not require a
            signature.
          </p>
        </footer>
      </article>
    </div>
  );
}
