import { requireManagement, toActor } from "@/lib/auth/guard";
import { jsonCreated, jsonOk, readJson, route } from "@/lib/http";
import { createEmployee, listEmployees } from "@/lib/services/people";
import { createEmployeeSchema, peopleQuerySchema } from "@/lib/validation";
import { checkPasswordStrength } from "@/lib/auth/password-policy";
import { AppError } from "@/lib/errors";

/**
 * The directory is management-only.
 *
 * Employees find colleagues through `/api/search`, which returns just a name,
 * title and department — enough to locate someone, not enough to enumerate the
 * organisation with contact details and employment status.
 */
export const GET = route(async (request: Request) => {
  const user = await requireManagement();
  const url = new URL(request.url);
  const query = peopleQuerySchema.parse(Object.fromEntries(url.searchParams));
  return jsonOk(await listEmployees(toActor(user), query));
});

export const POST = route(async (request: Request) => {
  const user = await requireManagement();
  const input = createEmployeeSchema.parse(await readJson(request));

  // The temporary password still has to satisfy the policy — HR must not be able
  // to create an account that is weaker than a self-registered one.
  const strength = checkPasswordStrength(input.temporaryPassword);
  if (!strength.ok) {
    throw new AppError("VALIDATION", "Choose a stronger temporary password.", {
      fields: { temporaryPassword: strength.problems[0] },
      hint: strength.problems.join(" · "),
    });
  }

  const employee = await createEmployee(toActor(user), user.fullName, {
    ...input,
    managerId: input.managerId ?? null,
  });

  return jsonCreated({
    id: employee.id,
    employeeCode: employee.employeeCode,
    message: `${employee.firstName} ${employee.lastName} added as ${employee.jobTitle}. They can sign in with the temporary password.`,
  });
});
