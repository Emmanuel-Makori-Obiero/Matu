// scripts/inject-build-id.mjs
//
// Vite copies public/sw.js to the build output verbatim (it's a static
// file, not a JS module, so Vite's `define` doesn't touch it). This script
// runs after `vite build` and replaces the __BUILD_ID__ placeholder with a
// real per-deploy id, so STATIC_CACHE in sw.js changes on every deploy
// without anyone having to remember to hand-bump a version string.
//
// Run this as part of your build script, e.g. in package.json:
//   "build": "vite build && node scripts/inject-build-id.mjs"

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";

// Adjust this if your build output directory differs (check vite.config.ts
// / nitro output — commonly "dist", ".output/public", or similar).
const CANDIDATE_OUTPUT_DIRS = [".output/public", "dist", "dist/client"];

const buildId =
  process.env.VERCEL_GIT_COMMIT_SHA || process.env.GITHUB_SHA || Date.now().toString();

let patched = false;
for (const dir of CANDIDATE_OUTPUT_DIRS) {
  const swPath = join(process.cwd(), dir, "sw.js");
  if (!existsSync(swPath)) continue;
  const contents = readFileSync(swPath, "utf8");
  writeFileSync(swPath, contents.replace("__BUILD_ID__", buildId));
  console.log(`[inject-build-id] Patched ${swPath} with build id ${buildId}`);
  patched = true;
}

if (!patched) {
  console.warn(
    "[inject-build-id] Could not find a built sw.js in any of: " +
      CANDIDATE_OUTPUT_DIRS.join(", ") +
      " — check your Vite/Nitro output directory and update CANDIDATE_OUTPUT_DIRS.",
  );
  process.exit(1);
}
