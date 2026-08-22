#!/usr/bin/env node
/**
 * One-command bootstrap: `npm run setup`
 *
 * Creates .env with a freshly generated session secret, applies the Prisma
 * schema to a local SQLite file and loads the demo dataset. Safe to re-run — an
 * existing .env is never overwritten.
 */
import { randomBytes } from "node:crypto";
import { execSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const envPath = join(root, ".env");
const templatePath = join(root, ".env.example");

function step(label) {
  process.stdout.write(`\n▸ ${label}\n`);
}

step("Checking environment file");
if (existsSync(envPath)) {
  console.log("  .env already exists — leaving it untouched.");
} else {
  const template = readFileSync(templatePath, "utf8");
  const secret = randomBytes(48).toString("base64url");
  writeFileSync(
    envPath,
    template.replace(
      "replace-me-with-a-long-random-string-at-least-32-chars",
      secret,
    ),
  );
  console.log("  Created .env with a generated SESSION_SECRET.");
}

const run = (command) =>
  execSync(command, { cwd: root, stdio: "inherit", env: process.env });

step("Generating Prisma client");
run("npx prisma generate");

step("Applying schema to SQLite");
run("npx prisma db push --skip-generate");

step("Loading demo data");
run("npx tsx prisma/seed.ts");

console.log("\n✔ Dayflow is ready. Start it with:  npm run dev\n");
