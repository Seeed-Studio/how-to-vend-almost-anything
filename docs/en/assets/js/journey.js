const STATUS_LABEL = {
  done: "Done",
  in_progress: "In progress",
  needs_contributors: "Needs contributors",
  planned: "Planned"
};

const MATURITY_LABEL = {
  idea: "Idea",
  draft: "Draft",
  under_review: "Under review",
  accepted: "Accepted"
};

const MODEL_LABEL = {
  current: "Current reference",
  alternative: "Alternative, not a revision",
  proposed: "Proposed",
  superseded: "Superseded"
};

function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, (ch) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#39;"
  }[ch]));
}

function safeHref(url) {
  if (!url) return "";
  if (url.startsWith("https://") || url.startsWith("http://")) return url;
  if (/^[a-z0-9].*\.html([#?].*)?$/i.test(url) || url.startsWith("#")) return url;
  return "";
}

function cadHref(source) {
  const encoded = String(source).split("/").map((part) => encodeURIComponent(part)).join("/");
  return `https://github.com/Seeed-Studio/how-to-vend-almost-anything/blob/main/${encoded}`;
}

function statusPill(status) {
  const label = STATUS_LABEL[status] || status;
  return `<span class="status status-${esc(status)}">${esc(label)}</span>`;
}

function link(url, label) {
  const href = safeHref(url);
  if (!href) return "";
  const external = href.startsWith("http");
  return `<a href="${esc(href)}"${external ? ' target="_blank" rel="noreferrer"' : ""}>${esc(label)}</a>`;
}

async function load(path) {
  const response = await fetch(path);
  if (!response.ok) throw new Error(`${path} returned ${response.status}`);
  return response.json();
}

function renderPhases(roadmap) {
  const root = document.querySelector("#phases");
  root.innerHTML = roadmap.phases.map((phase) => {
    const items = roadmap.items.filter((item) => item.phase === phase.id);
    const cards = items.map((item) => `
      <li class="card-${esc(item.status)}">
        ${statusPill(item.status)}
        <h3>${esc(item.title)}</h3>
        <p>${esc(item.description)}</p>
        <p>${link(item.evidence_url, "Source")} ${link(item.contribution_url, "Contribute")}</p>
      </li>
    `).join("");
    const cta = safeHref(phase.cta_url);
    return `
      <article class="phase phase-${esc(phase.id)}">
        <p class="phase-kicker">${esc(phase.kicker)} · ${esc(phase.label)}</p>
        <h2>${esc(phase.title)}</h2>
        <p class="phase-summary">${esc(phase.summary)}</p>
        <ul class="phase-items">${cards}</ul>
        ${cta ? `<a class="btn btn-outline" href="${esc(cta)}">${esc(phase.cta_label)}</a>` : ""}
      </article>
    `;
  }).join("");
}

function renderModules(modules) {
  const system = document.querySelector("#filter-system").value;
  const status = document.querySelector("#filter-status").value;
  const opportunity = document.querySelector("#filter-opportunity").value;
  const visible = modules.filter((item) => {
    if (system !== "all" && item.system !== system) return false;
    if (status !== "all" && item.status !== status) return false;
    if (opportunity === "open") {
      const open = item.status === "needs_contributors" || item.status === "in_progress" || (item.status === "planned" && item.contribution_url);
      if (!open) return false;
    }
    return true;
  });
  const root = document.querySelector("#modules");
  if (!visible.length) {
    root.innerHTML = `<p class="empty-note">No modules match these filters.</p>`;
    return;
  }
  root.innerHTML = visible.map((item) => `
    <article class="module card-${esc(item.status)}">
      ${statusPill(item.status)}
      <h3>${esc(item.name)}</h3>
      <p>${esc(item.purpose)}</p>
      <dl>
        <div><dt>Existing implementation</dt><dd>${esc(item.existing)}</dd></div>
        <div><dt>Missing work</dt><dd>${esc(item.missing)}</dd></div>
        <div><dt>Required contribution</dt><dd>${esc(item.contribution)}</dd></div>
        <div><dt>Latest verified update</dt><dd>${esc(item.updated_at)}</dd></div>
        <div><dt>Next milestone</dt><dd>${esc(item.next_milestone)}</dd></div>
      </dl>
      <p>${link(item.evidence_url, "Source")} ${link(item.contribution_url, "Contribution")}</p>
    </article>
  `).join("");
}

function renderParts(models) {
  const replacements = Array.isArray(window.VENDING_REPLACEMENTS) ? window.VENDING_REPLACEMENTS : [];
  const root = document.querySelector("#parts");
  const groups = [...new Set(models.parts.map((part) => part.group))];
  root.innerHTML = groups.map((group) => {
    const cards = models.parts.filter((part) => part.group === group).map((part) => `
      <article class="part-card">
        <span class="status status-${part.status === "current" ? "done" : "planned"}">${esc(MODEL_LABEL[part.status] || part.status)}</span>
        <h3>${esc(part.name)}</h3>
        <p>${esc(part.part_id)} · ${esc(part.version)}</p>
        <p>${esc(part.notes)}</p>
        <p>${link(cadHref(part.source_model), "Source CAD")}</p>
      </article>
    `).join("");
    return `<section><h3>${esc(group)}</h3><div class="part-grid">${cards}</div></section>`;
  }).join("");

  const history = document.querySelector("#replacements");
  if (!replacements.length) {
    history.innerHTML = `<p class="empty-note">No replacements have been submitted. Version Zero stays the current set, and an alternative part in that set is not a newer revision.</p>`;
    return;
  }
  history.innerHTML = replacements.map((item) => `
    <article class="part-card card-planned">
      <span class="status status-planned">Replacement ${esc(item.version || "")}</span>
      <h3>${esc(item.title || item.partId)}</h3>
      <p>Part ${esc(item.partId)}. This is added beside Version Zero, not written over it.</p>
      <p>${esc(item.note || "")}</p>
      ${item.source ? `<p>${link(cadHref(item.source.startsWith("xiao-") ? item.source : `xiao-vending-machine-assemble-steps/hardware-preparatory/stl-files/${item.source}`), "Source CAD")}</p>` : ""}
    </article>
  `).join("");
}

function renderStandards(standards) {
  document.querySelector("#standards").innerHTML = standards.standards.map((item) => `
    <article class="standard card-planned">
      <span class="status status-planned">${esc(MATURITY_LABEL[item.maturity] || item.maturity)}</span>
      <h3>${esc(item.title)}</h3>
      <p>${esc(item.summary)}</p>
    </article>
  `).join("");
}

function renderContributions(items) {
  document.querySelector("#contributions").innerHTML = items.map((item) => `
    <article class="contrib card-needs_contributors">
      <h3>${esc(item.title)}</h3>
      <p><strong>Problem.</strong> ${esc(item.problem)}</p>
      <p><strong>Expected output.</strong> ${esc(item.expected_output)}</p>
      <p><strong>Source.</strong> ${esc(item.source_files)}</p>
      <p><strong>Acceptance.</strong> ${esc(item.acceptance)}</p>
      <p>${link(item.url, "Open the GitHub issue")}</p>
    </article>
  `).join("");
}

async function init() {
  const error = document.querySelector("#data-error");
  try {
    const [roadmap, implementations, standards, models] = await Promise.all([
      load("data/roadmap.json"),
      load("data/implementations.json"),
      load("data/standards.json"),
      load("data/models.json")
    ]);
    renderPhases(roadmap);
    const systemFilter = document.querySelector("#filter-system");
    implementations.modules.forEach((item) => {
      const option = document.createElement("option");
      option.value = item.system;
      option.textContent = item.name;
      systemFilter.append(option);
    });
    const apply = () => renderModules(implementations.modules);
    document.querySelector("#filters").addEventListener("submit", (event) => event.preventDefault());
    document.querySelector("#filters").addEventListener("change", apply);
    apply();
    renderParts(models);
    renderStandards(standards);
    renderContributions(implementations.contributions);
    const note = document.querySelector("#model-note");
    if (note) note.textContent = models.note;
  } catch (cause) {
    error.hidden = false;
    error.textContent = `The roadmap data could not be loaded. Serve this folder over HTTP and reload. ${cause.message}`;
  }
}

init();
