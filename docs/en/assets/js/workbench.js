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

  let submissions = [];

  function submissionSrc(path) {
    if (!path) return "";
    if (/^(https?:|\/|\.\.)/i.test(path)) return path;
    return `../${path}`;
  }

  function renderSubmissions(root) {
    root.querySelectorAll("[data-submission-slot]").forEach((slot) => {
      const items = submissions.filter((item) => item.system === slot.dataset.system && item.version === slot.dataset.version);
      slot.replaceChildren();
      if (!items.length && slot.dataset.version === "V1") {
        const fab = "../assets/example-fab-showing.jpg";
        const after = "../assets/example-after-looking.jpg";
        const fabLabel = zh ? "这是示例的加工图" : "This is the example fab showing";
        const afterLabel = zh ? "这是示例的实物图" : "This is the example image after looking";
        slot.innerHTML = `
          <div class="wb-proof-grid">
            <figure><button type="button" class="wb-zoom" data-zoom="${fab}"><img src="${fab}" alt="${esc(fabLabel)}"></button><figcaption>${esc(fabLabel)}</figcaption></figure>
            <figure><button type="button" class="wb-zoom" data-zoom="${after}"><img src="${after}" alt="${esc(afterLabel)}"></button><figcaption>${esc(afterLabel)}</figcaption></figure>
          </div>`;
        return;
      }
      items.forEach((item) => {
        const who = [item.name, item.lab].filter(Boolean).join(" · ");
        const sketch = submissionSrc(item.sketch);
        const actual = submissionSrc(item.actual);
        const article = document.createElement("article");
        article.className = "wb-submission";
        article.innerHTML = `
          <h4>${esc(who || item.title || "")}</h4>
          ${item.title ? `<p><strong>${esc(item.title)}</strong></p>` : ""}
          ${item.description ? `<p>${esc(item.description)}</p>` : ""}
          <div class="wb-proof-grid">
            ${sketch ? `<figure><button type="button" class="wb-zoom" data-zoom="${esc(sketch)}"><img src="${esc(sketch)}" alt="Sketch diagram"></button><figcaption>Sketch diagram</figcaption></figure>` : ""}
            ${actual ? `<figure><button type="button" class="wb-zoom" data-zoom="${esc(actual)}"><img src="${esc(actual)}" alt="Actual looking"></button><figcaption>Actual looking</figcaption></figure>` : ""}
          </div>`;
        slot.append(article);
      });
    });
  }

  function loadSubmissions() {
    return fetch(`../submissions.json?v=${Date.now()}`)
      .then((response) => (response.ok ? response.json() : { items: [] }))
      .then((data) => {
        submissions = data.items || [];
        renderSubmissions(panel);
      })
      .catch(() => {});
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
      const canUpload = Boolean(system);
      upload.hidden = !canUpload;
      if (canUpload) upload.dataset.uploadSystem = system;
    }
    focus(tab);
    renderSubmissions(panel);
    window.VENDING_RENDER_IDEAS?.();
  }

  function showPart(partId) {
    const manifest = window.VENDING_PARTS;
    const part = manifest?.parts?.find((item) => item.id === partId);
    if (!part) return;
    const group = manifest.groups?.find((item) => item.id === part.group);
    const revisions = (window.VENDING_REPLACEMENTS || []).filter((item) => item.partId === part.id);
    const currentModel = revisions.length ? revisions[revisions.length - 1] : null;
    const version = currentModel?.version || part.introducedIn || manifest.machine?.referenceVersion || "V0";
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
        <div><dt>${esc(text.version)}</dt><dd>${esc(version)} · ${esc(currentModel || part.introducedIn ? text.replacement : text.reference)}</dd></div>
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

  document.querySelectorAll("[data-close-zoom]").forEach((button) => {
    button.addEventListener("click", () => document.querySelector("#image-zoom")?.close());
  });
  document.addEventListener("click", (event) => {
    const zoom = event.target.closest("[data-zoom]");
    if (!zoom) return;
    const dialog = document.querySelector("#image-zoom");
    const image = dialog?.querySelector("img");
    if (!dialog || !image) return;
    image.src = zoom.dataset.zoom;
    image.alt = zoom.querySelector("img")?.alt || "";
    dialog.showModal();
  });

  document.addEventListener("vending:submissions", () => loadSubmissions());
  showSystem(current);
  loadSubmissions();
  setupIdeas();
  if (!window.VENDING_VIEWER) {
    document.addEventListener("vending:ready", () => focus(current), { once: true });
  }

  function setupIdeas() {
    const copy = zh
      ? {
          empty: "这个系统还没有想法。",
          needText: "想法至少 15 个字。",
          needName: "请填写名字。",
          tooMany: "最多 4 张图片。",
          sending: "正在写入仓库…",
          failed: "没有写入。"
        }
      : {
          empty: "No idea on this system yet.",
          needText: "The idea needs at least 15 characters.",
          needName: "Add the contributor name.",
          tooMany: "Maximum four images.",
          sending: "Saving into the repository…",
          failed: "The idea was not saved."
        };
    const track = document.querySelector("#idea-track");
    const dialog = document.querySelector("#idea-dialog");
    const form = document.querySelector("#idea-form");
    const status = document.querySelector("#idea-status");
    const labSelect = document.querySelector("#idea-lab");
    const systemNames = zh
      ? { full: "00 整机", dispensing: "01 出货", storage: "02 货道", enclosure: "03 箱体", control: "04 控制" }
      : { full: "00 Full design", dispensing: "01 Dispensing", storage: "02 Storage", enclosure: "03 Enclosure", control: "04 Control" };
    let ideas = [];

    function activeSystem() {
      return document.querySelector("[data-system-tabs] [aria-selected='true']")?.dataset.system || "full";
    }

    function src(path) {
      if (!path) return "";
      if (/^(https?:|\/|\.\.)/i.test(path)) return path;
      return `../${path}`;
    }

    function renderIdeas() {
      if (!track) return;
      const system = activeSystem();
      const title = document.querySelector("#idea-system-title");
      if (title) title.textContent = systemNames[system] || system;
      const scroller = document.querySelector("#idea-scroll");
      const lines = ideas.filter((item) => item.system === system).map((item) => {
        const who = [item.name, item.lab].filter(Boolean).join(" · ");
        const thumbs = (item.images || []).map((path) => {
          const href = src(path);
          return `<button type="button" data-zoom="${esc(href)}"><img src="${esc(href)}" alt=""></button>`;
        }).join("");
        return `<div class="idea-line">${esc(item.description || item.title || "")}${who ? `<span>${esc(who)}</span>` : ""}${thumbs ? `<div class="idea-thumbs">${thumbs}</div>` : ""}</div>`;
      });
      const scrolling = lines.length > 1;
      scroller?.classList.toggle("is-scrolling", scrolling);
      if (!lines.length) {
        track.innerHTML = `<div class="idea-line">${esc(copy.empty)}</div>`;
        return;
      }
      if (!scrolling) {
        track.innerHTML = lines.join("");
        return;
      }
      track.innerHTML = lines.concat(lines).join("");
      scroller?.style.setProperty("--idea-duration", `${Math.max(16, lines.length * 6)}s`);
    }

    function loadIdeas() {
      return fetch(`../ideas.json?v=${Date.now()}`)
        .then((response) => (response.ok ? response.json() : { items: [] }))
        .then((data) => {
          ideas = data.items || [];
          renderIdeas();
        })
        .catch(() => renderIdeas());
    }

    fetch("data/directory-labs.json")
      .then((response) => response.json())
      .then((data) => {
        if (!labSelect) return;
        const first = labSelect.querySelector("option");
        const labs = [...(data.labs || [])].sort((a, b) => String(a.name).localeCompare(String(b.name)));
        const options = [first ? first.outerHTML : `<option value="individual">${esc(zh ? "个人贡献者" : "Individual contributor")}</option>`];
        for (const lab of labs) {
          if (!lab.name) continue;
          options.push(`<option value="${esc(lab.lab_id || lab.name)}">${esc(lab.name)}</option>`);
        }
        labSelect.innerHTML = options.join("");
      })
      .catch(() => {});

    document.querySelector("#idea-upload")?.addEventListener("click", () => {
      if (status) {
        status.textContent = "";
        delete status.dataset.state;
      }
      const field = form?.querySelector("[name=system]");
      if (field) field.value = activeSystem();
      dialog?.showModal();
    });
    document.querySelectorAll("[data-close-idea]").forEach((button) => {
      button.addEventListener("click", () => dialog?.close());
    });
    dialog?.addEventListener("click", (event) => {
      if (event.target === dialog) dialog.close();
    });
    form?.addEventListener("submit", async (event) => {
      event.preventDefault();
      const description = form.description.value.trim();
      const name = form.contributor.value.trim();
      const images = [...(document.querySelector("#idea-images")?.files || [])];
      const local = location.hostname === "127.0.0.1" || location.hostname === "localhost";
      if (description.length < 15) {
        status.textContent = copy.needText;
        status.dataset.state = "error";
        return;
      }
      if (!name) {
        status.textContent = copy.needName;
        status.dataset.state = "error";
        return;
      }
      if (images.length > 4) {
        status.textContent = copy.tooMany;
        status.dataset.state = "error";
        return;
      }
      if (!local) {
        status.textContent = copy.failed;
        status.dataset.state = "error";
        return;
      }
      const submit = document.querySelector("#idea-submit");
      if (submit) submit.disabled = true;
      status.textContent = copy.sending;
      delete status.dataset.state;
      try {
        const body = new FormData(form);
        body.set("lab_name", labSelect?.selectedOptions?.[0]?.textContent?.trim() || "");
        const response = await fetch("/api/ideas", { method: "POST", body });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload.error || copy.failed);
        form.reset();
        dialog?.close();
        await loadIdeas();
      } catch (error) {
        status.textContent = error.message || copy.failed;
        status.dataset.state = "error";
      } finally {
        if (submit) submit.disabled = false;
      }
    });

    loadIdeas();
    window.VENDING_RENDER_IDEAS = renderIdeas;
  }
})();
