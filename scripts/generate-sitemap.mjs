// scripts/generate-sitemap.mjs
//
// Generates sitemap.xml (and robots.txt) into the build output directory
// after `vite build`, based on the app's real public routes.
//
// Only routes OUTSIDE `src/routes/_authenticated/` are included — anything
// under `_authenticated` requires login, so Google can't crawl it and it
// has no business being in a sitemap. If you add a new public page (a
// route file directly under src/routes/, not inside _authenticated/),
// add its path to PUBLIC_ROUTES below.
//
// Run this as part of your build script, e.g. in package.json:
//   "build": "vite build && node scripts/inject-build-id.mjs && node scripts/generate-sitemap.mjs"

import { writeFileSync, existsSync, statSync } from "node:fs";
import { join } from "node:path";
import { execSync } from "node:child_process";

const SITE_URL = "https://matuu.co.ke";

// Public route path -> { priority, changefreq }. Keep this in sync with
// src/routes/*.tsx (excluding the _authenticated/ folder).
const PUBLIC_ROUTES = {
  "/": { priority: "1.0", changefreq: "weekly" },
  "/auth": { priority: "0.8", changefreq: "monthly" },
  "/terms": { priority: "0.3", changefreq: "yearly" },
  "/privacy": { priority: "0.3", changefreq: "yearly" },
};

const CANDIDATE_OUTPUT_DIRS = [".vercel/output/static", ".output/public", "dist", "dist/client"];

function lastModFor(routeFile) {
  try {
    const iso = execSync(`git log -1 --format=%cI -- "${routeFile}"`, {
      cwd: process.cwd(),
      stdio: ["pipe", "pipe", "ignore"],
    })
      .toString()
      .trim();
    return iso ? iso.slice(0, 10) : new Date().toISOString().slice(0, 10);
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}

function routeFileFor(routePath) {
  if (routePath === "/") return "src/routes/index.tsx";
  return `src/routes${routePath}.tsx`;
}

function buildSitemap() {
  const urls = Object.entries(PUBLIC_ROUTES)
    .map(([routePath, meta]) => {
      const lastmod = lastModFor(routeFileFor(routePath));
      return `  <url>
    <loc>${SITE_URL}${routePath === "/" ? "" : routePath}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>${meta.changefreq}</changefreq>
    <priority>${meta.priority}</priority>
  </url>`;
    })
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>
`;
}

function buildRobots() {
  return `User-agent: *
Allow: /
Disallow: /auth
Disallow: /account
Disallow: /ride
Disallow: /drive
Disallow: /fleet
Disallow: /wallet
Disallow: /platform-admin
Disallow: /complaints
Disallow: /reviews
Disallow: /roadtrip
Disallow: /parcel
Disallow: /help
Disallow: /verify

Sitemap: ${SITE_URL}/sitemap.xml
`;
}

let wrote = false;
for (const dir of CANDIDATE_OUTPUT_DIRS) {
  const outDir = join(process.cwd(), dir);
  if (!existsSync(outDir) || !statSync(outDir).isDirectory()) continue;

  writeFileSync(join(outDir, "sitemap.xml"), buildSitemap());
  writeFileSync(join(outDir, "robots.txt"), buildRobots());
  console.log(`[generate-sitemap] Wrote sitemap.xml and robots.txt to ${outDir}`);
  wrote = true;
}

if (!wrote) {
  console.warn(
    "[generate-sitemap] Could not find a build output dir in any of: " +
      CANDIDATE_OUTPUT_DIRS.join(", ") +
      " — check your Vite/Nitro output directory and update CANDIDATE_OUTPUT_DIRS.",
  );
  process.exit(1);
}
