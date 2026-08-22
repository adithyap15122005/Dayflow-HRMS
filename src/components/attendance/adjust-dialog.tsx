"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Pencil } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Field, FormError, FormNote, Input, Select, Textarea } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { api, describeError } from "@/lib/client/api";
import { ATTENDANCE_STATUSES, ATTENDANCE_STATUS_LABEL } from "@/lib/domain/constants";
import { formatWorkDate } from "@/lib/domain/time";

export type AdjustTarget = {
  employeeId: string;
  employeeName: string;
  workDate: string;
  status: string;
  checkIn: string;
  checkOut: string;
  note: string;
};

/**
 * HR attendance correction.
 *
 * Deliberately explicit rather than an inline-editable cell: an attendance change
 * feeds payroll, so it goes through a reviewed form, is stamped `HR_ADJUSTMENT`,
 * and is written to the audit trail.
 */
export function AdjustAttendanceDialog({
  target,
  onClose,
}: {
  target: AdjustTarget | null;
  onClose: () => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ message: string; hint?: string } | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [form, setForm] = useState({
    status: target?.status ?? "PRESENT",
    checkIn: target?.checkIn ?? "",
    checkOut: target?.checkOut ?? "",
    note: target?.note ?? "",
  });
  const [loadedFor, setLoadedFor] = useState<string | null>(null);

  // Re-seed the form whenever a different row is opened.
  const key = target ? `${target.employeeId}|${target.workDate}` : null;
  if (key && key !== loadedFor) {
    setLoadedFor(key);
    setForm({
      status: target!.status === "WEEK_OFF" ? "PRESENT" : target!.status,
      checkIn: target!.checkIn,
      checkOut: target!.checkOut,
      note: target!.note,
    });
    setError(null);
    setFields({});
  }

  async function submit() {
    if (!target) return;
    setBusy(true);
    setError(null);
    setFields({});
    try {
      const result = await api.post<{ message: string }>("/api/attendance", {
        employeeId: target.employeeId,
        workDate: target.workDate,
        status: form.status,
        checkIn: form.checkIn || null,
        checkOut: form.checkOut || null,
        note: form.note || null,
      });
      toast.success("Attendance updated", result.message);
      onClose();
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
    <Modal
      open={Boolean(target)}
      onClose={onClose}
      title="Adjust attendance"
      description={
        target
          ? `${target.employeeName} · ${formatWorkDate(target.workDate, "long")}`
          : undefined
      }
      size="md"
      dismissible={!busy}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant="primary" loading={busy} onClick={() => void submit()}>
            <Pencil className="size-3.5" />
            Save correction
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
          label="Status"
          htmlFor="adj-status"
          error={fields.status}
          hint="Half day and absent both reduce payable days for the month."
          required
        >
          <Select
            id="adj-status"
            value={form.status}
            error={fields.status}
            hint
            onChange={(e) => setForm((c) => ({ ...c, status: e.target.value }))}
          >
            {ATTENDANCE_STATUSES.map((status) => (
              <option key={status} value={status}>
                {ATTENDANCE_STATUS_LABEL[status]}
              </option>
            ))}
          </Select>
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Check-in" htmlFor="adj-in" error={fields.checkIn}>
            <Input
              id="adj-in"
              type="time"
              value={form.checkIn}
              error={fields.checkIn}
              onChange={(e) => setForm((c) => ({ ...c, checkIn: e.target.value }))}
            />
          </Field>
          <Field label="Check-out" htmlFor="adj-out" error={fields.checkOut}>
            <Input
              id="adj-out"
              type="time"
              value={form.checkOut}
              error={fields.checkOut}
              onChange={(e) => setForm((c) => ({ ...c, checkOut: e.target.value }))}
            />
          </Field>
        </div>

        <Field
          label="Reason for the correction"
          htmlFor="adj-note"
          error={fields.note}
          hint="Shown on the employee's record and stored in the audit trail."
        >
          <Textarea
            id="adj-note"
            rows={2}
            maxLength={240}
            value={form.note}
            error={fields.note}
            hint
            placeholder="Forgot to check out — confirmed with their manager."
            onChange={(e) => setForm((c) => ({ ...c, note: e.target.value }))}
          />
        </Field>

        <FormNote>
          Hours are recomputed from the times you enter, and the record is marked as an HR
          adjustment so it is distinguishable from a self check-in.
        </FormNote>
      </form>
    </Modal>
  );
}
