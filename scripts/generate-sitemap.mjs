import { writeFileSync } from "node:fs";
import { resolve } from "node:path";

const RAW_SITE_URL =
  process.env.VITE_SITE_URL ||
  process.env.SITE_URL ||
  process.env.VERCEL_PROJECT_PRODUCTION_URL ||
  process.env.VERCEL_URL ||
  "https://tapatchain.vercel.app";

function normalizeSiteUrl(input) {
  const trimmed = String(input || "").trim();
  if (!trimmed) return "https://tapatchain.vercel.app";

  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  return withProtocol.replace(/\/+$/, "");
}

function toUrl(siteUrl, path) {
  return `${siteUrl}${path}`;
}

const siteUrl = normalizeSiteUrl(RAW_SITE_URL);
const lastmod = new Date().toISOString().slice(0, 10);

const routes = [
  { path: "/", changefreq: "daily", priority: "1.0" },
  { path: "/public-ledger", changefreq: "hourly", priority: "0.9" },
  { path: "/about", changefreq: "monthly", priority: "0.7" },
  { path: "/contact", changefreq: "monthly", priority: "0.7" },
  { path: "/developers", changefreq: "monthly", priority: "0.7" },
  { path: "/privacy", changefreq: "yearly", priority: "0.5" },
  { path: "/terms", changefreq: "yearly", priority: "0.5" },
  { path: "/community", changefreq: "daily", priority: "0.8" },
  { path: "/community/feedback-form", changefreq: "weekly", priority: "0.6" },
  { path: "/community/report-form", changefreq: "weekly", priority: "0.6" },
];

const xml = [
  '<?xml version="1.0" encoding="UTF-8"?>',
  '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
  ...routes.map(
    (route) => [
      "  <url>",
      `    <loc>${toUrl(siteUrl, route.path)}</loc>`,
      `    <lastmod>${lastmod}</lastmod>`,
      `    <changefreq>${route.changefreq}</changefreq>`,
      `    <priority>${route.priority}</priority>`,
      "  </url>",
    ].join("\n")
  ),
  "</urlset>",
].join("\n");

const targetPath = resolve(process.cwd(), "public", "sitemap.xml");
writeFileSync(targetPath, `${xml}\n`, "utf8");

console.log(`[sitemap] Generated ${targetPath} using base URL: ${siteUrl}`);
