"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Pencil } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Field, FormError, FormNote, Input, Select, Textarea } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { api, describeError } from "@/lib/client/api";
import {
  EMPLOYEE_STATUS_LABEL,
  EMPLOYMENT_TYPE_LABEL,
  EMPLOYEE_STATUSES,
  EMPLOYMENT_TYPES,
} from "@/lib/domain/constants";

const AVATAR_TONES = [
  "indigo",
  "violet",
  "teal",
  "amber",
  "rose",
  "sky",
  "emerald",
  "slate",
] as const;

export type EditableProfile = {
  id: string;
  firstName: string;
  lastName: string;
  workEmail: string;
  personalEmail: string | null;
  phone: string | null;
  address: string | null;
  city: string | null;
  country: string | null;
  dateOfBirth: string | null;
  gender: string | null;
  avatarColor: string;
  jobTitle: string;
  employmentType: string;
  status: string;
  location: string;
  shiftStart: string;
  shiftEnd: string;
  emergencyContactName: string | null;
  emergencyContactPhone: string | null;
  department: { id: string; name: string } | null;
  manager: { id: string } | null;
  editableFields: string[];
};

/**
 * Profile editor.
 *
 * The dialog only renders the fields the viewer is actually allowed to write —
 * `editableFields` comes from the same rule the API enforces, so the UI can never
 * offer an edit that the server will reject.
 */
export function EditProfileDialog({
  profile,
  departments,
  managers,
  label = "Edit profile",
}: {
  profile: EditableProfile;
  departments: { id: string; name: string }[];
  managers: { id: string; name: string; jobTitle: string }[];
  label?: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ message: string; hint?: string } | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});

  const can = (field: string) => profile.editableFields.includes(field);
  const isHr = can("jobTitle");

  const [form, setForm] = useState({
    phone: profile.phone ?? "",
    personalEmail: profile.personalEmail ?? "",
    address: profile.address ?? "",
    city: profile.city ?? "",
    emergencyContactName: profile.emergencyContactName ?? "",
    emergencyContactPhone: profile.emergencyContactPhone ?? "",
    avatarColor: profile.avatarColor,
    firstName: profile.firstName,
    lastName: profile.lastName,
    workEmail: profile.workEmail,
    jobTitle: profile.jobTitle,
    employmentType: profile.employmentType,
    status: profile.status,
    departmentId: profile.department?.id ?? "",
    managerId: profile.manager?.id ?? "",
    location: profile.location,
    shiftStart: profile.shiftStart,
    shiftEnd: profile.shiftEnd,
    dateOfBirth: profile.dateOfBirth ?? "",
    gender: profile.gender ?? "",
    country: profile.country ?? "",
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

  async function submit() {
    setBusy(true);
    setError(null);
    setFields({});

    // Send only the fields this viewer may change, and drop untouched blanks so
    // an empty optional input never clears stored data by accident.
    const payload: Record<string, unknown> = {};
    const add = (key: keyof typeof form, apiKey = key as string) => {
      if (!can(apiKey)) return;
      const value = form[key];
      if (value === "") return;
      payload[apiKey] = value;
    };

    add("phone");
    add("personalEmail");
    add("address");
    add("city");
    add("emergencyContactName");
    add("emergencyContactPhone");
    add("avatarColor");
    if (isHr) {
      add("firstName");
      add("lastName");
      add("workEmail");
      add("jobTitle");
      add("employmentType");
      add("status");
      add("location");
      add("shiftStart");
      add("shiftEnd");
      add("dateOfBirth");
      add("gender");
      add("country");
      if (can("departmentId")) payload.departmentId = form.departmentId || null;
      if (can("managerId")) payload.managerId = form.managerId || null;
    }

    try {
      const result = await api.patch<{ message: string }>(
        `/api/employees/${profile.id}`,
        payload,
      );
      toast.success("Profile updated", result.message);
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
      <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>
        <Pencil className="size-3.5" />
        {label}
      </Button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={isHr ? `Edit ${profile.firstName} ${profile.lastName}` : "Edit your details"}
        description={
          isHr
            ? "You can change employment details as well as contact information. The employee is notified of every change."
            : "You can update your contact details. Employment information is maintained by HR."
        }
        size="lg"
        dismissible={!busy}
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)} disabled={busy}>
              Cancel
            </Button>
            <Button variant="primary" loading={busy} onClick={() => void submit()}>
              Save changes
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

          <section>
            <h3 className="mb-3 text-[0.6875rem] font-semibold tracking-wider text-ink-4 uppercase">
              Contact
            </h3>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Phone" htmlFor="ep-phone" error={fields.phone}>
                <Input
                  id="ep-phone"
                  type="tel"
                  value={form.phone}
                  error={fields.phone}
                  placeholder="+91 98765 43210"
                  onChange={(e) => set("phone", e.target.value)}
                />
              </Field>
              <Field label="Personal email" htmlFor="ep-pemail" error={fields.personalEmail}>
                <Input
                  id="ep-pemail"
                  type="email"
                  value={form.personalEmail}
                  error={fields.personalEmail}
                  onChange={(e) => set("personalEmail", e.target.value)}
                />
              </Field>
              <Field label="Address" htmlFor="ep-address" error={fields.address} className="sm:col-span-2">
                <Textarea
                  id="ep-address"
                  rows={2}
                  value={form.address}
                  error={fields.address}
                  onChange={(e) => set("address", e.target.value)}
                />
              </Field>
              <Field label="City" htmlFor="ep-city" error={fields.city}>
                <Input
                  id="ep-city"
                  value={form.city}
                  error={fields.city}
                  onChange={(e) => set("city", e.target.value)}
                />
              </Field>
              <Field label="Avatar colour" htmlFor="ep-tone">
                <Select
                  id="ep-tone"
                  value={form.avatarColor}
                  onChange={(e) => set("avatarColor", e.target.value)}
                >
                  {AVATAR_TONES.map((tone) => (
                    <option key={tone} value={tone}>
                      {tone[0].toUpperCase() + tone.slice(1)}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
          </section>

          <section>
            <h3 className="mb-3 text-[0.6875rem] font-semibold tracking-wider text-ink-4 uppercase">
              Emergency contact
            </h3>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Name" htmlFor="ep-ecname" error={fields.emergencyContactName}>
                <Input
                  id="ep-ecname"
                  value={form.emergencyContactName}
                  error={fields.emergencyContactName}
                  onChange={(e) => set("emergencyContactName", e.target.value)}
                />
              </Field>
              <Field label="Phone" htmlFor="ep-ecphone" error={fields.emergencyContactPhone}>
                <Input
                  id="ep-ecphone"
                  type="tel"
                  value={form.emergencyContactPhone}
                  error={fields.emergencyContactPhone}
                  onChange={(e) => set("emergencyContactPhone", e.target.value)}
                />
              </Field>
            </div>
          </section>

          {isHr ? (
            <section>
              <h3 className="mb-3 text-[0.6875rem] font-semibold tracking-wider text-ink-4 uppercase">
                Employment · HR only
              </h3>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="First name" htmlFor="ep-first" error={fields.firstName}>
                  <Input
                    id="ep-first"
                    value={form.firstName}
                    error={fields.firstName}
                    onChange={(e) => set("firstName", e.target.value)}
                  />
                </Field>
                <Field label="Last name" htmlFor="ep-last" error={fields.lastName}>
                  <Input
                    id="ep-last"
                    value={form.lastName}
                    error={fields.lastName}
                    onChange={(e) => set("lastName", e.target.value)}
                  />
                </Field>
                <Field label="Work email" htmlFor="ep-wemail" error={fields.workEmail}>
                  <Input
                    id="ep-wemail"
                    type="email"
                    value={form.workEmail}
                    error={fields.workEmail}
                    onChange={(e) => set("workEmail", e.target.value)}
                  />
                </Field>
                <Field label="Job title" htmlFor="ep-title" error={fields.jobTitle}>
                  <Input
                    id="ep-title"
                    value={form.jobTitle}
                    error={fields.jobTitle}
                    onChange={(e) => set("jobTitle", e.target.value)}
                  />
                </Field>
                <Field label="Department" htmlFor="ep-dept" error={fields.departmentId}>
                  <Select
                    id="ep-dept"
                    value={form.departmentId}
                    error={fields.departmentId}
                    onChange={(e) => set("departmentId", e.target.value)}
                  >
                    <option value="">Unassigned</option>
                    {departments.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Reports to" htmlFor="ep-manager" error={fields.managerId}>
                  <Select
                    id="ep-manager"
                    value={form.managerId}
                    error={fields.managerId}
                    onChange={(e) => set("managerId", e.target.value)}
                  >
                    <option value="">No manager</option>
                    {managers
                      .filter((m) => m.id !== profile.id)
                      .map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.name} — {m.jobTitle}
                        </option>
                      ))}
                  </Select>
                </Field>
                <Field label="Employment type" htmlFor="ep-etype">
                  <Select
                    id="ep-etype"
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
                <Field
                  label="Status"
                  htmlFor="ep-status"
                  hint="Inactive immediately blocks sign-in."
                >
                  <Select
                    id="ep-status"
                    value={form.status}
                    hint
                    onChange={(e) => set("status", e.target.value)}
                  >
                    {EMPLOYEE_STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {EMPLOYEE_STATUS_LABEL[s]}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Location" htmlFor="ep-loc">
                  <Input
                    id="ep-loc"
                    value={form.location}
                    onChange={(e) => set("location", e.target.value)}
                  />
                </Field>
                <Field label="Date of birth" htmlFor="ep-dob" error={fields.dateOfBirth}>
                  <Input
                    id="ep-dob"
                    type="date"
                    value={form.dateOfBirth}
                    error={fields.dateOfBirth}
                    onChange={(e) => set("dateOfBirth", e.target.value)}
                  />
                </Field>
                <Field label="Shift start" htmlFor="ep-sstart" error={fields.shiftStart}>
                  <Input
                    id="ep-sstart"
                    type="time"
                    value={form.shiftStart}
                    error={fields.shiftStart}
                    onChange={(e) => set("shiftStart", e.target.value)}
                  />
                </Field>
                <Field label="Shift end" htmlFor="ep-send" error={fields.shiftEnd}>
                  <Input
                    id="ep-send"
                    type="time"
                    value={form.shiftEnd}
                    error={fields.shiftEnd}
                    onChange={(e) => set("shiftEnd", e.target.value)}
                  />
                </Field>
              </div>
            </section>
          ) : (
            <FormNote>
              Job title, department, shift and employment status are maintained by HR. Ask
              them if any of those need correcting.
            </FormNote>
          )}
        </form>
      </Modal>
    </>
  );
}
