(function () {
  const zh = (document.documentElement.lang || "en").toLowerCase().startsWith("zh");
  const text = zh
    ? {
        back: "返回系统",
        part: "零件",
        group: "分组",
        qty: "数量",
        version: "版本",
        source: "打开源模型 ↗",
        reference: "V0 参考",
        replacement: "替换件"
      }
    : {
        back: "Back to system",
        part: "Part",
        group: "Group",
        qty: "Qty",
        version: "Version",
        source: "Open source model ↗",
        reference: "V0 reference",
        replacement: "Replacement"
      };

  const tabs = [...document.querySelectorAll("[data-system]")];
  const panel = document.querySelector("#inspector-content");
  const upload = document.querySelector("#system-upload");
  const tablist = document.querySelector("[data-system-tabs]");
  if (!tabs.length || !panel) return;

  let current = tabs.find((tab) => tab.getAttribute("aria-selected") === "true") || tabs[0];

  function esc(value) {
    return String(value ?? "").replace(/[&<>"']/g, (char) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    }[char]));
  }

  function sourceHref(path) {
    if (!path) return "";
    if (/^https?:\/\//i.test(path)) return path;
    const root = window.VENDING_PARTS?.machine?.sourceRoot || "";
    const base = path.startsWith("parts/") || path.startsWith("case/") ? `${root}/` : "";
    return `https://github.com/Seeed-Studio/how-to-vend-almost-anything/blob/site/fab-vending-pages/${(base + path).split("/").map(encodeURIComponent).join("/")}`;
  }

  function focus(tab) {
    const groups = (tab.dataset.groups || "").split(",").map((item) => item.trim()).filter(Boolean);
    window.VENDING_VIEWER?.focusGroups(groups);
  }

  function showSystem(tab) {
    current = tab;
    tabs.forEach((item) => {
      const selected = item === tab;
      item.setAttribute("aria-selected", selected ? "true" : "false");
      item.tabIndex = selected ? 0 : -1;
    });
    const template = document.querySelector(`#tpl-${tab.dataset.system}`);
    panel.replaceChildren(template ? template.content.cloneNode(true) : document.createTextNode(""));
    panel.setAttribute("aria-labelledby", tab.id);
    if (upload) {
      const system = tab.dataset.system;
      const canUpload = system && system !== "full";
      upload.hidden = !canUpload;
      if (canUpload) upload.dataset.uploadSystem = system;
    }
    focus(tab);
  }

  function showPart(partId) {
    const manifest = window.VENDING_PARTS;
    const part = manifest?.parts?.find((item) => item.id === partId);
    if (!part) return;
    const group = manifest.groups?.find((item) => item.id === part.group);
    const revisions = (window.VENDING_REPLACEMENTS || []).filter((item) => item.partId === part.id);
    const currentModel = revisions.length ? revisions[revisions.length - 1] : null;
    const version = currentModel?.version || manifest.machine?.referenceVersion || "V0";
    const role = currentModel?.note || part.role || "";
    const href = sourceHref(currentModel?.source || part.source);
    panel.innerHTML = `
      <button type="button" class="wb-back" data-back-system>${esc(text.back)}</button>
      <p class="wb-kicker">${esc(part.id)}</p>
      <h2>${esc(currentModel?.title || part.name)}</h2>
      <p>${esc(role)}</p>
      <dl class="wb-facts">
        <div><dt>${esc(text.part)}</dt><dd>${esc(part.id)}</dd></div>
        <div><dt>${esc(text.group)}</dt><dd>${esc(group?.name || part.group)}</dd></div>
        <div><dt>${esc(text.qty)}</dt><dd>×${esc(part.qty || 1)}</dd></div>
        <div><dt>${esc(text.version)}</dt><dd>${esc(version)} · ${esc(currentModel ? text.replacement : text.reference)}</dd></div>
      </dl>
      ${href ? `<p><a href="${esc(href)}" target="_blank" rel="noopener noreferrer">${esc(text.source)}</a></p>` : ""}
    `;
    if (upload) upload.hidden = true;
  }

  tabs.forEach((tab) => {
    tab.addEventListener("click", () => showSystem(tab));
  });

  tablist?.addEventListener("keydown", (event) => {
    const index = tabs.indexOf(document.activeElement);
    if (index < 0) return;
    let next = index;
    if (event.key === "ArrowRight") next = (index + 1) % tabs.length;
    else if (event.key === "ArrowLeft") next = (index - 1 + tabs.length) % tabs.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = tabs.length - 1;
    else return;
    event.preventDefault();
    tabs[next].focus();
    showSystem(tabs[next]);
  });

  panel.addEventListener("click", (event) => {
    if (event.target.closest("[data-back-system]")) showSystem(current);
  });

  document.addEventListener("vending:part", (event) => {
    if (event.detail?.partId) showPart(event.detail.partId);
  });

  showSystem(current);
  if (!window.VENDING_VIEWER) {
    document.addEventListener("vending:ready", () => focus(current), { once: true });
  }
})();
