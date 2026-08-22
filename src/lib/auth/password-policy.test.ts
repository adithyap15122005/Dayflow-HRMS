import { describe, expect, it } from "vitest";

import { PASSWORD_RULES, checkPasswordStrength } from "@/lib/auth/password-policy";

describe("checkPasswordStrength", () => {
  it("surfaces the length requirement first for a short password", () => {
    const result = checkPasswordStrength("Ab1!");
    expect(result.ok).toBe(false);
    expect(result.problems[0]).toBe("Use at least 10 characters");
    expect(result.problems).toEqual(["Use at least 10 characters"]);
    // 10 characters is the boundary, not 9.
    expect(checkPasswordStrength("Abcdefgh1!").ok).toBe(true);
    expect(checkPasswordStrength("Abcdefg1!").problems).toContain(
      "Use at least 10 characters",
    );
  });

  it("reports a missing uppercase letter", () => {
    const result = checkPasswordStrength("abcdefgh1!");
    expect(result.ok).toBe(false);
    expect(result.problems).toEqual(["Add an uppercase letter"]);
  });

  it("reports a missing lowercase letter", () => {
    expect(checkPasswordStrength("ABCDEFGH1!").problems).toEqual([
      "Add a lowercase letter",
    ]);
  });

  it("reports a missing digit", () => {
    const result = checkPasswordStrength("Abcdefghi!");
    expect(result.ok).toBe(false);
    expect(result.problems).toEqual(["Add a number"]);
  });

  it("reports a missing symbol", () => {
    const result = checkPasswordStrength("Abcdefghi1");
    expect(result.ok).toBe(false);
    expect(result.problems).toEqual(["Add a symbol"]);
  });
  it("rejects passwords on the common deny list, case-insensitively", () => {
    const result = checkPasswordStrength("Dayflow123");
    expect(result.ok).toBe(false);
    expect(result.problems).toContain("This password is too common");
    // Problem order is deterministic: character-class rules come before the deny list.
    expect(result.problems).toEqual(["Add a symbol", "This password is too common"]);

    const worst = checkPasswordStrength("password");
    expect(worst.ok).toBe(false);
    expect(worst.problems[0]).toBe("Use at least 10 characters");
    expect(worst.problems).toContain("This password is too common");
    expect(worst.score).toBe(0);
  });

  it("rejects a single repeated character", () => {
    const result = checkPasswordStrength("aaaaaaaaaa");
    expect(result.ok).toBe(false);
    expect(result.problems).toContain("Avoid repeating a single character");
  });

  it("lists every unmet requirement in a fixed order", () => {
    expect(checkPasswordStrength("abc").problems).toEqual([
      "Use at least 10 characters",
      "Add an uppercase letter",
      "Add a number",
      "Add a symbol",
    ]);
  });

  it("accepts a strong password", () => {
    for (const password of ["Str0ng!Passw0rd", "Kolkata-Monsoon-2026!", "aB3$aB3$aB"]) {
      const result = checkPasswordStrength(password);
      expect(result.ok).toBe(true);
      expect(result.problems).toEqual([]);
      expect(result.score).toBe(4);
    }
  });

  it("scores an empty password at zero without throwing", () => {
    const result = checkPasswordStrength("");
    expect(result.ok).toBe(false);
    expect(result.score).toBe(0);
    // The "repeating character" rule does not fire on an empty string.
    expect(result.problems).not.toContain("Avoid repeating a single character");
  });

  it("increases the score as the password gets stronger", () => {
    const ladder = [
      "abc", // short, no upper, no digit, no symbol
      "abcdefghij", // long enough only
      "Abcdefghij", // + uppercase
      "Abcdefghi1", // + digit
      "Abcdefghi1!", // + symbol -> fully compliant
    ];
    const scores = ladder.map((p) => checkPasswordStrength(p).score);
    expect(scores).toEqual([0, 1, 2, 3, 4]);
    for (let i = 1; i < scores.length; i += 1) {
      expect(scores[i]).toBeGreaterThan(scores[i - 1]);
    }
    expect(checkPasswordStrength(ladder[ladder.length - 1]).ok).toBe(true);
  });

  it("publishes the rules the sign-up form shows", () => {
    expect(PASSWORD_RULES).toHaveLength(4);
    expect(PASSWORD_RULES[0]).toMatch(/10 characters/);
  });
});
