import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
let dataDir = "";
let errors = [];

const dateRe = /^\d{4}-\d{2}-\d{2}$/;
const roadmapStatus = new Set(["done", "in_progress", "needs_contributors", "planned"]);
const maturity = new Set(["idea", "draft", "under_review", "accepted"]);
const modelStatus = new Set(["current", "alternative", "proposed", "superseded"]);
const programParticipation = new Set(["interested", "pilot", "verified", "recent_update"]);
const installationStatus = new Set(["proposed", "pilot", "verified"]);
const availabilityStatus = new Set(["listed", "confirmed"]);
const updateType = new Set(["installation", "upgrade", "product", "availability", "modification", "announcement"]);
const reviewStatus = new Set(["proposed", "approved"]);

function load(name) {
  const path = join(dataDir, name);
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    errors.push(`${name}: ${error.message}`);
    return null;
  }
}

function req(record, fields, label) {
  fields.forEach((field) => {
    if (record[field] === undefined) errors.push(`${label} is missing ${field}`);
  });
}

function unique(records, key, label) {
  const seen = new Set();
  records.forEach((record) => {
    const id = record?.[key];
    if (!id) return;
    if (seen.has(id)) errors.push(`${label} repeats ${key} ${id}`);
    seen.add(id);
  });
}

function checkDate(value, label) {
  if (typeof value !== "string" || !dateRe.test(value)) errors.push(`${label} needs a YYYY-MM-DD date`);
}

function checkUrl(value, label, { allowEmpty = false, allowRelative = false } = {}) {
  if (value === "" && allowEmpty) return;
  if (typeof value !== "string" || !value) {
    errors.push(`${label} needs a URL`);
    return;
  }
  if (value.startsWith("https://") || value.startsWith("http://")) return;
  if (allowRelative && /^[a-z0-9].*\.html([#?].*)?$/i.test(value)) return;
  errors.push(`${label} has an unsupported URL`);
}

function run() {
const roadmap = load("roadmap.json");
const implementations = load("implementations.json");
const standards = load("standards.json");
const models = load("models.json");
const labs = load("labs.json");
const machines = load("machines.json");
const products = load("products.json");
const updates = load("updates.json");
const directory = load("directory-labs.json");

if (roadmap) {
  const phaseIds = new Set((roadmap.phases || []).map((phase) => phase.id));
  ["now", "next", "future"].forEach((id) => {
    if (!phaseIds.has(id)) errors.push(`roadmap.json is missing phase ${id}`);
  });
  unique(roadmap.items || [], "id", "roadmap item");
  (roadmap.items || []).forEach((item) => {
    const label = `roadmap ${item.id || "(no id)"}`;
    req(item, ["id", "title", "description", "phase", "system", "status", "evidence_url", "contribution_url", "updated_at"], label);
    if (!phaseIds.has(item.phase)) errors.push(`${label} uses an unknown phase`);
    if (!roadmapStatus.has(item.status)) errors.push(`${label} has status ${item.status}`);
    checkDate(item.updated_at, label);
    if (item.status === "done") checkUrl(item.evidence_url, `${label} evidence`, { allowRelative: true });
    if (item.status === "needs_contributors") checkUrl(item.contribution_url, `${label} contribution`);
    if (item.status !== "done" && item.evidence_url) checkUrl(item.evidence_url, `${label} evidence`, { allowRelative: true });
    if (item.contribution_url) checkUrl(item.contribution_url, `${label} contribution`);
  });
}

if (implementations) {
  unique(implementations.modules || [], "id", "module");
  (implementations.modules || []).forEach((item) => {
    const label = `module ${item.id || "(no id)"}`;
    req(item, ["id", "name", "system", "purpose", "status", "existing", "missing", "contribution", "evidence_url", "contribution_url", "updated_at", "next_milestone"], label);
    if (item.system !== item.id) errors.push(`${label} system should match its id`);
    if (!roadmapStatus.has(item.status)) errors.push(`${label} has status ${item.status}`);
    checkDate(item.updated_at, label);
    if (item.status === "done") checkUrl(item.evidence_url, `${label} evidence`, { allowRelative: true });
    if (item.status === "needs_contributors" || item.status === "in_progress") checkUrl(item.contribution_url, `${label} contribution`);
    if (item.evidence_url) checkUrl(item.evidence_url, `${label} evidence`, { allowRelative: true });
    if (item.contribution_url) checkUrl(item.contribution_url, `${label} contribution`);
  });
  unique(implementations.contributions || [], "id", "contribution");
  (implementations.contributions || []).forEach((item) => {
    const label = `contribution ${item.id || "(no id)"}`;
    req(item, ["id", "title", "problem", "expected_output", "source_files", "acceptance", "url"], label);
    checkUrl(item.url, `${label} url`);
  });
}

if (standards) {
  unique(standards.standards || [], "id", "standard");
  (standards.standards || []).forEach((item) => {
    const label = `standard ${item.id || "(no id)"}`;
    req(item, ["id", "title", "summary", "maturity", "updated_at"], label);
    if (!maturity.has(item.maturity)) errors.push(`${label} has maturity ${item.maturity}`);
    if (item.maturity === "accepted" && !item.evidence_url) errors.push(`${label} cannot be accepted without evidence_url`);
    checkDate(item.updated_at, label);
  });
}

if (models) {
  unique(models.parts || [], "part_id", "part");
  (models.parts || []).forEach((item) => {
    const label = `part ${item.part_id || "(no id)"}`;
    req(item, ["part_id", "version", "source_model", "display_model", "status", "replaces", "compatibility", "notes", "updated_at"], label);
    if (!modelStatus.has(item.status)) errors.push(`${label} has status ${item.status}`);
    if (item.replaces !== null && typeof item.replaces !== "string") errors.push(`${label} replaces must be a part id or null`);
    checkDate(item.updated_at, label);
    if (item.status === "alternative" && item.replaces) errors.push(`${label} is an alternative and should not be recorded as replacing another part`);
  });
}

function checkLab(item, label, allowed) {
  req(item, ["lab_id", "name", "city", "country", "latitude", "longitude", "official_fablabs_url", "lab_website", "participation_status", "verification_date", "updated_at"], label);
  if (!allowed.has(item.participation_status)) errors.push(`${label} has participation_status ${item.participation_status}`);
  ["latitude", "longitude"].forEach((field) => {
    if (item[field] !== null && typeof item[field] !== "number") errors.push(`${label} ${field} must be a number or null`);
  });
  if (typeof item.latitude === "number" && (item.latitude < -90 || item.latitude > 90)) errors.push(`${label} latitude is out of range`);
  if (typeof item.longitude === "number" && (item.longitude < -180 || item.longitude > 180)) errors.push(`${label} longitude is out of range`);
  checkUrl(item.official_fablabs_url, `${label} official_fablabs_url`);
  if (item.lab_website) checkUrl(item.lab_website, `${label} lab_website`);
  if (item.verification_date !== null) checkDate(item.verification_date, `${label} verification_date`);
  checkDate(item.updated_at, label);
}

if (labs) {
  unique(labs.labs || [], "lab_id", "program lab");
  (labs.labs || []).forEach((item) => checkLab(item, `program lab ${item.lab_id || "(no id)"}`, programParticipation));
}

if (directory) {
  if (!new Set(["awaiting_token", "ok", "error"]).has(directory.status)) errors.push(`directory-labs.json has status ${directory.status}`);
  if (!directory.attribution) errors.push("directory-labs.json needs attribution");
  unique(directory.labs || [], "lab_id", "directory lab");
  (directory.labs || []).forEach((item) => checkLab(item, `directory lab ${item.lab_id || "(no id)"}`, new Set(["directory"])));
}

if (machines) {
  unique(machines.machines || [], "machine_id", "machine");
  (machines.machines || []).forEach((item) => {
    const label = `machine ${item.machine_id || "(no id)"}`;
    req(item, ["machine_id", "lab_id", "version", "installation_status", "published_at", "photo_urls", "product_ids", "verification_source", "updated_at"], label);
    if (!installationStatus.has(item.installation_status)) errors.push(`${label} has installation_status ${item.installation_status}`);
    if (!Array.isArray(item.photo_urls) || !Array.isArray(item.product_ids)) errors.push(`${label} needs photo_urls and product_ids arrays`);
    checkDate(item.published_at, `${label} published_at`);
    checkDate(item.updated_at, label);
    checkUrl(item.verification_source, `${label} verification_source`);
  });
}

if (products) {
  unique(products.products || [], "product_id", "product");
  (products.products || []).forEach((item) => {
    const label = `product ${item.product_id || "(no id)"}`;
    req(item, ["product_id", "name", "category", "machine_id", "availability_status", "availability_updated_at", "product_url"], label);
    if (!availabilityStatus.has(item.availability_status)) errors.push(`${label} has availability_status ${item.availability_status}`);
    if (item.availability_status === "confirmed") checkDate(item.availability_updated_at, `${label} availability_updated_at`);
    else if (item.availability_updated_at !== null) checkDate(item.availability_updated_at, `${label} availability_updated_at`);
    if (item.product_url) checkUrl(item.product_url, `${label} product_url`);
  });
}

if (updates) {
  unique(updates.updates || [], "update_id", "update");
  (updates.updates || []).forEach((item) => {
    const label = `update ${item.update_id || "(no id)"}`;
    req(item, ["update_id", "type", "lab_id", "machine_id", "description", "submitted_at", "verified_at", "review_status", "source_url"], label);
    if (!updateType.has(item.type)) errors.push(`${label} has type ${item.type}`);
    if (!reviewStatus.has(item.review_status)) errors.push(`${label} has review_status ${item.review_status}`);
    checkDate(item.submitted_at, `${label} submitted_at`);
    if (item.review_status === "approved") {
      checkDate(item.verified_at, `${label} verified_at`);
      checkUrl(item.source_url, `${label} source_url`);
    } else if (item.verified_at !== null) {
      checkDate(item.verified_at, `${label} verified_at`);
    }
    if (item.source_url) checkUrl(item.source_url, `${label} source_url`);
  });
}

}

const allErrors = [];
for (const locale of ["en", "ch"]) {
  dataDir = join(root, "docs", locale, "data");
  errors = [];
  run();
  allErrors.push(...errors.map((error) => `${locale}: ${error}`));
}

if (allErrors.length) {
  console.error(allErrors.join("\n"));
  process.exit(1);
}

console.log("Site data is valid.");
