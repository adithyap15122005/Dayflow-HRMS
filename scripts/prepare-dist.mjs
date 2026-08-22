#!/usr/bin/env node
/**
 * Guard against a mixed .next directory.
 *
 * `next dev` and `next build` write different manifests into the same output
 * folder. Running one straight after the other leaves stale routing data, which
 * shows up as API routes 404-ing in dev even though they compile fine. Each mode
 * leaves a distinctive marker, so we can detect the clash and clear the folder
 * instead of asking anyone to remember to do it.
 *
 *   node scripts/prepare-dist.mjs dev     # before next dev
 *   node scripts/prepare-dist.mjs build   # before next build
 */
import { existsSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dist = join(root, ".next");
const mode = process.argv[2] === "build" ? "build" : "dev";

// A production build writes BUILD_ID; dev writes a .next/dev directory.
const hasBuildOutput = existsSync(join(dist, "BUILD_ID"));
const hasDevOutput = existsSync(join(dist, "dev"));
const clash = mode === "dev" ? hasBuildOutput : hasDevOutput;

if (clash) {
  rmSync(dist, { recursive: true, force: true });
  console.log(
    `▸ Cleared .next (it held ${mode === "dev" ? "production build" : "dev server"} output)`,
  );
}
