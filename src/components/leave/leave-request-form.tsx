"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { CalendarPlus, Info } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox, Field, FormError, Input, Select, Textarea } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { api, describeError, qs } from "@/lib/client/api";
import { cn } from "@/lib/cn";
import { addWorkDays } from "@/lib/domain/time";
import { days } from "@/lib/format";
import type { LeaveBalanceRow, LeaveTypeRow } from "@/lib/services/leave";

/**
 * Leave request form.
 *
 * The working-day count is fetched from the server (`/api/leave/preview`) rather
 * than computed in the browser, so the number the employee sees is produced by the
 * same rule that will validate the submission — weekly offs and public holidays
 * excluded.
 */
export function LeaveRequestForm({
  leaveTypes,
  balances,
  today,
  trigger = "button",
}: {
  leaveTypes: LeaveTypeRow[];
  balances: LeaveBalanceRow[];
  today: string;
  trigger?: "button" | "primary";
}) {
  const router = useRouter();
  const toast = useToast();

  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ message: string; hint?: string } | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  // The response is tagged with the range it describes, so a stale count is never
  // displayed and no effect is needed to clear it.
  const [fetched, setFetched] = useState<
    { key: string; workingDays: number; dates: string[] } | null
  >(null);
  const [previewing, setPreviewing] = useState(false);

  const [form, setForm] = useState({
    leaveTypeId: leaveTypes[0]?.id ?? "",
    startDate: addWorkDays(today, 1),
    endDate: addWorkDays(today, 1),
    halfDay: false,
    reason: "",
  });

  const selectedType = leaveTypes.find((t) => t.id === form.leaveTypeId);
  const balance = balances.find((b) => b.leaveTypeId === form.leaveTypeId);

  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) => {
    setForm((current) => {
      const next = { ...current, [key]: value };
      // Keep the range coherent: moving the start past the end drags the end along.
      if (key === "startDate" && next.endDate < next.startDate) next.endDate = next.startDate;
      if (key === "halfDay" && value === true) next.endDate = next.startDate;
      return next;
    });
    setFields((current) => {
      if (!current[key as string]) return current;
      const rest = { ...current };
      delete rest[key as string];
      return rest;
    });
  };

  const rangeKey = `${form.startDate}|${form.endDate}|${form.halfDay}`;
  const rangeValid = Boolean(
    form.startDate && form.endDate && form.endDate >= form.startDate,
  );
  const preview = rangeValid && fetched?.key === rangeKey ? fetched : null;

  // Debounced, server-computed day count. The effect body performs no state update.
  useEffect(() => {
    if (!open || !rangeValid) return;
    const timer = setTimeout(() => {
      setPreviewing(true);
      void api
        .get<{ workingDays: number; dates: string[] }>(
          `/api/leave/preview${qs({
            startDate: form.startDate,
            endDate: form.endDate,
            halfDay: form.halfDay,
          })}`,
        )
        .then((result) => setFetched({ key: rangeKey, ...result }))
        .catch(() => setFetched(null))
        .finally(() => setPreviewing(false));
    }, 250);
    return () => clearTimeout(timer);
  }, [open, rangeValid, rangeKey, form.startDate, form.endDate, form.halfDay]);

  const exceeds =
    preview !== null &&
    balance?.cap !== null &&
    balance !== undefined &&
    preview.workingDays > (balance.remainingDays ?? 0) + 1e-9;

  async function submit() {
    setBusy(true);
    setError(null);
    setFields({});
    try {
      const result = await api.post<{ message: string }>("/api/leave", form);
      toast.success("Leave requested", result.message);
      setOpen(false);
      setForm((current) => ({ ...current, reason: "" }));
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
      <Button
        variant={trigger === "primary" ? "primary" : "secondary"}
        size="sm"
        onClick={() => setOpen(true)}
      >
        <CalendarPlus className="size-4" />
        Apply for leave
      </Button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Apply for leave"
        description="Dayflow checks your balance, your weekly offs, public holidays and any overlapping request before submitting."
        size="md"
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
              disabled={exceeds || preview?.workingDays === 0}
            >
              Submit request
            </Button>
          </>
        }
      >
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
          noValidate
        >
          {error ? <FormError message={error.message} hint={error.hint} /> : null}

          <Field
            label="Leave type"
            htmlFor="lr-type"
            error={fields.leaveTypeId}
            required
            hint={
              balance
                ? balance.cap === null
                  ? "Unpaid leave has no entitlement cap."
                  : `${balance.remainingDays ?? 0} of ${balance.cap} days remaining (pending requests already deducted).`
                : undefined
            }
          >
            <Select
              id="lr-type"
              value={form.leaveTypeId}
              error={fields.leaveTypeId}
              hint
              onChange={(e) => set("leaveTypeId", e.target.value)}
            >
              {leaveTypes.map((type) => {
                const b = balances.find((x) => x.leaveTypeId === type.id);
                return (
                  <option key={type.id} value={type.id}>
                    {type.name}
                    {b && b.cap !== null ? ` — ${b.remainingDays} left` : " — uncapped"}
                  </option>
                );
              })}
            </Select>
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="First day" htmlFor="lr-start" error={fields.startDate} required>
              <Input
                id="lr-start"
                type="date"
                required
                value={form.startDate}
                error={fields.startDate}
                onChange={(e) => set("startDate", e.target.value)}
              />
            </Field>
            <Field label="Last day" htmlFor="lr-end" error={fields.endDate} required>
              <Input
                id="lr-end"
                type="date"
                required
                min={form.startDate}
                disabled={form.halfDay}
                value={form.endDate}
                error={fields.endDate}
                onChange={(e) => set("endDate", e.target.value)}
              />
            </Field>
          </div>

          <Checkbox
            id="lr-half"
            label="Half day"
            hint="Applies to a single date and consumes 0.5 days of balance."
            checked={form.halfDay}
            onChange={(e) => set("halfDay", e.target.checked)}
          />

          {/* Live, server-computed summary of what this request will cost. */}
          <div
            className={cn(
              "rounded-lg border px-3.5 py-3 text-[0.8125rem]",
              exceeds
                ? "border-danger/25 bg-danger-soft text-danger-ink"
                : "border-info/20 bg-info-soft text-info-ink",
            )}
          >
            <p className="flex items-start gap-2 font-medium">
              <Info className="mt-0.5 size-3.5 shrink-0" />
              {previewing ? (
                "Counting working days…"
              ) : preview ? (
                preview.workingDays === 0 ? (
                  "That range contains only weekends and public holidays."
                ) : (
                  <span>
                    This request uses <strong>{days(preview.workingDays)}</strong> of{" "}
                    {selectedType?.name.toLowerCase() ?? "leave"}
                    {balance && balance.cap !== null
                      ? ` — you would have ${Math.max(
                          0,
                          Math.round(((balance.remainingDays ?? 0) - preview.workingDays) * 10) / 10,
                        )} day(s) left.`
                      : "."}
                  </span>
                )
              ) : (
                "Pick a valid date range to see the working-day count."
              )}
            </p>
            {preview && preview.dates.length > 0 && preview.dates.length <= 10 ? (
              <p className="mt-1.5 text-[0.75rem] opacity-80">
                Working days counted: {preview.dates.join(", ")}
              </p>
            ) : null}
          </div>

          <Field
            label="Reason"
            htmlFor="lr-reason"
            error={fields.reason}
            required={selectedType?.requiresReason}
            hint="At least 10 characters. Your approver sees this, so give them enough to decide."
          >
            <Textarea
              id="lr-reason"
              rows={3}
              maxLength={500}
              value={form.reason}
              error={fields.reason}
              hint
              placeholder="Family wedding in Jaipur — travelling with my parents."
              onChange={(e) => set("reason", e.target.value)}
            />
          </Field>
        </form>
      </Modal>
    </>
  );
}
