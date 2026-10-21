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

  const tabs = [...document.querySelectorAll("[data-system-tabs] [role='tab']")];
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

  const systemNames = zh
    ? { full: "00 整机", dispensing: "01 出货", storage: "02 货道", enclosure: "03 箱体", control: "04 控制", vending: "05 售货界面", operator: "06 控制面板" }
    : { full: "00 Full design", dispensing: "01 Dispensing", storage: "02 Storage", enclosure: "03 Enclosure", control: "04 Control", vending: "05 Vending UI", operator: "06 Control Panel" };
  const sketchLabel = zh ? "示意图" : "Sketch diagram";
  const actualLabel = zh ? "实物" : "Actual looking";

  function voteStore(name) {
    try { return JSON.parse(localStorage.getItem(name) || "{}"); }
    catch { return {}; }
  }
  function voted(id) { return Boolean(voteStore("vending-votes")[id]); }
  function synced(id) { return Boolean(voteStore("vending-votes-synced")[id]); }
  function markVote(name, id) {
    const store = voteStore(name);
    store[id] = true;
    localStorage.setItem(name, JSON.stringify(store));
  }
  function score(item) {
    return (item.upvotes || 0) + (voted(item.id) && !synced(item.id) ? 1 : 0);
  }
  function thumb(kind, item) {
    const pressed = voted(item.id);
    return `<button type="button" class="wb-up" data-vote-kind="${esc(kind)}" data-vote-id="${esc(item.id)}" aria-pressed="${pressed ? "true" : "false"}" aria-label="${esc(zh ? "点赞" : "Thumbs up")}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 11v8H5v-8h3zm2.2 8.8A2 2 0 0 0 12 21h6.2a2 2 0 0 0 2-1.7l1.2-6A2 2 0 0 0 19.4 11H15V7.2A2.2 2.2 0 0 0 12.8 5h-.3L8.2 11"/></svg><span>${score(item)}</span></button>`;
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

  function renderSubmissions() {
    const system = current?.dataset.system;
    const items = submissions
      .filter((item) => item.system === system)
      .sort((a, b) => score(b) - score(a) || String(b.id).localeCompare(String(a.id)));
    panel.replaceChildren();
    if (!items.length) {
      const fab = "../assets/example-fab-showing.jpg";
      const after = "../assets/example-after-looking.jpg";
      const fabLabel = zh ? "这是示例的加工图" : "This is the example fab showing";
      const afterLabel = zh ? "这是示例的实物图" : "This is the example image after looking";
      panel.innerHTML = `
        <article class="wb-card">
          <p class="wb-card-title">${esc(zh ? "示例" : "Example")}</p>
          <div class="wb-proof-grid">
            <figure><button type="button" class="wb-zoom" data-zoom="${fab}"><img src="${fab}" alt="${esc(fabLabel)}"></button><figcaption>${esc(fabLabel)}</figcaption></figure>
            <figure><button type="button" class="wb-zoom" data-zoom="${after}"><img src="${after}" alt="${esc(afterLabel)}"></button><figcaption>${esc(afterLabel)}</figcaption></figure>
          </div>
        </article>`;
      return;
    }
    items.forEach((item) => {
      const who = [item.name, item.lab].filter(Boolean).join(" · ");
      const sketch = submissionSrc(item.sketch);
      const actual = submissionSrc(item.actual);
      const article = document.createElement("article");
      article.className = "wb-card";
      article.innerHTML = `
        <div class="wb-card-top">
          <p class="wb-card-title">${esc(item.title || who)}</p>
          ${thumb("submission", item)}
        </div>
        ${who ? `<p class="wb-card-who">${esc(who)}</p>` : ""}
        ${item.description ? `<p>${esc(item.description)}</p>` : ""}
        <div class="wb-proof-grid">
          ${sketch ? `<figure><button type="button" class="wb-zoom" data-zoom="${esc(sketch)}"><img src="${esc(sketch)}" alt="${esc(sketchLabel)}"></button><figcaption>${esc(sketchLabel)}</figcaption></figure>` : ""}
          ${actual ? `<figure><button type="button" class="wb-zoom" data-zoom="${esc(actual)}"><img src="${esc(actual)}" alt="${esc(actualLabel)}"></button><figcaption>${esc(actualLabel)}</figcaption></figure>` : ""}
        </div>`;
      panel.append(article);
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
    document.querySelector("#contribution-head")?.removeAttribute("hidden");
    const title = document.querySelector("#contribution-system-title");
    if (title) title.textContent = systemNames[tab.dataset.system] || tab.textContent.trim();
    panel.setAttribute("aria-labelledby", tab.id);
    if (upload) {
      upload.hidden = false;
      upload.dataset.uploadSystem = tab.dataset.system;
    }
    focus(tab);
    renderSubmissions();
    window.VENDING_RENDER_IDEAS?.();
  }

  function showPart(partId) {
    const manifest = window.VENDING_PARTS;
    const part = manifest?.parts?.find((item) => item.id === partId);
    if (!part) return;
    document.querySelector("#contribution-head")?.setAttribute("hidden", "");
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

  document.addEventListener("vending:submissions", () => loadSubmissions());
  showSystem(current);
  loadSubmissions();
  setupIdeas();
  document.addEventListener("click", async (event) => {
    const button = event.target.closest("[data-vote-id]");
    if (!button || voted(button.dataset.voteId)) return;
    const id = button.dataset.voteId;
    const kind = button.dataset.voteKind;
    markVote("vending-votes", id);
    try {
      const response = await fetch("/api/votes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, id })
      });
      if (response.ok) {
        markVote("vending-votes-synced", id);
        await loadSubmissions();
        document.dispatchEvent(new CustomEvent("vending:ideas"));
        return;
      }
    } catch { /* keep the local vote */ }
    renderSubmissions();
    window.VENDING_RENDER_IDEAS?.();
  });

  document.querySelectorAll("[data-close-zoom]").forEach((button) => {
    button.addEventListener("click", () => document.querySelector("#image-zoom")?.close());
  });
  document.addEventListener("click", (event) => {
    const zoom = event.target.closest("[data-zoom]");
    if (!zoom) return;
    const zoomDialog = document.querySelector("#image-zoom");
    const image = zoomDialog?.querySelector("img");
    if (!zoomDialog || !image) return;
    image.src = zoom.dataset.zoom;
    image.alt = zoom.querySelector("img")?.alt || "";
    zoomDialog.showModal();
  });
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
    const feed = document.querySelector("#idea-feed");
    const dialog = document.querySelector("#idea-dialog");
    const form = document.querySelector("#idea-form");
    const status = document.querySelector("#idea-status");
    const labSelect = document.querySelector("#idea-lab");
    const systemNames = zh
      ? { full: "00 整机", dispensing: "01 出货", storage: "02 货道", enclosure: "03 箱体", control: "04 控制", vending: "05 售货界面", operator: "06 控制面板" }
      : { full: "00 Full design", dispensing: "01 Dispensing", storage: "02 Storage", enclosure: "03 Enclosure", control: "04 Control", vending: "05 Vending UI", operator: "06 Control Panel" };
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
      if (!feed) return;
      const system = activeSystem();
      const title = document.querySelector("#idea-system-title");
      if (title) title.textContent = systemNames[system] || system;
      const items = ideas
        .filter((item) => system === "full" || item.system === system)
        .sort((a, b) => score(b) - score(a) || String(b.id).localeCompare(String(a.id)));
      feed.replaceChildren();
      if (!items.length) {
        feed.innerHTML = `<p class="wb-card-who">${esc(copy.empty)}</p>`;
        return;
      }
      items.forEach((item) => {
        const who = [system === "full" ? systemNames[item.system] : "", item.name, item.lab].filter(Boolean).join(" · ");
        const images = (item.images || []).map((path) => {
          const href = src(path);
          return `<figure><button type="button" class="wb-zoom" data-zoom="${esc(href)}"><img src="${esc(href)}" alt=""></button></figure>`;
        }).join("");
        const article = document.createElement("article");
        article.className = "wb-card";
        article.innerHTML = `
          <div class="wb-card-top">
            <p class="wb-card-title">${esc(item.description || item.title || "")}</p>
            ${thumb("idea", item)}
          </div>
          ${who ? `<p class="wb-card-who">${esc(who)}</p>` : ""}
          ${images ? `<div class="wb-proof-grid">${images}</div>` : ""}`;
        feed.append(article);
      });
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

    document.addEventListener("click", (event) => {
      if (!event.target.closest("[data-open-idea]")) return;
      document.querySelector("#idea-upload")?.click();
    });
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
        const labId = labSelect?.value || "";
        const labName = labSelect?.selectedOptions?.[0]?.textContent?.trim() || "";
        const person = form.contributor.value.trim();
        form.reset();
        dialog?.close();
        await loadIdeas();
        window.showContributionThanks?.({
          lab: labId && labId !== "individual" ? labName : "",
          name: person,
          pilot: false
        });
      } catch (error) {
        status.textContent = error.message || copy.failed;
        status.dataset.state = "error";
      } finally {
        if (submit) submit.disabled = false;
      }
    });

    loadIdeas();
    document.addEventListener("vending:ideas", () => loadIdeas());
    window.VENDING_RENDER_IDEAS = renderIdeas;
  }
})();
