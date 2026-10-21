import { readFileSync, writeFileSync, renameSync, rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
export const DEFAULT_BASE = "https://www.fablabs.io/api";
const regionNames = new Intl.DisplayNames(["en"], { type: "region" });
const socialDomains = ["facebook.com", "instagram.com", "twitter.com", "x.com", "linkedin.com", "youtube.com", "youtu.be", "fablabs.io", "flickr.com", "vimeo.com", "tiktok.com"];
// The public directory omits coordinates for these labs. The point is the OpenStreetMap
// place that matches the street address published on the lab's FabLabs.io profile.
export const PLACES_WHEN_MISSING = {
  "fablabs:1543": { latitude: 22.5767074, longitude: 113.9387176 }
};

export function httpUrl(value) {
  if (typeof value !== "string") return "";
  try {
    const url = new URL(value.trim());
    return ["http:", "https:"].includes(url.protocol) && !url.username && !url.password ? url.href : "";
  } catch { return ""; }
}

function coordinate(value, limit) {
  if (!["number", "string"].includes(typeof value) || (typeof value === "string" && !value.trim())) return null;
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) && Math.abs(number) <= limit ? number : null;
}

export function normalize(record, day) {
  if (!record || record.id === undefined || record.id === null || !record.name || !record.slug) throw new Error("A directory record is missing id, name, or slug.");
  const code = String(record.country_code || "").toUpperCase();
  let country = code;
  try { if (code) country = regionNames.of(code) || code; } catch { /* Retain an unrecognized region code. */ }
  const links = [...new Set((Array.isArray(record.links) ? record.links : []).map((item) => httpUrl(item?.url)).filter(Boolean))];
  let latitude = coordinate(record.latitude, 90);
  let longitude = coordinate(record.longitude, 180);
  const placed = PLACES_WHEN_MISSING[`fablabs:${record.id}`];
  if ((latitude === null || longitude === null) && placed) {
    latitude = placed.latitude;
    longitude = placed.longitude;
  }
  // The feed has no primary/type designation. Prefer a supplied non-social link.
  const website = links.find((link) => {
    const host = new URL(link).hostname.toLowerCase();
    return !socialDomains.some((domain) => host === domain || host.endsWith(`.${domain}`));
  }) || "";
  return {
    lab_id: `fablabs:${record.id}`,
    name: String(record.name),
    city: String(record.city || ""),
    country,
    country_code: code,
    latitude,
    longitude,
    official_fablabs_url: `https://www.fablabs.io/labs/${encodeURIComponent(record.slug)}`,
    lab_website: website,
    directory_links: links,
    capabilities: Array.isArray(record.capabilities) ? [...new Set(record.capabilities.filter((item) => typeof item === "string" && item))] : [],
    activity_status: ["active", "planned", "closed", "corona"].includes(record.activity_status) ? record.activity_status : "unknown",
    participation_status: "directory",
    verification_date: null,
    // This is the snapshot date, not a provider-supplied profile update time.
    updated_at: day
  };
}

export function normalizeDirectory(records, day) {
  if (!Array.isArray(records) || !records.length) throw new Error("Expected a nonempty full directory array; the previous snapshot was not replaced.");
  const labs = records.map((record) => normalize(record, day));
  if (new Set(labs.map((lab) => lab.lab_id)).size !== labs.length) throw new Error("Duplicate directory IDs; the previous snapshot was not replaced.");
  return labs.sort((a, b) => `${a.country}${a.city}${a.name}`.localeCompare(`${b.country}${b.city}${b.name}`));
}

export async function refreshDirectory({ rootPath = root, base = process.env.FABLABS_API_BASE || DEFAULT_BASE, fetchImpl = fetch } = {}) {
  const url = new URL("labs", `${base.replace(/\/$/, "")}/`);
  if (url.protocol !== "https:") throw new Error("The directory API must use HTTPS.");
  const response = await fetchImpl(url, {
    headers: { Accept: "application/json", "User-Agent": "how-to-vend-almost-anything-directory-sync" },
    signal: AbortSignal.timeout(60000)
  });
  if (!response.ok) throw new Error(`Directory API returned HTTP ${response.status}.`);
  // The live public export returns all approved listings once; it is not paginated.
  const fetchedAt = new Date().toISOString();
  const labs = normalizeDirectory(await response.json(), fetchedAt.slice(0, 10));
  const outputs = ["en", "ch"].map((locale) => {
    const path = join(rootPath, "docs", locale, "data", "directory-labs.json");
    const previous = readFileSync(path, "utf8");
    const prior = JSON.parse(previous);
    const next = {
      source: "https://www.fablabs.io/",
      attribution: "Names, locations, listed capabilities, activity status, and supplied links come from FabLabs.io. Directory membership is not vending participation or Fab Foundation endorsement. Website selection is a heuristic; all safe supplied links are retained.",
      api_base: base,
      api_endpoint: url.href,
      terms_url: "https://www.fablabs.io/tos",
      fetched_at: fetchedAt,
      status: "ok",
      note: locale === "en"
        ? `Fetched ${labs.length} FabLabs.io listings. Activity and capabilities are directory declarations, not verified equipment access or program participation.`
        : `已抓取 ${labs.length} 条 FabLabs.io 名录。活动状态与能力来自名录，不代表已核实的设备使用权或售货项目参与情况。`,
      labs
    };
    // Avoid committing a date-only change when the directory data is unchanged.
    const stable = (rows) => rows.map(({ updated_at, ...lab }) => lab);
    const unchanged = prior.status === "ok" && prior.api_endpoint === url.href && JSON.stringify(stable(prior.labs || [])) === JSON.stringify(stable(labs));
    return { path, previous, text: unchanged ? previous : `${JSON.stringify(next, null, 2)}\n` };
  });
  const changed = outputs.filter((output) => output.text !== output.previous);
  try {
    // Prepare both locale files before replacing either existing snapshot.
    changed.forEach((output) => writeFileSync(`${output.path}.tmp`, output.text));
    changed.forEach((output) => renameSync(`${output.path}.tmp`, output.path));
  } catch (error) {
    changed.forEach((output) => { writeFileSync(output.path, output.previous); });
    throw error;
  } finally {
    changed.forEach((output) => rmSync(`${output.path}.tmp`, { force: true }));
  }
  console.log(`${labs.length} directory listings checked; ${changed.length} locale snapshots changed.`);
  return labs;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { await refreshDirectory(); }
  catch (error) {
    console.error(error.message || error);
    console.error("The previous directory snapshots were left in place.");
    process.exitCode = 1;
  }
}
