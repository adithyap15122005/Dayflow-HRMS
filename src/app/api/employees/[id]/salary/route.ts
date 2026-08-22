import { requireActor, requireManagement, toActor } from "@/lib/auth/guard";
import { jsonOk, readJson, route } from "@/lib/http";
import { getSalaryStructure, upsertSalaryStructure } from "@/lib/services/payroll";
import { salaryStructureSchema } from "@/lib/validation";

export const GET = route(
  async (_request: Request, context: { params: Promise<{ id: string }> }) => {
    const { actor } = await requireActor();
    const { id } = await context.params;
    // Throws FORBIDDEN unless the caller is HR/Admin or the employee themselves.
    return jsonOk({ salary: await getSalaryStructure(actor, id) });
  },
);

export const PUT = route(
  async (request: Request, context: { params: Promise<{ id: string }> }) => {
    const user = await requireManagement();
    const { id } = await context.params;
    const input = salaryStructureSchema.parse(await readJson(request));

    const salary = await upsertSalaryStructure(toActor(user), user.fullName, id, input);
    return jsonOk({
      salary,
      message: `Salary structure saved (revision ${salary.revision}). The employee has been notified.`,
    });
  },
);
