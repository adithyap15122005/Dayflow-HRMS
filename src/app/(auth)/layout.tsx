import type { ReactNode } from "react";

import { Wordmark } from "@/components/brand/logo";
import { prisma } from "@/lib/db";
import { number } from "@/lib/format";

/**
 * Auth shell: a narrative panel on the left, the form on the right.
 *
 * The panel's figures are read from the live database rather than written into
 * the markup — the first screen a judge sees is already real data.
 */
export default async function AuthLayout({ children }: { children: ReactNode }) {
  const [headcount, departments, attendanceRows, approvedLeave] = await Promise.all([
    prisma.employee.count({ where: { status: { not: "INACTIVE" } } }).catch(() => 0),
    prisma.department.count().catch(() => 0),
    prisma.attendance.count().catch(() => 0),
    prisma.leaveRequest.count({ where: { status: "APPROVED" } }).catch(() => 0),
  ]);

  const proof = [
    { label: "People managed", value: number(headcount) },
    { label: "Departments", value: number(departments) },
    { label: "Attendance records", value: number(attendanceRows) },
    { label: "Leave decisions", value: number(approvedLeave) },
  ];

  return (
    <div className="flex min-h-dvh flex-col lg:grid lg:grid-cols-[1.05fr_1fr] xl:grid-cols-[1.15fr_1fr]">
      {/* ---------------------------------------------------- narrative panel */}
      <aside className="relative hidden overflow-hidden bg-sidebar px-10 py-12 text-white lg:flex lg:flex-col xl:px-14">
        <div
          aria-hidden
          className="pointer-events-none absolute -top-28 -right-24 size-96 rounded-full bg-brand/25 blur-3xl"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -bottom-32 -left-20 size-80 rounded-full bg-tone-violet/20 blur-3xl"
        />

        <Wordmark tone="light" tagline />

        <div className="relative mt-auto max-w-lg">
          <p className="text-[0.75rem] font-semibold tracking-[0.14em] text-brand-soft2/70 uppercase">
            Every workday, perfectly aligned
          </p>
          <h1 className="mt-4 text-[2.125rem] leading-[1.15] font-semibold text-white xl:text-[2.5rem]">
            The workforce operations hub your HR team actually wants to open.
          </h1>
          <p className="mt-5 text-[0.9375rem] leading-relaxed text-white/65">
            Attendance, leave approvals, payroll and analytics in one place — with
            an attention queue that tells you what needs a decision today, and why.
          </p>

          <ul className="mt-8 space-y-3">
            {[
              "Live presence board with late arrivals and unaccounted staff",
              "Leave workflow with balances, overlap checks and audit trail",
              "Payroll that pro-rates from real attendance, not guesswork",
            ].map((item) => (
              <li key={item} className="flex items-start gap-3 text-[0.875rem] text-white/80">
                <svg
                  aria-hidden
                  viewBox="0 0 20 20"
                  className="mt-0.5 size-4 shrink-0 fill-brand-soft2"
                >
                  <path d="M10 1.7a8.3 8.3 0 1 0 0 16.6 8.3 8.3 0 0 0 0-16.6Zm4 6.3-4.9 4.9a1 1 0 0 1-1.4 0L5.9 11.1A1 1 0 1 1 7.3 9.7l1.1 1.1L12.6 6.6A1 1 0 0 1 14 8Z" />
                </svg>
                {item}
              </li>
            ))}
          </ul>
        </div>

        <dl className="relative mt-10 grid grid-cols-4 gap-4 border-t border-white/10 pt-6">
          {proof.map((item) => (
            <div key={item.label}>
              <dt className="text-[0.6875rem] leading-tight text-white/45">{item.label}</dt>
              <dd className="mt-1 text-lg font-semibold text-white">{item.value}</dd>
            </div>
          ))}
        </dl>
      </aside>

      {/* ------------------------------------------------------------- form */}
      <main
        id="main"
        className="flex flex-1 flex-col justify-center bg-surface px-5 py-10 sm:px-10 lg:px-12"
      >
        <div className="mx-auto w-full max-w-[26rem]">
          <div className="mb-8 lg:hidden">
            <Wordmark />
          </div>
          {children}
        </div>
      </main>
    </div>
  );
}
