(function () {
  const zh = (document.documentElement.lang || "en").toLowerCase().startsWith("zh");
  const text = zh
    ? {
        unconfigured: "投稿服务尚未配置。请先用 GitHub issue 提交提案。",
        unconfiguredButton: "投稿服务尚未配置",
        submit: "写入仓库",
        emptyFiles: "请加上示意图和实物图。",
        tooMany: "每次最多 4 个文件。",
        tooBig: "单个文件不能超过 5 MB。",
        total: "文件合计不能超过 12 MB。",
        type: "不接受这个文件类型。",
        captcha: "请先完成安全验证。",
        sending: "正在写入仓库…",
        failed: "没有写入。",
        folder: "将写入",
        openPr: "打开草稿 PR ↗",
        added: "已加上，现在显示在页面上。",
        needBoth: "请同时加上示意图和实物图。"
      }
    : {
        unconfigured: "The submission service is not configured yet. Use the GitHub issue link.",
        unconfiguredButton: "Submission service not configured",
        submit: "Add to the repository",
        emptyFiles: "Add the sketch diagram and the actual diagram.",
        tooMany: "Maximum four files per proposal.",
        tooBig: "Each file must be 5 MB or smaller.",
        total: "The combined files must be 12 MB or smaller.",
        type: "That file type is not accepted.",
        captcha: "Complete the security check before submitting.",
        sending: "Saving into the repository…",
        failed: "The upload did not finish.",
        folder: "Saved under",
        openPr: "Open the draft pull request ↗",
        added: "Added. It is on this page now.",
        needBoth: "Add both the sketch diagram and the actual diagram."
      };

  const issues = {
    full: "https://github.com/Seeed-Studio/how-to-vend-almost-anything/issues/new?template=submit-improvement.yml",
    dispensing: "https://github.com/Seeed-Studio/how-to-vend-almost-anything/issues/new?template=contribute-dispensing.yml",
    storage: "https://github.com/Seeed-Studio/how-to-vend-almost-anything/issues/new?template=contribute-product-module.yml",
    enclosure: "https://github.com/Seeed-Studio/how-to-vend-almost-anything/issues/new?template=contribute-interfaces.yml",
    control: "https://github.com/Seeed-Studio/how-to-vend-almost-anything/issues/new?template=contribute-operator-software.yml",
    vending: "https://github.com/Seeed-Studio/how-to-vend-almost-anything/issues/new?template=contribute-interfaces.yml",
    operator: "https://github.com/Seeed-Studio/how-to-vend-almost-anything/issues/new?template=contribute-operator-software.yml"
  };
  const extensions = new Set(["stl", "step", "stp", "3mf", "glb", "gltf", "dxf", "svg", "pdf", "png", "jpg", "jpeg", "md", "txt", "json", "csv", "kicad_pcb", "kicad_sch", "ino", "py", "cpp", "h", "zip"]);
  const maxFile = 5 * 1024 * 1024;
  const maxTotal = 12 * 1024 * 1024;

  const dialog = document.querySelector("#upload-dialog");
  const form = document.querySelector("#upload-form");
  const system = document.querySelector("#upload-system");
  const fileInputs = [...document.querySelectorAll("#upload-sketch, #upload-actual")];
  const fileList = document.querySelector("#upload-file-list");
  const status = document.querySelector("#upload-status");
  const target = document.querySelector("#upload-target");
  const issueLink = document.querySelector("#upload-issue-link");
  const submit = document.querySelector("#upload-submit");
  if (!dialog || !form || !system || !status) return;

  const config = window.CONTRIBUTION_CONFIG || {};
  const local = location.hostname === "127.0.0.1" || location.hostname === "localhost";
  const endpoint = local ? "/api/contributions" : (config.endpoint || "");
  const ready = Boolean(endpoint) && (local || Boolean(config.turnstileSiteKey));
  let widgetId = null;
  const issueLabel = issueLink ? issueLink.textContent : "";
  const labSelect = document.querySelector("#upload-lab");
  const version = document.querySelector("#upload-version");
  const example = document.querySelector("#upload-example");

  fetch("data/directory-labs.json")
    .then((response) => response.json())
    .then((data) => {
      const labs = [...(data.labs || [])].sort((a, b) => String(a.name).localeCompare(String(b.name)));
      if (!labSelect) return;
      const options = [`<option value="individual">${esc(zh ? "个人贡献者" : "Individual contributor")}</option>`];
      for (const lab of labs) {
        if (!lab.name) continue;
        options.push(`<option value="${esc(lab.lab_id || lab.name)}">${esc(lab.name)}</option>`);
      }
      labSelect.innerHTML = options.join("");
    })
    .catch(() => {});

  function esc(value) {
    return String(value).replace(/[&<>"']/g, (char) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    }[char]));
  }

  function setStatus(message, state) {
    status.textContent = message || "";
    if (state) status.dataset.state = state;
    else delete status.dataset.state;
  }

  function syncExample() {
    const label = document.querySelector("#upload-example-label");
    if (label) label.textContent = system.selectedOptions?.[0]?.textContent || system.value;
  }

  function syncSystem(value) {
    if (issues[value]) system.value = value;
    const current = system.value;
    if (issueLink && !issueLink.dataset.pr) issueLink.href = issues[current] || issues.dispensing;
    if (target) {
      target.textContent = ready ? `${text.folder}: docs/submissions/${current}/` : "";
    }
    syncExample();
  }

  function renderFiles() {
    const files = fileInputs.flatMap((input) => [...(input.files || [])]);
    if (!fileList) return "";
    if (!files.length) {
      fileList.innerHTML = `<li>${esc(text.emptyFiles)}</li>`;
      return "";
    }
    const problems = [];
    if (files.length > 4) problems.push(text.tooMany);
    let total = 0;
    const items = files.map((file) => {
      total += file.size;
      const ext = file.name.split(".").pop()?.toLowerCase() || "";
      let note = "";
      if (file.size > maxFile) note = text.tooBig;
      else if (!extensions.has(ext)) note = text.type;
      if (note) problems.push(note);
      return `<li>${esc(file.name)}${note ? ` — ${esc(note)}` : ""}</li>`;
    });
    if (total > maxTotal) problems.push(text.total);
    fileList.innerHTML = items.join("");
    return problems[0] || "";
  }

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      if (window.turnstile) {
        resolve();
        return;
      }
      const existing = document.querySelector(`script[src="${src}"]`);
      if (existing) {
        existing.addEventListener("load", () => resolve(), { once: true });
        existing.addEventListener("error", () => reject(new Error(text.captcha)), { once: true });
        return;
      }
      const script = document.createElement("script");
      script.src = src;
      script.async = true;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error(text.captcha));
      document.head.append(script);
    });
  }

  async function ensureCaptcha() {
    if (!ready || widgetId != null) return;
    await loadScript("https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit");
    if (widgetId != null || !window.turnstile) return;
    widgetId = window.turnstile.render(document.querySelector("#upload-captcha"), {
      sitekey: config.turnstileSiteKey
    });
  }

  document.querySelectorAll("[data-upload-system]").forEach((button) => {
    button.addEventListener("click", () => {
      if (issueLink) {
        delete issueLink.dataset.pr;
        issueLink.textContent = issueLabel;
      }
      syncSystem(button.dataset.uploadSystem || "dispensing");
      const pressed = document.querySelector("[data-machine-version][aria-pressed='true']");
      if (pressed && version) version.value = pressed.dataset.machineVersion || "V0";
      syncExample();
      renderFiles();
      setStatus(ready ? "" : text.unconfigured, "");
      if (submit) {
        submit.disabled = !ready;
        submit.textContent = ready ? text.submit : text.unconfiguredButton;
      }
      dialog.showModal();
      if (ready && !local) ensureCaptcha().catch((error) => setStatus(error.message || text.captcha, "error"));
    });
  });

  system.addEventListener("change", () => syncSystem(system.value));
  version?.addEventListener("change", syncExample);
  fileInputs.forEach((input) => input.addEventListener("change", renderFiles));
  document.querySelectorAll("[data-close-upload]").forEach((button) => {
    button.addEventListener("click", () => dialog.close());
  });
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) dialog.close();
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!ready) {
      setStatus(text.unconfigured, "error");
      return;
    }
    const problem = renderFiles();
    if (problem) {
      setStatus(problem, "error");
      return;
    }
    const sketch = document.querySelector("#upload-sketch")?.files?.[0];
    const actual = document.querySelector("#upload-actual")?.files?.[0];
    if (!sketch || !actual) {
      setStatus(text.needBoth, "error");
      return;
    }
    if (!local) {
      const token = window.turnstile?.getResponse(widgetId);
      if (!token) {
        setStatus(text.captcha, "error");
        return;
      }
    }
    if (submit) submit.disabled = true;
    setStatus(text.sending, "");
    try {
      const body = new FormData(form);
      const labName = labSelect?.selectedOptions?.[0]?.textContent?.trim() || "";
      body.set("lab_name", labName);
      if (!local) body.append("turnstile_token", window.turnstile.getResponse(widgetId));
      const response = await fetch(endpoint, { method: "POST", body });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || text.failed);
      const labId = labSelect?.value || "";
      const person = form.contributor?.value?.trim() || "";
      const thanks = {
        lab: labId && labId !== "individual" ? labName : "",
        name: person,
        pilot: Boolean(labId && labId !== "individual")
      };
      setStatus(local ? text.added : (payload.pr_url || text.submit), "ok");
      if (payload.pr_url && issueLink) {
        issueLink.href = payload.pr_url;
        issueLink.textContent = text.openPr;
        issueLink.dataset.pr = "true";
      }
      if (local) {
        document.querySelector(`[data-system="${system.value}"]`)?.click();
        document.dispatchEvent(new CustomEvent("vending:submissions"));
        dialog.close();
      }
      window.showContributionThanks?.(thanks);
    } catch (error) {
      setStatus(error.message || text.failed, "error");
      if (!local) window.turnstile?.reset(widgetId);
    } finally {
      if (submit) submit.disabled = !ready;
    }
  });

  syncSystem(system.value);
  if (submit && !ready) {
    submit.disabled = true;
    submit.textContent = text.unconfiguredButton;
  }

  window.showContributionThanks = function ({ lab, name, pilot }) {
    const thanks = document.querySelector("#thanks-dialog");
    if (!thanks) return;
    const who = lab || name || (zh ? "你" : "you");
    const title = thanks.querySelector("#thanks-title");
    const body = thanks.querySelector("#thanks-body");
    if (title) title.textContent = zh ? `谢谢，${who}。` : `Thank you, ${who}.`;
    const grateful = zh
      ? "我们非常感激。这份分享已记为我们的贡献。"
      : "We are grateful. This is labeled as one of our contributions.";
    const marked = zh
      ? `${who} 已在网络地图上标为试点。`
      : `${who} is now labeled Pilot on the network map.`;
    if (body) body.textContent = pilot && lab ? `${grateful} ${marked}` : grateful;
    thanks.showModal();
  };
  document.querySelectorAll("[data-close-thanks]").forEach((button) => {
    button.addEventListener("click", () => document.querySelector("#thanks-dialog")?.close());
  });
  const thanksDialog = document.querySelector("#thanks-dialog");
  thanksDialog?.addEventListener("click", (event) => {
    if (event.target === thanksDialog) thanksDialog.close();
  });
})();
