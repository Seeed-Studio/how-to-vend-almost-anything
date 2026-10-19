/**
 * Fab Lab Vending contribution worker. Deploy separately from GitHub Pages.
 * Untrusted submissions become DRAFT pull requests in contributions/proposals/.
 * NEVER merge, execute, or publish submitted code automatically.
 * GitHub App authentication and Cloudflare Turnstile are required server-side.
 */
const EXTENSIONS = new Set(["stl", "step", "stp", "3mf", "glb", "gltf", "dxf", "svg", "pdf", "png", "jpg", "jpeg", "md", "txt", "json", "csv", "kicad_pcb", "kicad_sch", "ino", "py", "cpp", "h", "zip"]);
const SYSTEMS = new Set(["dispensing", "storage", "enclosure", "control"]);
const CHANGE_TYPES = new Set(["idea", "new_module", "alternative", "revision"]);
const MAX_FILE = 5 * 1024 * 1024;
const MAX_TOTAL = 12 * 1024 * 1024;
const API = "https://api.github.com";
const HEADERS = { Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28", "User-Agent": "fab-vending-contribution-worker" };

class SubmissionError extends Error {
  constructor(message, status = 400) { super(message); this.status = status; }
}

function cors(origin, env) {
  const allowed = new URL(env.ALLOWED_ORIGIN).origin;
  return { "Access-Control-Allow-Origin": origin === allowed ? origin : allowed, "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type", "Access-Control-Max-Age": "600", "Vary": "Origin" };
}
function json(data, status, headers) {
  return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...headers } });
}
function getText(form, name, max = 2500) {
  const value = form.get(name);
  if (value == null) return "";
  if (typeof value !== "string") throw new SubmissionError(`Invalid field: ${name}`);
  const text = value.trim();
  if (text.length > max) throw new SubmissionError(`${name} is too long.`);
  return text;
}
function basename(filename) {
  return filename.normalize("NFKC").replace(/[^a-zA-Z0-9._-]/g, "-").replace(/^\.+/, "").slice(0, 130);
}
function toBase64(bytes) {
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 0x8000) binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  return btoa(binary);
}
function utf8Base64(text) { return toBase64(new TextEncoder().encode(text)); }
function urlBase64(bytes) { return toBase64(bytes).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""); }
async function sha256(bytes) { return Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))).map(x => x.toString(16).padStart(2, "0")).join(""); }

export function validateProposal(form) {
  const system = getText(form, "system", 30);
  if (!SYSTEMS.has(system)) throw new SubmissionError("Unknown system category.");
  const changeType = getText(form, "changeType", 30);
  if (!CHANGE_TYPES.has(changeType)) throw new SubmissionError("Unknown contribution type.");
  const title = getText(form, "title", 100);
  const description = getText(form, "description", 2500);
  const license = getText(form, "license", 120);
  if (title.length < 5 || description.length < 15 || license.length < 3) throw new SubmissionError("Title, description, and file license must be filled in.");
  const version = getText(form, "version", 100);
  const evidence = getText(form, "evidence", 2000);
  const contributor = getText(form, "contributor", 80);
  const files = form.getAll("files").filter(item => item && typeof item !== "string" && item.name !== "" && item.size >= 0);
  if (files.length > 4) throw new SubmissionError("Maximum four files per proposal.");
  let total = 0;
  for (const file of files) {
    if (file.size > MAX_FILE) throw new SubmissionError(`File too large: ${file.name}`);
    total += file.size;
    if (file.name.length > 140 || file.name.includes("/") || file.name.includes("\\")) throw new SubmissionError("Unsafe or overly long filename.");
    const ext = file.name.split(".").pop()?.toLowerCase();
    if (!EXTENSIONS.has(ext)) throw new SubmissionError(`File type not allowed: ${file.name}`);
  }
  if (total > MAX_TOTAL) throw new SubmissionError("The combined files exceed 12 MB.");
  return { system, changeType, title, description, license, version, evidence, contributor, files };
}

async function verifyTurnstile(token, request, env) {
  if (!token || token.length > 2048) throw new SubmissionError("Please complete the security check.", 403);
  const body = new URLSearchParams({ secret: env.TURNSTILE_SECRET, response: token });
  const ip = request.headers.get("CF-Connecting-IP");
  if (ip) body.set("remoteip", ip);
  const result = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", { method: "POST", body });
  if (!result.ok) throw new SubmissionError("Verification service unavailable. Try again.", 503);
  const checked = await result.json();
  const hostname = new URL(env.ALLOWED_ORIGIN).hostname;
  if (!checked.success || checked.hostname !== hostname) throw new SubmissionError("Security verification failed. Please retry.", 403);
}

async function appJwt(env) {
  // Store a PKCS#8 unencrypted private key as a Worker SECRET, not a site asset.
  const pem = env.GITHUB_APP_PRIVATE_KEY.replace(/\\n/g, "\n").replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\s+/g, "");
  const raw = Uint8Array.from(atob(pem), char => char.charCodeAt(0));
  const key = await crypto.subtle.importKey("pkcs8", raw, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
  const now = Math.floor(Date.now() / 1000);
  const header = urlBase64(new TextEncoder().encode(JSON.stringify({ alg: "RS256", typ: "JWT" })));
  const claims = urlBase64(new TextEncoder().encode(JSON.stringify({ iat: now - 60, exp: now + 480, iss: env.GITHUB_APP_ID })));
  const content = `${header}.${claims}`;
  const signature = new Uint8Array(await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(content)));
  return `${content}.${urlBase64(signature)}`;
}
async function github(path, token, method = "GET", payload = undefined) {
  const response = await fetch(`${API}${path}`, { method, headers: { ...HEADERS, Authorization: `Bearer ${token}`, ...(payload == null ? {} : { "Content-Type": "application/json" }) }, ...(payload == null ? {} : { body: JSON.stringify(payload) }) });
  let result = {};
  try { result = await response.json(); } catch { /* non-JSON API errors */ }
  if (!response.ok) {
    console.error(`GitHub API ${method} ${path} returned ${response.status}`, result.message || "");
    throw new SubmissionError(`GitHub couldn't create the pull request (API status ${response.status}).`, 502);
  }
  return result;
}
async function getInstallationToken(env) {
  const jwt = await appJwt(env);
  const auth = await github(`/app/installations/${encodeURIComponent(env.GITHUB_INSTALLATION_ID)}/access_tokens`, jwt, "POST", {
    repositories: [env.REPOSITORY_NAME],
    permissions: { contents: "write", pull_requests: "write" }
  });
  if (!auth.token) throw new SubmissionError("The GitHub App did not return a token.", 502);
  return auth.token;
}

async function makeDraftPullRequest(proposal, env) {
  const token = await getInstallationToken(env);
  const owner = encodeURIComponent(env.REPOSITORY_OWNER);
  const repo = encodeURIComponent(env.REPOSITORY_NAME);
  const base = env.BASE_BRANCH || "main";
  if (!/^[A-Za-z0-9._/-]+$/.test(base) || base.includes("..")) throw new SubmissionError("Invalid configured branch.", 503);
  const baseRef = await github(`/repos/${owner}/${repo}/git/ref/heads/${encodeURIComponent(base)}`, token);
  const originalCommit = baseRef.object?.sha;
  if (!originalCommit) throw new SubmissionError("Couldn't read the base branch.", 502);
  const original = await github(`/repos/${owner}/${repo}/git/commits/${originalCommit}`, token);
  const id = crypto.randomUUID();
  const directory = `contributions/proposals/${proposal.system}/${id}`;
  const treeEntries = [];
  const manifestFiles = [];
  const seen = new Set();
  for (const file of proposal.files) {
    let safe = basename(file.name) || "attachment";
    if (seen.has(safe.toLowerCase())) safe = `${crypto.randomUUID().slice(0, 8)}-${safe}`;
    seen.add(safe.toLowerCase());
    const bytes = new Uint8Array(await file.arrayBuffer());
    const blob = await github(`/repos/${owner}/${repo}/git/blobs`, token, "POST", { content: toBase64(bytes), encoding: "base64" });
    treeEntries.push({ path: `${directory}/files/${safe}`, mode: "100644", type: "blob", sha: blob.sha });
    manifestFiles.push({ original_name: file.name, stored_name: safe, size_bytes: bytes.length, sha256: await sha256(bytes), mime_type: file.type || "application/octet-stream" });
  }
  const metadata = {
    schema_version: 1,
    proposal_id: id,
    system: proposal.system,
    change_type: proposal.changeType,
    title: proposal.title,
    description: proposal.description,
    proposed_part_or_version: proposal.version || null,
    compatibility_and_evidence: proposal.evidence || "Untested / not supplied",
    license_declared_by_contributor: proposal.license,
    contributor_claim_unverified: proposal.contributor || null,
    status: "proposal_unreviewed",
    source_reference: "Version Zero preserved; no file under xiao-vending-machine-v0/ is changed",
    received_at: new Date().toISOString(),
    files: manifestFiles
  };
  const content = await github(`/repos/${owner}/${repo}/git/blobs`, token, "POST", { content: utf8Base64(JSON.stringify(metadata, null, 2) + "\n"), encoding: "base64" });
  treeEntries.push({ path: `${directory}/proposal.json`, mode: "100644", type: "blob", sha: content.sha });
  const newTree = await github(`/repos/${owner}/${repo}/git/trees`, token, "POST", { base_tree: original.tree.sha, tree: treeEntries });
  const commit = await github(`/repos/${owner}/${repo}/git/commits`, token, "POST", { message: `proposal(${proposal.system}): ${proposal.title}\n\nSubmission: ${id}\nUnreviewed — not a release`, tree: newTree.sha, parents: [originalCommit] });
  const branch = `contributions/${proposal.system}/${id}`;
  await github(`/repos/${owner}/${repo}/git/refs`, token, "POST", { ref: `refs/heads/${branch}`, sha: commit.sha });
  const clean = value => value.replace(/[<>]/g, "");
  const body = [
    `## ${clean(proposal.title)}`,
    "**Unreviewed external proposal — do not merge automatically.**",
    `- System: **${proposal.system}**`,
    `- Type: **${proposal.changeType}**`,
    `- License stated: **${clean(proposal.license)}**`,
    `- Contributor (unverified): ${clean(proposal.contributor || "Anonymous")}`,
    `- Proposed part/version: ${clean(proposal.version || "Not specified")}`,
    `- Submission folder: \`${directory}/\``,
    "### What changes", clean(proposal.description),
    "### Compatibility / evidence", clean(proposal.evidence || "Not yet tested"),
    "### Maintainer checklist", "- [ ] Verify source and permission to redistribute", "- [ ] Review security and file types", "- [ ] Test against Version Zero and state compatibility", "- [ ] Consider interfaces and release criteria", "- [ ] Merge the proposal only after review. Do not overwrite V0 files."
  ].join("\n\n");
  try {
    const pr = await github(`/repos/${owner}/${repo}/pulls`, token, "POST", { head: branch, base, draft: true, title: `[${proposal.system}] ${proposal.title}`, body });
    return { pr_url: pr.html_url, pr_number: pr.number, proposal_id: id, folder: directory };
  } catch (error) {
    console.error("Branch was created but PR creation failed", branch);
    throw error;
  }
}

export default {
  async fetch(request, env) {
    let headers = {};
    try {
      if (!env.ALLOWED_ORIGIN) throw new SubmissionError("Site origin is not configured.", 503);
      const origin = request.headers.get("Origin");
      headers = cors(origin, env);
      const path = new URL(request.url).pathname;
      if (request.method === "OPTIONS") {
        if (origin !== new URL(env.ALLOWED_ORIGIN).origin) return json({ error: "Origin is not allowed." }, 403, headers);
        return new Response(null, { status: 204, headers });
      }
      if (request.method !== "POST" || path !== "/api/submissions") return json({ error: "Not found." }, 404, headers);
      if (origin !== new URL(env.ALLOWED_ORIGIN).origin) return json({ error: "Origin is not allowed." }, 403, headers);
      if (!["multipart/form-data"].some(type => request.headers.get("Content-Type")?.startsWith(type))) return json({ error: "Expected a multipart upload." }, 415, headers);
      if (Number(request.headers.get("Content-Length") || 0) > MAX_TOTAL + 2 * 1024 * 1024) return json({ error: "Upload payload too large." }, 413, headers);
      const required = ["TURNSTILE_SECRET", "GITHUB_APP_ID", "GITHUB_APP_PRIVATE_KEY", "GITHUB_INSTALLATION_ID", "REPOSITORY_OWNER", "REPOSITORY_NAME"];
      if (required.some(key => !env[key])) return json({ error: "Submission service not yet configured." }, 503, headers);
      const form = await request.formData();
      const proposal = validateProposal(form);
      const token = getText(form, "turnstile_token", 2048);
      await verifyTurnstile(token, request, env);
      const result = await makeDraftPullRequest(proposal, env);
      return json(result, 201, headers);
    } catch (error) {
      if (error instanceof SubmissionError) return json({ error: error.message }, error.status, headers);
      console.error("Unhandled submission error", error);
      return json({ error: "Unexpected upload service failure. Try GitHub issue instead." }, 500, headers);
    }
  }
};
