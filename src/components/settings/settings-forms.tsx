"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Save, Send } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardBody, CardFooter, CardHeader } from "@/components/ui/card";
import { Field, FormError, FormNote, Input, Select, Textarea } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { api, describeError } from "@/lib/client/api";
import { Gauge, MessageSquare } from "lucide-react";

const TIMEZONES = [
  "Asia/Kolkata",
  "Asia/Dubai",
  "Asia/Singapore",
  "Europe/London",
  "Europe/Berlin",
  "America/New_York",
  "America/Los_Angeles",
  "Australia/Sydney",
];

/**
 * Work policy editor.
 *
 * These four numbers drive attendance classification, late detection and payroll
 * pro-rating, so the form spells out the consequence of each one instead of
 * presenting bare inputs.
 */
export function WorkPolicyForm({
  initial,
  canEdit,
}: {
  initial: {
    standardWorkMinutes: number;
    halfDayMinutes: number;
    lateGraceMinutes: number;
    payrollDayOfMonth: number;
    timezone: string;
  };
  canEdit: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ message: string; hint?: string } | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [form, setForm] = useState({
    standardWorkMinutes: String(initial.standardWorkMinutes),
    halfDayMinutes: String(initial.halfDayMinutes),
    lateGraceMinutes: String(initial.lateGraceMinutes),
    payrollDayOfMonth: String(initial.payrollDayOfMonth),
    timezone: initial.timezone,
  });

  const set = (key: keyof typeof form, value: string) => {
    setForm((c) => ({ ...c, [key]: value }));
    setFields((c) => {
      if (!c[key]) return c;
      const next = { ...c };
      delete next[key];
      return next;
    });
  };

  async function submit() {
    setBusy(true);
    setError(null);
    setFields({});
    try {
      const result = await api.patch<{ message: string }>("/api/settings", {
        standardWorkMinutes: Number(form.standardWorkMinutes),
        halfDayMinutes: Number(form.halfDayMinutes),
        lateGraceMinutes: Number(form.lateGraceMinutes),
        payrollDayOfMonth: Number(form.payrollDayOfMonth),
        timezone: form.timezone,
      });
      toast.success("Work policy saved", result.message);
      router.refresh();
    } catch (caught) {
      const described = describeError(caught);
      setError({ message: described.message, hint: described.hint });
      if (described.fields) setFields(described.fields);
    } finally {
      setBusy(false);
    }
  }

  const fullHours = (Number(form.standardWorkMinutes) / 60).toFixed(1);
  const halfHours = (Number(form.halfDayMinutes) / 60).toFixed(1);

  return (
    <Card>
      <CardHeader
        icon={<Gauge className="size-4" />}
        title="Work policy"
        subtitle="These values classify every attendance record and drive payroll pro-rating."
      />
      <CardBody>
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
            <Field
              label="Full day (minutes)"
              htmlFor="wp-full"
              error={fields.standardWorkMinutes}
              hint={`${fullHours} hours. At or above this a day counts as present.`}
            >
              <Input
                id="wp-full"
                type="number"
                min={120}
                max={720}
                step={15}
                disabled={!canEdit}
                value={form.standardWorkMinutes}
                error={fields.standardWorkMinutes}
                hint
                onChange={(e) => set("standardWorkMinutes", e.target.value)}
              />
            </Field>
            <Field
              label="Half day threshold (minutes)"
              htmlFor="wp-half"
              error={fields.halfDayMinutes}
              hint={`${halfHours} hours. Below this a completed day is recorded as absent.`}
            >
              <Input
                id="wp-half"
                type="number"
                min={30}
                max={600}
                step={15}
                disabled={!canEdit}
                value={form.halfDayMinutes}
                error={fields.halfDayMinutes}
                hint
                onChange={(e) => set("halfDayMinutes", e.target.value)}
              />
            </Field>
            <Field
              label="Late grace (minutes)"
              htmlFor="wp-grace"
              error={fields.lateGraceMinutes}
              hint="Minutes after each person's own shift start before late is recorded."
            >
              <Input
                id="wp-grace"
                type="number"
                min={0}
                max={120}
                step={5}
                disabled={!canEdit}
                value={form.lateGraceMinutes}
                error={fields.lateGraceMinutes}
                hint
                onChange={(e) => set("lateGraceMinutes", e.target.value)}
              />
            </Field>
            <Field
              label="Payroll day of month"
              htmlFor="wp-payday"
              error={fields.payrollDayOfMonth}
              hint="Shown to employees as the next pay date."
            >
              <Input
                id="wp-payday"
                type="number"
                min={1}
                max={28}
                disabled={!canEdit}
                value={form.payrollDayOfMonth}
                error={fields.payrollDayOfMonth}
                hint
                onChange={(e) => set("payrollDayOfMonth", e.target.value)}
              />
            </Field>
            <Field
              label="Organisation timezone"
              htmlFor="wp-tz"
              error={fields.timezone}
              hint="Every calendar day in Dayflow is resolved in this zone."
              className="sm:col-span-2"
            >
              <Select
                id="wp-tz"
                disabled={!canEdit}
                value={form.timezone}
                error={fields.timezone}
                hint
                onChange={(e) => set("timezone", e.target.value)}
              >
                {[...new Set([initial.timezone, ...TIMEZONES])].map((zone) => (
                  <option key={zone} value={zone}>
                    {zone.replace("_", " ")}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          {!canEdit ? (
            <FormNote>
              Only an administrator can change the work policy, because it affects how every
              past and future attendance record is classified.
            </FormNote>
          ) : null}
        </form>
      </CardBody>
      {canEdit ? (
        <CardFooter>
          <p className="text-[0.75rem] text-ink-3">
            Changes apply to new calculations immediately; stored payslips are not rewritten.
          </p>
          <Button variant="primary" size="sm" loading={busy} onClick={() => void submit()}>
            <Save className="size-3.5" />
            Save policy
          </Button>
        </CardFooter>
      ) : null}
    </Card>
  );
}

/** Announcement composer — writes a real notification to every recipient. */
export function AnnouncementForm({
  departments,
}: {
  departments: { id: string; name: string; headcount: number }[];
}) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ message: string; hint?: string } | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [form, setForm] = useState({
    title: "",
    body: "",
    audience: "ALL" as "ALL" | "DEPARTMENT",
    departmentId: departments[0]?.id ?? "",
  });

  async function submit() {
    setBusy(true);
    setError(null);
    setFields({});
    try {
      const result = await api.post<{ message: string }>("/api/settings", {
        title: form.title,
        body: form.body,
        audience: form.audience,
        ...(form.audience === "DEPARTMENT" ? { departmentId: form.departmentId } : {}),
      });
      toast.success("Announcement sent", result.message);
      setForm((c) => ({ ...c, title: "", body: "" }));
      router.refresh();
    } catch (caught) {
      const described = describeError(caught);
      setError({ message: described.message, hint: described.hint });
      if (described.fields) setFields(described.fields);
    } finally {
      setBusy(false);
    }
  }

  const audienceSize =
    form.audience === "ALL"
      ? departments.reduce((s, d) => s + d.headcount, 0)
      : (departments.find((d) => d.id === form.departmentId)?.headcount ?? 0);

  return (
    <Card>
      <CardHeader
        icon={<MessageSquare className="size-4" />}
        title="Send an announcement"
        subtitle="Delivered to the notification centre of everyone in the audience."
      />
      <CardBody>
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
          noValidate
        >
          {error ? <FormError message={error.message} hint={error.hint} /> : null}

          <Field label="Title" htmlFor="an-title" error={fields.title} required>
            <Input
              id="an-title"
              required
              maxLength={120}
              placeholder="Q3 review cycle opens next week"
              value={form.title}
              error={fields.title}
              onChange={(e) => setForm((c) => ({ ...c, title: e.target.value }))}
            />
          </Field>

          <Field label="Message" htmlFor="an-body" error={fields.body} required>
            <Textarea
              id="an-body"
              rows={3}
              required
              maxLength={600}
              placeholder="Self-assessments open on the 1st. Managers have two weeks to submit calibrated ratings."
              value={form.body}
              error={fields.body}
              onChange={(e) => setForm((c) => ({ ...c, body: e.target.value }))}
            />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Audience" htmlFor="an-aud">
              <Select
                id="an-aud"
                value={form.audience}
                onChange={(e) =>
                  setForm((c) => ({ ...c, audience: e.target.value as "ALL" | "DEPARTMENT" }))
                }
              >
                <option value="ALL">Everyone</option>
                <option value="DEPARTMENT">One department</option>
              </Select>
            </Field>
            {form.audience === "DEPARTMENT" ? (
              <Field label="Department" htmlFor="an-dept" error={fields.departmentId}>
                <Select
                  id="an-dept"
                  value={form.departmentId}
                  error={fields.departmentId}
                  onChange={(e) => setForm((c) => ({ ...c, departmentId: e.target.value }))}
                >
                  {departments.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name} ({d.headcount})
                    </option>
                  ))}
                </Select>
              </Field>
            ) : null}
          </div>
        </form>
      </CardBody>
      <CardFooter>
        <p className="text-[0.75rem] text-ink-3">
          Will reach {audienceSize} {audienceSize === 1 ? "person" : "people"}.
        </p>
        <Button
          variant="primary"
          size="sm"
          loading={busy}
          onClick={() => void submit()}
          disabled={form.title.trim().length < 4 || form.body.trim().length < 10}
        >
          <Send className="size-3.5" />
          Send announcement
        </Button>
      </CardFooter>
    </Card>
  );
}
