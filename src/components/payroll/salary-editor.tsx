"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Coins, Pencil } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Field, FormError, Input } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { api, describeError } from "@/lib/client/api";
import { money } from "@/lib/format";

export type SalaryInput = {
  basic: number;
  hra: number;
  specialAllowance: number;
  transportAllow: number;
  providentFund: number;
  professionalTax: number;
  healthInsurance: number;
};

const EARNINGS: { key: keyof SalaryInput; label: string; hint?: string }[] = [
  { key: "basic", label: "Basic salary", hint: "Must be at least 30% of gross" },
  { key: "hra", label: "House rent allowance" },
  { key: "specialAllowance", label: "Special allowance" },
  { key: "transportAllow", label: "Transport allowance" },
];

const DEDUCTIONS: { key: keyof SalaryInput; label: string }[] = [
  { key: "providentFund", label: "Provident fund" },
  { key: "professionalTax", label: "Professional tax" },
  { key: "healthInsurance", label: "Health insurance" },
];

/**
 * Salary structure editor.
 *
 * Totals recalculate as you type using the same arithmetic the payslip uses, and
 * the guard rails (basic ≥ 30% of gross, deductions < gross) are shown live before
 * the server re-validates them.
 */
export function SalaryEditor({
  employeeId,
  employeeName,
  initial,
  effectiveFrom,
  revision,
}: {
  employeeId: string;
  employeeName: string;
  initial: SalaryInput | null;
  effectiveFrom: string;
  revision: number | null;
}) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ message: string; hint?: string } | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});

  const [form, setForm] = useState<Record<keyof SalaryInput, string>>({
    basic: String(initial?.basic ?? ""),
    hra: String(initial?.hra ?? ""),
    specialAllowance: String(initial?.specialAllowance ?? ""),
    transportAllow: String(initial?.transportAllow ?? ""),
    providentFund: String(initial?.providentFund ?? ""),
    professionalTax: String(initial?.professionalTax ?? ""),
    healthInsurance: String(initial?.healthInsurance ?? ""),
  });
  const [from, setFrom] = useState(effectiveFrom);

  const totals = useMemo(() => {
    const num = (key: keyof SalaryInput) => Number(form[key] || 0);
    const gross =
      num("basic") + num("hra") + num("specialAllowance") + num("transportAllow");
    const deductions =
      num("providentFund") + num("professionalTax") + num("healthInsurance");
    return {
      gross,
      deductions,
      net: gross - deductions,
      annual: gross * 12,
      basicShare: gross > 0 ? (num("basic") / gross) * 100 : 0,
    };
  }, [form]);

  const warning =
    totals.gross > 0 && totals.basicShare < 30
      ? `Basic is ${totals.basicShare.toFixed(0)}% of gross — it must be at least 30%.`
      : totals.deductions >= totals.gross && totals.gross > 0
        ? "Deductions cannot be greater than or equal to gross pay."
        : null;

  const set = (key: keyof SalaryInput, value: string) => {
    setForm((current) => ({ ...current, [key]: value }));
    setFields((current) => {
      if (!current[key]) return current;
      const next = { ...current };
      delete next[key];
      return next;
    });
  };

  async function submit() {
    setBusy(true);
    setError(null);
    setFields({});
    try {
      const result = await api.put<{ message: string }>(
        `/api/employees/${employeeId}/salary`,
        {
          basic: Number(form.basic || 0),
          hra: Number(form.hra || 0),
          specialAllowance: Number(form.specialAllowance || 0),
          transportAllow: Number(form.transportAllow || 0),
          providentFund: Number(form.providentFund || 0),
          professionalTax: Number(form.professionalTax || 0),
          healthInsurance: Number(form.healthInsurance || 0),
          effectiveFrom: from,
        },
      );
      toast.success("Salary structure saved", result.message);
      setOpen(false);
      router.refresh();
    } catch (caught) {
      const described = describeError(caught);
      setError({ message: described.message, hint: described.hint });
      if (described.fields) setFields(described.fields);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Button variant={initial ? "secondary" : "primary"} size="sm" onClick={() => setOpen(true)}>
        {initial ? <Pencil className="size-3.5" /> : <Coins className="size-3.5" />}
        {initial ? "Revise salary" : "Set salary structure"}
      </Button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={initial ? `Revise salary — ${employeeName}` : `Set salary — ${employeeName}`}
        description={
          initial
            ? `Currently revision ${revision}. Saving creates the next revision and notifies the employee.`
            : "Monthly components. Payroll pro-rates earnings from attendance; deductions are charged in full."
        }
        size="lg"
        dismissible={!busy}
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)} disabled={busy}>
              Cancel
            </Button>
            <Button
              variant="primary"
              loading={busy}
              onClick={() => void submit()}
              disabled={Boolean(warning)}
            >
              Save structure
            </Button>
          </>
        }
      >
        <form
          className="space-y-5"
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
          noValidate
        >
          {error ? <FormError message={error.message} hint={error.hint} /> : null}

          <div className="grid gap-4 sm:grid-cols-2">
            <section>
              <h3 className="mb-3 text-[0.6875rem] font-semibold tracking-wider text-success-ink uppercase">
                Monthly earnings
              </h3>
              <div className="space-y-3">
                {EARNINGS.map((item) => (
                  <Field
                    key={item.key}
                    label={item.label}
                    htmlFor={`sal-${item.key}`}
                    error={fields[item.key]}
                    hint={item.hint}
                  >
                    <Input
                      id={`sal-${item.key}`}
                      type="number"
                      min={0}
                      step={100}
                      inputMode="numeric"
                      value={form[item.key]}
                      error={fields[item.key]}
                      hint={item.hint}
                      onChange={(e) => set(item.key, e.target.value)}
                    />
                  </Field>
                ))}
              </div>
            </section>

            <section>
              <h3 className="mb-3 text-[0.6875rem] font-semibold tracking-wider text-danger-ink uppercase">
                Monthly deductions
              </h3>
              <div className="space-y-3">
                {DEDUCTIONS.map((item) => (
                  <Field
                    key={item.key}
                    label={item.label}
                    htmlFor={`sal-${item.key}`}
                    error={fields[item.key]}
                  >
                    <Input
                      id={`sal-${item.key}`}
                      type="number"
                      min={0}
                      step={10}
                      inputMode="numeric"
                      value={form[item.key]}
                      error={fields[item.key]}
                      onChange={(e) => set(item.key, e.target.value)}
                    />
                  </Field>
                ))}
                <Field label="Effective from" htmlFor="sal-from" error={fields.effectiveFrom}>
                  <Input
                    id="sal-from"
                    type="date"
                    value={from}
                    error={fields.effectiveFrom}
                    onChange={(e) => setFrom(e.target.value)}
                  />
                </Field>
              </div>
            </section>
          </div>

          <div className="rounded-lg border border-line bg-surface-2 p-3.5">
            <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div>
                <dt className="text-[0.625rem] font-semibold tracking-wide text-ink-4 uppercase">
                  Gross / month
                </dt>
                <dd className="mt-0.5 text-[0.9375rem] font-semibold text-ink">
                  {money(totals.gross)}
                </dd>
              </div>
              <div>
                <dt className="text-[0.625rem] font-semibold tracking-wide text-ink-4 uppercase">
                  Deductions
                </dt>
                <dd className="mt-0.5 text-[0.9375rem] font-semibold text-danger-ink">
                  {money(totals.deductions)}
                </dd>
              </div>
              <div>
                <dt className="text-[0.625rem] font-semibold tracking-wide text-ink-4 uppercase">
                  Net / month
                </dt>
                <dd className="mt-0.5 text-[0.9375rem] font-semibold text-success-ink">
                  {money(totals.net)}
                </dd>
              </div>
              <div>
                <dt className="text-[0.625rem] font-semibold tracking-wide text-ink-4 uppercase">
                  Annual CTC
                </dt>
                <dd className="mt-0.5 text-[0.9375rem] font-semibold text-ink">
                  {money(totals.annual)}
                </dd>
              </div>
            </dl>
            {warning ? (
              <p role="alert" className="mt-3 text-[0.8125rem] font-medium text-danger-ink">
                {warning}
              </p>
            ) : (
              <p className="mt-3 text-[0.75rem] text-ink-3">
                Basic is {totals.basicShare.toFixed(0)}% of gross. Deductions are applied in
                full regardless of loss of pay, matching standard statutory treatment.
              </p>
            )}
          </div>
        </form>
      </Modal>
    </>
  );
}
