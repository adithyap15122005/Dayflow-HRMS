import { requireManagement, requireRole, toActor } from "@/lib/auth/guard";
import { jsonOk, readJson, route } from "@/lib/http";
import {
  markPayrollPaid,
  previewPayrollRun,
  processPayroll,
} from "@/lib/services/payroll";
import { payrollRunSchema, periodSchema } from "@/lib/validation";

/** Dry run: what would this period pay, and who is blocked? */
export const GET = route(async (request: Request) => {
  const user = await requireManagement();
  const url = new URL(request.url);
  const period = periodSchema.parse(url.searchParams.get("period") ?? "");
  return jsonOk(await previewPayrollRun(toActor(user), period));
});

/** Processing and marking paid are admin-only — HR can review but not commit. */
export const POST = route(async (request: Request) => {
  const user = await requireRole("ADMIN");
  const { period, action } = payrollRunSchema.parse(await readJson(request));
  const actor = toActor(user);

  if (action === "MARK_PAID") {
    const run = await markPayrollPaid(actor, user.fullName, period);
    return jsonOk({
      status: run.status,
      message: `${period} payroll marked as paid. The register is now locked.`,
    });
  }

  const run = await processPayroll(actor, user.fullName, period);
  const preview = await previewPayrollRun(actor, period);
  return jsonOk({
    status: run.status,
    message: `Processed ${preview.totals.ready} payslips totalling ${Math.round(
      preview.totals.netTotal,
    ).toLocaleString("en-IN")}. Everyone has been notified.`,
  });
});
