/**
 * Password policy — pure, dependency-free, and therefore safe to import in the
 * browser. The hashing helpers live in `password.ts` (which pulls in bcrypt and
 * must stay server-side).
 */

export type PasswordCheck = {
  ok: boolean;
  score: 0 | 1 | 2 | 3 | 4;
  /** Failing requirements, in the order they should be shown. */
  problems: string[];
};

const COMMON = new Set([
  "password",
  "password1",
  "password123",
  "12345678",
  "qwerty123",
  "letmein1",
  "welcome1",
  "admin123",
  "dayflow123",
  "iloveyou",
]);

/**
 * Length + character variety + a small common-password deny list. Problems are
 * returned as a list so the form can show exactly which requirement is unmet
 * instead of one opaque error.
 */
export function checkPasswordStrength(password: string): PasswordCheck {
  const problems: string[] = [];
  if (password.length < 10) problems.push("Use at least 10 characters");
  if (!/[a-z]/.test(password)) problems.push("Add a lowercase letter");
  if (!/[A-Z]/.test(password)) problems.push("Add an uppercase letter");
  if (!/\d/.test(password)) problems.push("Add a number");
  if (!/[^A-Za-z0-9]/.test(password)) problems.push("Add a symbol");
  if (COMMON.has(password.toLowerCase())) problems.push("This password is too common");
  if (password.length > 0 && /^(.)\1+$/.test(password)) {
    problems.push("Avoid repeating a single character");
  }

  const satisfied = 5 - Math.min(5, problems.length);
  const score = Math.max(0, Math.min(4, satisfied - 1)) as PasswordCheck["score"];
  return { ok: problems.length === 0, score, problems };
}

export const PASSWORD_RULES = [
  "At least 10 characters",
  "Upper and lowercase",
  "A number",
  "A symbol",
] as const;
