"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Check, Clock, MessageSquare, X } from "lucide-react";

import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, FormError, Textarea } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { EmptyState } from "@/components/ui/states";
import { useToast } from "@/components/ui/toast";
import { api, describeError } from "@/lib/client/api";
import { cn } from "@/lib/cn";
import { formatWorkDateRange } from "@/lib/domain/time";
import { days } from "@/lib/format";

export type PendingRequest = {
  id: string;
  employeeId: string;
  employeeName: string;
  employeeCode: string;
  avatarColor: string;
  jobTitle: string;
  department: string | null;
  leaveType: string;
  startDate: string;
  endDate: string;
  workingDays: number;
  halfDay: boolean;
  reason: string;
  ageHours: number;
};

/**
 * The approval queue.
 *
 * Rejections require a comment (enforced server-side too) because "rejected with
 * no reason" is the single most common complaint about HR tooling.
 */
export function ApprovalQueue({
  requests,
  compact = false,
}: {
  requests: PendingRequest[];
  compact?: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [target, setTarget] = useState<{
    request: PendingRequest;
    decision: "APPROVED" | "REJECTED";
  } | null>(null);
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ message: string; hint?: string } | null>(null);
  const [fieldError, setFieldError] = useState<string | null>(null);

  function open(request: PendingRequest, decision: "APPROVED" | "REJECTED") {
    setTarget({ request, decision });
    setComment(decision === "APPROVED" ? "Approved. Coverage confirmed with the team." : "");
    setError(null);
    setFieldError(null);
  }

  async function submit() {
    if (!target) return;
    setBusy(true);
    setError(null);
    setFieldError(null);
    try {
      const result = await api.post<{ message: string }>(
        `/api/leave/${target.request.id}/decision`,
        { decision: target.decision, comment },
      );
      toast.success(
        target.decision === "APPROVED" ? "Leave approved" : "Leave rejected",
        result.message,
      );
      setTarget(null);
      router.refresh();
    } catch (caught) {
      const described = describeError(caught);
      setError({ message: described.message, hint: described.hint });
      if (described.fields?.comment) setFieldError(described.fields.comment);
    } finally {
      setBusy(false);
    }
  }

  if (requests.length === 0) {
    return (
      <EmptyState
        icon={<Check className="size-5" />}
        title="No requests waiting"
        description="Every leave request has a decision. New submissions appear here immediately and notify you."
        compact={compact}
      />
    );
  }

  return (
    <>
      <ul className="divide-y divide-line">
        {requests.map((request) => (
          <li key={request.id} className="px-4 py-3.5 sm:px-5">
            <div className="flex flex-wrap items-start gap-3">
              <Avatar
                name={request.employeeName}
                tone={request.avatarColor}
                size="md"
              />

              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <Link
                    href={`/people/${request.employeeId}`}
                    className="text-[0.875rem] font-semibold text-ink hover:text-brand hover:underline"
                  >
                    {request.employeeName}
                  </Link>
                  <span className="text-[0.75rem] text-ink-3">
                    {request.jobTitle}
                    {request.department ? ` · ${request.department}` : ""}
                  </span>
                  {request.ageHours >= 48 ? (
                    <Badge tone="danger" size="sm" dot>
                      Waiting {Math.floor(request.ageHours / 24)}d
                    </Badge>
                  ) : (
                    <Badge tone="neutral" size="sm">
                      <Clock className="size-3" />
                      {request.ageHours}h ago
                    </Badge>
                  )}
                </div>

                <p className="mt-1.5 text-[0.8125rem] text-ink-2">
                  <span className="font-medium text-ink">{request.leaveType}</span>
                  {" · "}
                  {formatWorkDateRange(request.startDate, request.endDate)}
                  {" · "}
                  {days(request.workingDays)}
                  {request.halfDay ? " (half day)" : ""}
                </p>

                {request.reason ? (
                  <p className="mt-1.5 flex items-start gap-1.5 rounded-md bg-surface-3 px-2.5 py-1.5 text-[0.8125rem] leading-snug text-ink-2">
                    <MessageSquare className="mt-0.5 size-3.5 shrink-0 text-ink-4" />
                    <span>{request.reason}</span>
                  </p>
                ) : null}
              </div>

              <div className="flex shrink-0 gap-2">
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => open(request, "REJECTED")}
                >
                  <X className="size-3.5" />
                  Reject
                </Button>
                <Button
                  size="sm"
                  variant="primary"
                  onClick={() => open(request, "APPROVED")}
                >
                  <Check className="size-3.5" />
                  Approve
                </Button>
              </div>
            </div>
          </li>
        ))}
      </ul>

      <Modal
        open={Boolean(target)}
        onClose={() => setTarget(null)}
        title={
          target?.decision === "APPROVED" ? "Approve leave request" : "Reject leave request"
        }
        description={
          target
            ? `${target.request.employeeName} · ${target.request.leaveType} · ${formatWorkDateRange(
                target.request.startDate,
                target.request.endDate,
              )} (${days(target.request.workingDays)})`
            : undefined
        }
        size="md"
        footer={
          <>
            <Button variant="secondary" onClick={() => setTarget(null)} disabled={busy}>
              Cancel
            </Button>
            <Button
              variant={target?.decision === "APPROVED" ? "primary" : "danger"}
              loading={busy}
              onClick={() => void submit()}
            >
              {target?.decision === "APPROVED" ? "Approve request" : "Reject request"}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          {error ? <FormError message={error.message} hint={error.hint} /> : null}

          <div
            className={cn(
              "rounded-lg border px-3.5 py-3 text-[0.8125rem] leading-relaxed",
              target?.decision === "APPROVED"
                ? "border-success/20 bg-success-soft text-success-ink"
                : "border-warning/25 bg-warning-soft text-warning-ink",
            )}
          >
            {target?.decision === "APPROVED"
              ? "Approving deducts the days from the employee's balance and marks those dates as leave on the attendance record. They are notified straight away."
              : "The employee sees your comment on their request and in their notifications. A comment is required so the decision is understandable."}
          </div>

          {target?.request.reason ? (
            <div>
              <p className="text-[0.6875rem] font-semibold tracking-wider text-ink-4 uppercase">
                Their reason
              </p>
              <p className="mt-1 text-[0.8125rem] leading-relaxed text-ink-2">
                {target.request.reason}
              </p>
            </div>
          ) : null}

          <Field
            label={target?.decision === "APPROVED" ? "Comment (optional)" : "Reason for rejection"}
            htmlFor="decision-comment"
            error={fieldError}
            required={target?.decision === "REJECTED"}
            hint={
              target?.decision === "REJECTED"
                ? "At least 5 characters. Be specific — it saves a follow-up conversation."
                : undefined
            }
          >
            <Textarea
              id="decision-comment"
              value={comment}
              error={fieldError}
              hint
              rows={3}
              maxLength={400}
              placeholder={
                target?.decision === "APPROVED"
                  ? "Approved. Handover noted."
                  : "Release week — please reschedule to the following Monday."
              }
              onChange={(event) => setComment(event.target.value)}
            />
          </Field>
        </div>
      </Modal>
    </>
  );
}
