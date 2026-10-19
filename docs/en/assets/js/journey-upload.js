(function () {
  const zh = (document.documentElement.lang || "en").toLowerCase().startsWith("zh");
  const text = zh
    ? {
        unconfigured: "投稿服务尚未配置。请先用 GitHub issue 提交提案。",
        unconfiguredButton: "投稿服务尚未配置",
        submit: "创建 GitHub 草稿 PR ↗",
        emptyFiles: "尚未选择文件。只提交文字说明也可以。",
        tooMany: "每次最多 4 个文件。",
        tooBig: "单个文件不能超过 5 MB。",
        total: "文件合计不能超过 12 MB。",
        type: "不接受这个文件类型。",
        captcha: "请先完成安全验证。",
        sending: "正在创建草稿 PR…",
        failed: "上传没有完成。可以改用 GitHub issue。",
        folder: "草稿将写入",
        openPr: "打开草稿 PR ↗"
      }
    : {
        unconfigured: "The submission service is not configured yet. Use the GitHub issue link.",
        unconfiguredButton: "Submission service not configured",
        submit: "Create draft GitHub PR ↗",
        emptyFiles: "No files selected — a text-only proposal is also welcome.",
        tooMany: "Maximum four files per proposal.",
        tooBig: "Each file must be 5 MB or smaller.",
        total: "The combined files must be 12 MB or smaller.",
        type: "That file type is not accepted.",
        captcha: "Complete the security check before submitting.",
        sending: "Creating the draft pull request…",
        failed: "The upload did not finish. Use the GitHub issue instead.",
        folder: "Draft folder",
        openPr: "Open the draft pull request ↗"
      };

  const issues = {
    dispensing: "https://github.com/Seeed-Studio/how-to-vend-almost-anything/issues/new?template=contribute-dispensing.yml",
    storage: "https://github.com/Seeed-Studio/how-to-vend-almost-anything/issues/new?template=contribute-product-module.yml",
    enclosure: "https://github.com/Seeed-Studio/how-to-vend-almost-anything/issues/new?template=contribute-interfaces.yml",
    control: "https://github.com/Seeed-Studio/how-to-vend-almost-anything/issues/new?template=contribute-operator-software.yml"
  };
  const extensions = new Set(["stl", "step", "stp", "3mf", "glb", "gltf", "dxf", "svg", "pdf", "png", "jpg", "jpeg", "md", "txt", "json", "csv", "kicad_pcb", "kicad_sch", "ino", "py", "cpp", "h", "zip"]);
  const maxFile = 5 * 1024 * 1024;
  const maxTotal = 12 * 1024 * 1024;

  const dialog = document.querySelector("#upload-dialog");
  const form = document.querySelector("#upload-form");
  const system = document.querySelector("#upload-system");
  const fileInput = document.querySelector("#upload-files");
  const fileList = document.querySelector("#upload-file-list");
  const status = document.querySelector("#upload-status");
  const target = document.querySelector("#upload-target");
  const issueLink = document.querySelector("#upload-issue-link");
  const submit = document.querySelector("#upload-submit");
  if (!dialog || !form || !system || !status) return;

  const config = window.CONTRIBUTION_CONFIG || {};
  const ready = Boolean(config.endpoint && config.turnstileSiteKey);
  let widgetId = null;
  const issueLabel = issueLink ? issueLink.textContent : "";

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

  function syncSystem(value) {
    if (issues[value]) system.value = value;
    const current = system.value;
    if (issueLink && !issueLink.dataset.pr) issueLink.href = issues[current] || issues.dispensing;
    if (target) {
      target.textContent = ready ? `${text.folder}: contributions/proposals/${current}/` : "";
    }
  }

  function renderFiles() {
    const files = [...(fileInput?.files || [])];
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
      renderFiles();
      setStatus(ready ? "" : text.unconfigured, "");
      if (submit) {
        submit.disabled = !ready;
        submit.textContent = ready ? text.submit : text.unconfiguredButton;
      }
      dialog.showModal();
      if (ready) ensureCaptcha().catch((error) => setStatus(error.message || text.captcha, "error"));
    });
  });

  system.addEventListener("change", () => syncSystem(system.value));
  fileInput?.addEventListener("change", renderFiles);
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
    const token = window.turnstile?.getResponse(widgetId);
    if (!token) {
      setStatus(text.captcha, "error");
      return;
    }
    if (submit) submit.disabled = true;
    setStatus(text.sending, "");
    try {
      const body = new FormData(form);
      body.append("turnstile_token", token);
      const response = await fetch(config.endpoint, { method: "POST", body });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || text.failed);
      setStatus(payload.pr_url || text.submit, "ok");
      if (payload.pr_url && issueLink) {
        issueLink.href = payload.pr_url;
        issueLink.textContent = text.openPr;
        issueLink.dataset.pr = "true";
      }
    } catch (error) {
      setStatus(error.message || text.failed, "error");
      window.turnstile?.reset(widgetId);
    } finally {
      if (submit) submit.disabled = !ready;
    }
  });

  syncSystem(system.value);
  if (submit && !ready) {
    submit.disabled = true;
    submit.textContent = text.unconfiguredButton;
  }
})();
