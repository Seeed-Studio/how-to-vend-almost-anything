import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outputs = [
  {
    path: join(root, "docs", "en", "data", "directory-labs.json"),
    note: (count, day) => `Fetched ${count} FabLabs.io directory listings on ${day}. A directory listing is not participation in this vending program.`
  },
  {
    path: join(root, "docs", "ch", "data", "directory-labs.json"),
    note: (count, day) => `已于 ${day} 抓取 ${count} 条 FabLabs.io 名录。名录条目不是参与这个售货项目。`
  }
];
const token = process.env.FABLABS_ACCESS_TOKEN || "";
const base = (process.env.FABLABS_API_BASE || "https://api.fablabs.io").replace(/\/$/, "");

if (!token) {
  console.log("FABLABS_ACCESS_TOKEN is not set.");
  console.log("A person must register a FabLabs.io application and complete OAuth once.");
  console.log("GitHub Pages cannot perform that login. See docs/en/FABLABS_DIRECTORY.md.");
  console.log("Leaving docs/en/data/directory-labs.json and docs/ch/data/directory-labs.json unchanged.");
  process.exit(0);
}

function endpoint(path) {
  return new URL(path.replace(/^\//, ""), `${base}/`);
}

async function getJson(url) {
  const response = await fetch(url, {
    headers: {
      Accept: "application/vnd.api+json, application/json",
      Authorization: `Bearer ${token}`,
      "User-Agent": "how-to-vend-almost-anything-directory-sync"
    }
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`${response.status} ${url.pathname} ${detail.slice(0, 180)}`);
  }
  return response.json();
}

function asArray(payload) {
  if (!payload) return [];
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload.data)) return payload.data;
  if (Array.isArray(payload.labs)) return payload.labs;
  if (Array.isArray(payload.features)) return payload.features;
  return [];
}

function dig(source, paths) {
  for (const path of paths) {
    let current = source;
    let found = true;
    for (const key of path) {
      if (current && typeof current === "object" && key in current) current = current[key];
      else {
        found = false;
        break;
      }
    }
    if (found && current !== undefined && current !== null && current !== "") return current;
  }
  return null;
}

function httpUrl(value) {
  return typeof value === "string" && /^https?:\/\//i.test(value) ? value : "";
}

function numberOrNull(value) {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) ? number : null;
}

function normalize(record) {
  const attributes = record.attributes || record.properties || {};
  const source = { ...record, attributes };
  const id = dig(source, [["id"], ["attributes", "id"], ["properties", "id"], ["slug"], ["attributes", "slug"]]);
  const name = dig(source, [["attributes", "name"], ["name"], ["properties", "name"]]);
  if (!id || !name) return null;
  const slug = dig(source, [["attributes", "slug"], ["slug"], ["properties", "slug"]]);
  const self = httpUrl(dig(source, [["links", "self"], ["attributes", "url"], ["properties", "url"]]));
  const profile = slug
    ? `https://www.fablabs.io/labs/${encodeURIComponent(slug)}`
    : (self.includes("fablabs.io") && !self.includes("://api.") ? self : "https://www.fablabs.io/");
  const latitude = numberOrNull(dig(source, [
    ["attributes", "latitude"],
    ["attributes", "coordinates", "latitude"],
    ["latitude"],
    ["lat"],
    ["geometry", "coordinates", "1"]
  ]) ?? (Array.isArray(record.geometry?.coordinates) ? record.geometry.coordinates[1] : null));
  const longitude = numberOrNull(dig(source, [
    ["attributes", "longitude"],
    ["attributes", "coordinates", "longitude"],
    ["longitude"],
    ["lon"],
    ["lng"]
  ]) ?? (Array.isArray(record.geometry?.coordinates) ? record.geometry.coordinates[0] : null));
  const today = new Date().toISOString().slice(0, 10);
  return {
    lab_id: `fablabs:${id}`,
    name: String(name),
    city: String(dig(source, [["attributes", "city"], ["attributes", "address", "city"], ["city"], ["properties", "city"]]) || ""),
    country: String(dig(source, [["attributes", "country"], ["attributes", "country_code"], ["country"], ["properties", "country"]]) || ""),
    latitude,
    longitude,
    official_fablabs_url: profile,
    lab_website: httpUrl(dig(source, [["attributes", "website"], ["attributes", "lab_url"], ["website"], ["properties", "website"]])),
    participation_status: "directory",
    verification_date: null,
    updated_at: today
  };
}

async function fetchAll() {
  const mapPayload = await getJson(endpoint("labs/map"));
  const collected = [...asArray(mapPayload)];
  for (let page = 1; page <= 40; page += 1) {
    const url = endpoint("labs");
    url.searchParams.set("page", String(page));
    url.searchParams.set("page_size", "100");
    const payload = await getJson(url);
    const batch = asArray(payload);
    if (!batch.length) break;
    collected.push(...batch);
    if (batch.length < 100) break;
  }
  return collected;
}

try {
  const records = await fetchAll();
  const labs = [];
  const seen = new Set();
  records.forEach((record) => {
    const lab = normalize(record);
    if (!lab || seen.has(lab.lab_id)) return;
    seen.add(lab.lab_id);
    labs.push(lab);
  });
  labs.sort((a, b) => `${a.country}${a.city}${a.name}`.localeCompare(`${b.country}${b.city}${b.name}`));
  if (!labs.length) {
    console.error("The API responded, but no labs could be read. The snapshot was not replaced.");
    process.exit(1);
  }
  const day = new Date().toISOString().slice(0, 10);
  const fetchedAt = new Date().toISOString();
  for (const output of outputs) {
    const previous = JSON.parse(readFileSync(output.path, "utf8"));
    const next = {
      source: "https://www.fablabs.io/",
      attribution: previous.attribution,
      api_base: base,
      fetched_at: fetchedAt,
      status: "ok",
      note: output.note(labs.length, day),
      labs
    };
    writeFileSync(output.path, `${JSON.stringify(next, null, 2)}\n`);
  }
  console.log(`Wrote ${labs.length} directory labs to en and ch.`);
} catch (error) {
  console.error(error.message || error);
  console.error("The previous snapshot was left in place.");
  process.exit(1);
}
