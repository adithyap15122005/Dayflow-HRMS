"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { MessageSquare, Trash2 } from "lucide-react";

import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/modal";
import { EmptyState } from "@/components/ui/states";
import { useToast } from "@/components/ui/toast";
import { api, describeError } from "@/lib/client/api";
import { formatRelative, formatWorkDateRange } from "@/lib/domain/time";
import { days, LEAVE_TONE, leaveLabel } from "@/lib/format";
import type { LeaveListItem } from "@/lib/services/leave";
import { CalendarDays } from "lucide-react";

/**
 * Leave request list.
 *
 * Used for both "my requests" (with a withdraw action) and the organisation-wide
 * register (with the requester shown). Withdrawal is confirmed because it is not
 * reversible — the employee has to submit again.
 */
export function LeaveList({
  requests,
  showEmployee = false,
  allowWithdraw = false,
  emptyAction,
}: {
  requests: LeaveListItem[];
  showEmployee?: boolean;
  allowWithdraw?: boolean;
  emptyAction?: React.ReactNode;
}) {
  const router = useRouter();
  const toast = useToast();
  const [target, setTarget] = useState<LeaveListItem | null>(null);
  const [busy, setBusy] = useState(false);

  async function withdraw() {
    if (!target) return;
    setBusy(true);
    try {
      const result = await api.post<{ message: string }>(`/api/leave/${target.id}/cancel`);
      toast.success("Request withdrawn", result.message);
      setTarget(null);
      router.refresh();
    } catch (caught) {
      const described = describeError(caught);
      toast.error(described.message, described.hint);
    } finally {
      setBusy(false);
    }
  }

  if (requests.length === 0) {
    return (
      <EmptyState
        icon={<CalendarDays className="size-5" />}
        title="No leave requests"
        description={
          allowWithdraw
            ? "When you apply for time off it appears here with its live status, plus any comment from your approver."
            : "Nothing matches these filters. Try a different status or clear the department filter."
        }
        action={emptyAction}
        compact
      />
    );
  }

  return (
    <>
      <ul className="divide-y divide-line">
        {requests.map((request) => (
          <li key={request.id} className="px-4 py-3.5 sm:px-5">
            <div className="flex flex-wrap items-start gap-3">
              {showEmployee ? (
                <Avatar name={request.employeeName} tone={request.avatarColor} size="md" />
              ) : null}

              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  {showEmployee ? (
                    <Link
                      href={`/people/${request.employeeId}`}
                      className="text-[0.875rem] font-semibold text-ink hover:text-brand hover:underline"
                    >
                      {request.employeeName}
                    </Link>
                  ) : (
                    <span className="text-[0.875rem] font-semibold text-ink">
                      {request.leaveType}
                    </span>
                  )}
                  <Badge tone={LEAVE_TONE[request.status]} size="sm" dot>
                    {leaveLabel(request.status)}
                  </Badge>
                  {request.status === "PENDING" && request.ageHours >= 48 ? (
                    <Badge tone="danger" size="sm">
                      Waiting {Math.floor(request.ageHours / 24)}d
                    </Badge>
                  ) : null}
                </div>

                <p className="mt-1 text-[0.8125rem] text-ink-2">
                  {showEmployee ? (
                    <>
                      <span className="font-medium text-ink">{request.leaveType}</span>
                      {" · "}
                    </>
                  ) : null}
                  {formatWorkDateRange(request.startDate, request.endDate)} ·{" "}
                  {days(request.workingDays)}
                  {request.halfDay ? " (half day)" : ""}
                </p>

                <p className="mt-0.5 text-[0.75rem] text-ink-4">
                  Requested {formatRelative(request.createdAt)}
                  {request.decidedByName
                    ? ` · decided by ${request.decidedByName} ${
                        request.decidedAt ? formatRelative(request.decidedAt) : ""
                      }`
                    : ""}
                  {showEmployee && request.department ? ` · ${request.department}` : ""}
                </p>

                {request.reason ? (
                  <p className="mt-2 text-[0.8125rem] leading-snug text-ink-2">
                    {request.reason}
                  </p>
                ) : null}

                {request.decisionComment ? (
                  <p className="mt-1.5 flex items-start gap-1.5 rounded-md bg-surface-3 px-2.5 py-1.5 text-[0.8125rem] leading-snug text-ink-2">
                    <MessageSquare className="mt-0.5 size-3.5 shrink-0 text-ink-4" />
                    <span>{request.decisionComment}</span>
                  </p>
                ) : null}
              </div>

              {allowWithdraw && request.status === "PENDING" ? (
                <Button variant="ghost" size="sm" onClick={() => setTarget(request)}>
                  <Trash2 className="size-3.5" />
                  Withdraw
                </Button>
              ) : null}
            </div>
          </li>
        ))}
      </ul>

      <ConfirmDialog
        open={Boolean(target)}
        onClose={() => setTarget(null)}
        onConfirm={() => void withdraw()}
        title="Withdraw this request?"
        confirmLabel="Withdraw request"
        tone="danger"
        loading={busy}
        message={
          target
            ? `Your ${target.leaveType.toLowerCase()} request for ${formatWorkDateRange(
                target.startDate,
                target.endDate,
              )} will be cancelled and the ${days(
                target.workingDays,
              )} released back to your balance. You will need to apply again if you change your mind.`
            : ""
        }
      />
    </>
  );
}
