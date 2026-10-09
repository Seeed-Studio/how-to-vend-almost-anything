const IS_CHINESE = document.documentElement.lang.startsWith("zh");
const TEXT = IS_CHINESE ? {
  status: { done: "已完成", in_progress: "进行中", needs_contributors: "需要贡献者", planned: "计划中" },
  maturity: { idea: "想法", draft: "草稿", under_review: "审核中", accepted: "已接受" },
  model: { current: "当前参考", alternative: "替代件，不是修订", proposed: "提议", superseded: "已被取代" },
  phases: {
    now: { label: "参考 / 零号版本", title: "已经运行的起点", cta: "参与第一版设计" },
    next: { label: "设计 / 第一版", title: "让参考原型可以复现", cta: "共创下一个版本" },
    future: { label: "发布之后 / 实验室申请", title: "准备好，再连接更多实验室", cta: "探索未来网络" }
  },
  source: "来源 ↗", contribute: "参与贡献 ↗", cad: "源 CAD ↗", updated: "最近核实",
  existing: "已有实现", missing: "尚缺的工作", required: "需要的贡献", milestone: "下一步",
  noModules: "没有模块符合这些筛选。", parts: "个部件", compatibility: "兼容范围", replacement: "替换件",
  noReplacements: "还没有提交替换件。零号版本仍是当前参考，其中的替代零件不是更新修订。",
  alongside: "追加在零号版本旁边，保留原文件。", problem: "问题", output: "有用的产出",
  detail: "源文件与验收", file: "源文件", acceptance: "验收条件", issue: "提出你的方案 ↗",
  error: "工作台资料无法加载。请通过 HTTP 打开页面后刷新。"
} : {
  status: { done: "Done", in_progress: "In progress", needs_contributors: "Needs contributors", planned: "Planned" },
  maturity: { idea: "Idea", draft: "Draft", under_review: "Under review", accepted: "Accepted" },
  model: { current: "Current reference", alternative: "Alternative, not a revision", proposed: "Proposed", superseded: "Superseded" },
  phases: {
    now: { label: "Reference / Version Zero", title: "A working starting point", cta: "Help design Version One" },
    next: { label: "Design / Version One", title: "Make the reference repeatable", cta: "Help define the next version" },
    future: { label: "After launch / Lab applications", title: "Connect labs when the program is ready", cta: "Explore the future network" }
  },
  source: "Source ↗", contribute: "Contribute ↗", cad: "Source CAD ↗", updated: "Latest verified update",
  existing: "Existing implementation", missing: "Missing work", required: "Required contribution", milestone: "Next milestone",
  noModules: "No modules match these filters.", parts: "parts", compatibility: "Compatibility", replacement: "Replacement",
  noReplacements: "No replacements have been submitted. Version Zero stays the current reference; an alternative part in that set is not a newer revision.",
  alongside: "Added beside Version Zero, keeping the original file.", problem: "Problem", output: "Useful outcome",
  detail: "Source files & acceptance", file: "Source files", acceptance: "Acceptance check", issue: "Propose your approach ↗",
  error: "The workbench data could not be loaded. Serve this folder over HTTP and reload."
};

function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, (ch) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
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
  return `<span class="status status-${esc(status)}">${esc(TEXT.status[status] || status)}</span>`;
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
  document.querySelector("#phases").innerHTML = roadmap.phases.map((phase) => {
    const presentation = TEXT.phases[phase.id] || phase;
    const items = roadmap.items.filter((item) => item.phase === phase.id);
    return `
      <article class="phase phase-${esc(phase.id)}">
        <p class="phase-kicker">${esc(phase.kicker)} · ${esc(presentation.label)}</p>
        <h3>${esc(presentation.title)}</h3>
        <p class="phase-summary">${esc(phase.summary)}</p>
        <ul class="phase-items">${items.map((item) => `
          <li class="card-${esc(item.status)}">
            ${statusPill(item.status)}
            <h4>${esc(item.title)}</h4>
            <p>${esc(item.description)}</p>
            <p class="inline-links">${link(item.evidence_url, TEXT.source)} ${link(item.contribution_url, TEXT.contribute)}</p>
            <p class="compact-note">${esc(TEXT.updated)}: ${esc(item.updated_at)}</p>
          </li>
        `).join("")}</ul>
        <p class="inline-links">${link(phase.cta_url, presentation.cta || phase.cta_label)}</p>
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
    root.innerHTML = `<p class="empty-note">${esc(TEXT.noModules)}</p>`;
    return;
  }
  root.innerHTML = visible.map((item) => `
    <details class="module-note fold" id="module-${esc(item.id)}">
      <summary>
        <span class="fold-title"><strong>${esc(item.name)}</strong><span>${esc(item.purpose)}</span></span>
        ${statusPill(item.status)}
      </summary>
      <div class="fold-body">
        <dl>
          <div><dt>${esc(TEXT.existing)}</dt><dd>${esc(item.existing)}</dd></div>
          <div><dt>${esc(TEXT.missing)}</dt><dd>${esc(item.missing)}</dd></div>
          <div><dt>${esc(TEXT.required)}</dt><dd>${esc(item.contribution)}</dd></div>
          <div><dt>${esc(TEXT.milestone)}</dt><dd>${esc(item.next_milestone)}</dd></div>
          <div><dt>${esc(TEXT.updated)}</dt><dd>${esc(item.updated_at)}</dd></div>
        </dl>
        <p class="inline-links">${link(item.evidence_url, TEXT.source)} ${link(item.contribution_url, TEXT.contribute)}</p>
      </div>
    </details>
  `).join("");
}

function renderParts(models) {
  const replacements = Array.isArray(window.VENDING_REPLACEMENTS) ? window.VENDING_REPLACEMENTS : [];
  const groups = [...new Set(models.parts.map((part) => part.group))];
  document.querySelector("#parts").innerHTML = groups.map((group) => {
    const parts = models.parts.filter((part) => part.group === group);
    return `
      <details class="part-group fold">
        <summary><span class="fold-title"><strong>${esc(group)}</strong><span>${parts.length} ${esc(TEXT.parts)}</span></span></summary>
        <div class="fold-body"><ul class="parts-list">${parts.map((part) => `
          <li class="part-row" id="part-${esc(part.part_id)}">
            <div>
              <h4>${esc(part.name)}</h4>
              <p class="compact-note">${esc(part.part_id)} · ${esc(part.version)} <span class="status status-${part.status === "current" ? "done" : "planned"}">${esc(TEXT.model[part.status] || part.status)}</span></p>
              <p>${esc(part.notes)}</p>
              ${part.compatibility ? `<p class="compact-note">${esc(TEXT.compatibility)}: ${esc(part.compatibility)}</p>` : ""}
            </div>
            ${link(cadHref(part.source_model), TEXT.cad)}
          </li>
        `).join("")}</ul></div>
      </details>
    `;
  }).join("");

  const history = document.querySelector("#replacements");
  if (!replacements.length) {
    history.innerHTML = `<p class="empty-note">${esc(TEXT.noReplacements)}</p>`;
    return;
  }
  history.innerHTML = replacements.map((item) => `
    <article class="part-row">
      <div>
        <h4>${esc(item.title || item.partId)}</h4>
        <p class="compact-note">${esc(item.partId)} · ${esc(TEXT.replacement)} ${esc(item.version || "")}</p>
        <p>${esc(TEXT.alongside)} ${esc(item.note || "")}</p>
      </div>
      ${item.source ? link(cadHref(item.source.startsWith("xiao-") ? item.source : `xiao-vending-machine-v0/xiao-vending-machine-assemble-steps/hardware-preparatory/stl-files/${item.source}`), TEXT.cad) : ""}
    </article>
  `).join("");
}

function renderStandards(standards) {
  document.querySelector("#standards").innerHTML = standards.standards.map((item) => `
    <article class="standard-note part-row" id="standard-${esc(item.id)}">
      <div><h4>${esc(item.title)}</h4><p>${esc(item.summary)}</p><p class="compact-note">${esc(TEXT.updated)}: ${esc(item.updated_at)}</p></div>
      <span class="status status-planned">${esc(TEXT.maturity[item.maturity] || item.maturity)}</span>
    </article>
  `).join("");
}

function renderContributions(items) {
  document.querySelector("#contributions").innerHTML = items.map((item, index) => `
    <article class="contrib task-card" id="contribution-${esc(item.id)}">
      <p class="pillar-caption">0${index + 1}</p>
      <h3>${esc(item.title)}</h3>
      <p><strong>${esc(TEXT.problem)}.</strong> ${esc(item.problem)}</p>
      <p><strong>${esc(TEXT.output)}.</strong> ${esc(item.expected_output)}</p>
      <p class="inline-links">${link(item.url, TEXT.issue)}</p>
      <details class="fold">
        <summary><span class="fold-title"><strong>${esc(TEXT.detail)}</strong></span></summary>
        <div class="fold-body"><p><strong>${esc(TEXT.file)}.</strong> ${esc(item.source_files)}</p><p><strong>${esc(TEXT.acceptance)}.</strong> ${esc(item.acceptance)}</p></div>
      </details>
    </article>
  `).join("");
}

async function init() {
  const error = document.querySelector("#data-error");
  try {
    const [roadmap, implementations, standards, models] = await Promise.all([
      load("data/roadmap.json"), load("data/implementations.json"), load("data/standards.json"), load("data/models.json")
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
    document.querySelector("#model-note").textContent = models.note;
    document.dispatchEvent(new CustomEvent("companion:ready"));
  } catch (cause) {
    error.hidden = false;
    error.textContent = `${TEXT.error} ${cause.message}`;
  }
}

init();
