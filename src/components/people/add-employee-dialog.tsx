"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { UserPlus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Field, FormError, FormNote, Input, Select } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { api, describeError } from "@/lib/client/api";
import {
  EMPLOYEE_STATUS_LABEL,
  EMPLOYMENT_TYPE_LABEL,
  EMPLOYEE_STATUSES,
  EMPLOYMENT_TYPES,
  ROLE_LABEL,
} from "@/lib/domain/constants";
import type { Role } from "@/lib/domain/constants";

/**
 * HR onboarding dialog.
 *
 * Creates the user *and* the employee record in one transaction and marks the
 * address verified — HR vouching for a colleague is a different trust path from
 * public self-registration, which still requires email verification.
 */
export function AddEmployeeDialog({
  departments,
  managers,
  nextCode,
  today,
  viewerRole,
}: {
  departments: { id: string; name: string }[];
  managers: { id: string; name: string; jobTitle: string }[];
  nextCode: string;
  today: string;
  viewerRole: Role;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const toast = useToast();

  // Deep link: /people?new=1 opens the dialog straight from the command centre.
  const [open, setOpen] = useState(() => params.get("new") === "1");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ message: string; hint?: string } | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});

  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    workEmail: "",
    employeeCode: nextCode,
    role: "EMPLOYEE" as Role,
    jobTitle: "",
    departmentId: departments[0]?.id ?? "",
    managerId: "",
    employmentType: "FULL_TIME",
    status: "PROBATION",
    joinedAt: today,
    location: "Bengaluru, IN",
    shiftStart: "09:30",
    shiftEnd: "18:30",
    temporaryPassword: "",
  });

  const set = (key: keyof typeof form, value: string) => {
    setForm((current) => ({ ...current, [key]: value }));
    setFields((current) => {
      if (!current[key]) return current;
      const next = { ...current };
      delete next[key];
      return next;
    });
  };

  function close() {
    setOpen(false);
    setError(null);
    if (params.get("new") === "1") router.replace("/people", { scroll: false });
  }

  async function submit() {
    setBusy(true);
    setError(null);
    setFields({});
    try {
      const result = await api.post<{ message: string; employeeCode: string }>(
        "/api/employees",
        { ...form, managerId: form.managerId || null },
      );
      toast.success(`${form.firstName} ${form.lastName} onboarded`, result.message);
      close();
      setForm((current) => ({
        ...current,
        firstName: "",
        lastName: "",
        workEmail: "",
        jobTitle: "",
        temporaryPassword: "",
      }));
      router.refresh();
    } catch (caught) {
      const described = describeError(caught);
      setError({ message: described.message, hint: described.hint });
      if (described.fields) setFields(described.fields);
    } finally {
      setBusy(false);
    }
  }

  const roleOptions: Role[] =
    viewerRole === "ADMIN" ? ["EMPLOYEE", "HR", "ADMIN"] : ["EMPLOYEE", "HR"];

  return (
    <>
      <Button variant="primary" size="sm" onClick={() => setOpen(true)}>
        <UserPlus className="size-4" />
        Add employee
      </Button>

      <Modal
        open={open}
        onClose={close}
        title="Onboard an employee"
        description="Creates a sign-in account and an employee record. They can change their own contact details afterwards."
        size="lg"
        dismissible={!busy}
        footer={
          <>
            <Button variant="secondary" onClick={close} disabled={busy}>
              Cancel
            </Button>
            <Button variant="primary" loading={busy} onClick={() => void submit()}>
              Create employee
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

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="First name" htmlFor="ae-first" error={fields.firstName} required>
              <Input
                id="ae-first"
                required
                value={form.firstName}
                error={fields.firstName}
                onChange={(e) => set("firstName", e.target.value)}
              />
            </Field>
            <Field label="Last name" htmlFor="ae-last" error={fields.lastName} required>
              <Input
                id="ae-last"
                required
                value={form.lastName}
                error={fields.lastName}
                onChange={(e) => set("lastName", e.target.value)}
              />
            </Field>
            <Field label="Work email" htmlFor="ae-email" error={fields.workEmail} required>
              <Input
                id="ae-email"
                type="email"
                required
                placeholder="first.last@dayflow.io"
                value={form.workEmail}
                error={fields.workEmail}
                onChange={(e) => set("workEmail", e.target.value)}
              />
            </Field>
            <Field
              label="Employee ID"
              htmlFor="ae-code"
              error={fields.employeeCode}
              hint="Pre-filled with the next available code."
              required
            >
              <Input
                id="ae-code"
                required
                value={form.employeeCode}
                error={fields.employeeCode}
                hint
                onChange={(e) => set("employeeCode", e.target.value.toUpperCase())}
              />
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Job title" htmlFor="ae-title" error={fields.jobTitle} required>
              <Input
                id="ae-title"
                required
                placeholder="Software Engineer"
                value={form.jobTitle}
                error={fields.jobTitle}
                onChange={(e) => set("jobTitle", e.target.value)}
              />
            </Field>
            <Field label="Department" htmlFor="ae-dept" error={fields.departmentId} required>
              <Select
                id="ae-dept"
                value={form.departmentId}
                error={fields.departmentId}
                onChange={(e) => set("departmentId", e.target.value)}
              >
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Reports to" htmlFor="ae-manager" error={fields.managerId}>
              <Select
                id="ae-manager"
                value={form.managerId}
                error={fields.managerId}
                onChange={(e) => set("managerId", e.target.value)}
              >
                <option value="">No manager</option>
                {managers.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name} — {m.jobTitle}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Account type" htmlFor="ae-role" error={fields.role}>
              <Select
                id="ae-role"
                value={form.role}
                error={fields.role}
                onChange={(e) => set("role", e.target.value)}
              >
                {roleOptions.map((role) => (
                  <option key={role} value={role}>
                    {ROLE_LABEL[role]}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Employment type" htmlFor="ae-type">
              <Select
                id="ae-type"
                value={form.employmentType}
                onChange={(e) => set("employmentType", e.target.value)}
              >
                {EMPLOYMENT_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {EMPLOYMENT_TYPE_LABEL[t]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Status" htmlFor="ae-status">
              <Select
                id="ae-status"
                value={form.status}
                onChange={(e) => set("status", e.target.value)}
              >
                {EMPLOYEE_STATUSES.filter((s) => s !== "INACTIVE").map((s) => (
                  <option key={s} value={s}>
                    {EMPLOYEE_STATUS_LABEL[s]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Joining date" htmlFor="ae-joined" error={fields.joinedAt} required>
              <Input
                id="ae-joined"
                type="date"
                required
                value={form.joinedAt}
                error={fields.joinedAt}
                onChange={(e) => set("joinedAt", e.target.value)}
              />
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Location" htmlFor="ae-location">
              <Input
                id="ae-location"
                value={form.location}
                onChange={(e) => set("location", e.target.value)}
              />
            </Field>
            <Field label="Shift start" htmlFor="ae-start" error={fields.shiftStart}>
              <Input
                id="ae-start"
                type="time"
                value={form.shiftStart}
                error={fields.shiftStart}
                onChange={(e) => set("shiftStart", e.target.value)}
              />
            </Field>
            <Field label="Shift end" htmlFor="ae-end" error={fields.shiftEnd}>
              <Input
                id="ae-end"
                type="time"
                value={form.shiftEnd}
                error={fields.shiftEnd}
                onChange={(e) => set("shiftEnd", e.target.value)}
              />
            </Field>
          </div>

          <Field
            label="Temporary password"
            htmlFor="ae-password"
            error={fields.temporaryPassword}
            hint="10+ characters with upper, lower, a number and a symbol. Share it securely; they should change it after first sign-in."
            required
          >
            <Input
              id="ae-password"
              required
              value={form.temporaryPassword}
              error={fields.temporaryPassword}
              hint
              onChange={(e) => set("temporaryPassword", e.target.value)}
            />
          </Field>

          <FormNote>
            Salary is not set here. Add a salary structure from the employee&apos;s Payroll
            tab — until then they are flagged as a payroll blocker in the attention queue.
          </FormNote>
        </form>
      </Modal>
    </>
  );
}
