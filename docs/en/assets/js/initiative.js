(() => {
  "use strict";

  const menuToggle = document.querySelector("[data-menu-toggle]");
  const menu = document.querySelector("[data-menu]");
  const header = menuToggle?.closest(".site-header");

  if (menuToggle && menu && header) {
    const label = menuToggle.querySelector("[data-menu-label]");
    const setMenuOpen = (open, restoreFocus = false) => {
      header.classList.toggle("menu-open", open);
      menuToggle.setAttribute("aria-expanded", String(open));
      if (label) label.textContent = (open ? label.dataset.close : label.dataset.open) || label.textContent;
      if (restoreFocus) menuToggle.focus();
    };

    menuToggle.addEventListener("click", () => {
      setMenuOpen(menuToggle.getAttribute("aria-expanded") !== "true");
    });
    menu.addEventListener("click", (event) => {
      if (event.target.closest?.("a[href]")) setMenuOpen(false);
    });
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && menuToggle.getAttribute("aria-expanded") === "true") {
        setMenuOpen(false, true);
      }
    });
    window.addEventListener("resize", () => {
      if (window.innerWidth >= 900) setMenuOpen(false);
    });
    setMenuOpen(false);
    document.documentElement.classList.add("js");
  }

  const sectionLinks = [...document.querySelectorAll("[data-section-link]")];
  const linkedSections = sectionLinks.map((link) => {
    const href = link.getAttribute("href");
    if (!href?.startsWith("#") || href.length < 2) return null;
    let id;
    try {
      id = decodeURIComponent(href.slice(1));
    } catch {
      return null;
    }
    const section = document.getElementById(id);
    return section ? { link, section } : null;
  }).filter(Boolean);

  if (linkedSections.length && "IntersectionObserver" in window) {
    const visibleSections = new Set();
    const updateCurrentSection = () => {
      const readingLine = window.innerHeight * 0.2;
      const visible = [...visibleSections].filter((section) => {
        const bounds = section.getBoundingClientRect();
        return bounds.bottom > 0 && bounds.top < window.innerHeight;
      }).sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top);
      const current = visible.filter((section) => section.getBoundingClientRect().top <= readingLine).at(-1)
        || visible[0];
      linkedSections.forEach(({ link, section }) => {
        const active = section === current;
        link.classList.toggle("is-active", active);
        if (active) link.setAttribute("aria-current", "location");
        else link.removeAttribute("aria-current");
      });
    };
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) visibleSections.add(entry.target);
        else visibleSections.delete(entry.target);
      });
      updateCurrentSection();
    }, { rootMargin: "-80px 0px 0px 0px", threshold: 0 });
    [...new Set(linkedSections.map(({ section }) => section))].forEach((section) => {
      observer.observe(section);
    });
    let framePending = false;
    window.addEventListener("scroll", () => {
      if (framePending) return;
      framePending = true;
      window.requestAnimationFrame(() => {
        updateCurrentSection();
        framePending = false;
      });
    }, { passive: true });
  }

  const video = document.querySelector("[data-demo-video]");
  const demoButtons = [...document.querySelectorAll("[data-demo-select]")];
  const caption = document.querySelector("[data-demo-caption]");

  if (video && demoButtons.length) {
    const source = video.querySelector("source");
    let currentSource = source?.getAttribute("src") || video.getAttribute("src") || "";
    demoButtons.forEach((button) => {
      button.addEventListener("click", () => {
        const nextSource = button.dataset.src;
        if (!nextSource || nextSource === currentSource) return;
        video.pause();
        if (source) source.setAttribute("src", nextSource);
        else video.setAttribute("src", nextSource);
        if (button.dataset.poster) video.setAttribute("poster", button.dataset.poster);
        else video.removeAttribute("poster");
        if (caption) caption.textContent = button.dataset.caption || "";
        demoButtons.forEach((item) => {
          const selected = item === button;
          item.setAttribute("aria-pressed", String(selected));
          item.classList.toggle("is-selected", selected);
        });
        currentSource = nextSource;
        video.load();
      });
    });
  }

  const shareButton = document.querySelector("[data-share]");
  const shareStatus = document.querySelector("[data-share-status]");
  const shareFallback = document.querySelector("[data-share-fallback]");
  const shareUrlInput = document.querySelector("[data-share-url]");

  if (shareButton) {
    const pageUrl = new URL(window.location.href);
    pageUrl.hash = "";
    const idleLabel = shareButton.dataset.idle || shareButton.textContent;
    let labelTimer;
    let sharing = false;
    const announce = (state) => {
      if (shareStatus) shareStatus.textContent = shareStatus.dataset[state] || "";
    };
    const showFallback = () => {
      if (shareFallback) shareFallback.hidden = false;
      if (shareUrlInput) {
        shareUrlInput.value = pageUrl.href;
        shareUrlInput.focus();
        shareUrlInput.select();
      }
      announce("fallback");
    };
    const share = async () => {
      if (sharing) return;
      sharing = true;
      window.clearTimeout(labelTimer);
      shareButton.textContent = idleLabel;
      if (shareFallback) shareFallback.hidden = true;
      if (shareStatus) shareStatus.textContent = "";
      try {
        if (typeof navigator.share === "function") {
          try {
            await navigator.share({ title: document.title, url: pageUrl.href });
            announce("success");
            return;
          } catch (error) {
            if (error?.name === "AbortError") {
              announce("cancelled");
              return;
            }
          }
        }
        if (typeof navigator.clipboard?.writeText === "function") {
          try {
            await navigator.clipboard.writeText(pageUrl.href);
            shareButton.textContent = shareButton.dataset.copied || idleLabel;
            announce("success");
            labelTimer = window.setTimeout(() => {
              shareButton.textContent = idleLabel;
            }, 2400);
            return;
          } catch {
            showFallback();
            return;
          }
        }
        showFallback();
      } finally {
        sharing = false;
      }
    };
    shareButton.addEventListener("click", () => {
      share().catch(() => {
        shareButton.textContent = idleLabel;
        announce("fallback");
      });
    });
  }

  if (document.body.classList.contains("initiative") && document.querySelector("#idea-form")) {
    const zh = (document.documentElement.lang || "en").toLowerCase().startsWith("zh");
    const copy = zh
      ? {
          needText: "想法至少 15 个字。",
          needName: "请填写名字。",
          tooMany: "最多 4 张图片。",
          sending: "正在写入仓库…",
          failed: "没有写入。",
          grateful: "我们非常感激。这个想法已记为我们的贡献，并出现在实验室网络里。",
          you: "你"
        }
      : {
          needText: "The idea needs at least 15 characters.",
          needName: "Add the contributor name.",
          tooMany: "Maximum four images.",
          sending: "Saving into the repository…",
          failed: "The idea was not saved.",
          grateful: "We are grateful. This idea is saved with our contributions and listed on the network.",
          you: "you"
        };
    const dialog = document.querySelector("#idea-dialog");
    const form = document.querySelector("#idea-form");
    const status = document.querySelector("#idea-status");
    const labSelect = document.querySelector("#idea-lab");
    const thanks = document.querySelector("#thanks-dialog");

    fetch("data/directory-labs.json")
      .then((response) => response.json())
      .then((data) => {
        if (!labSelect) return;
        const first = labSelect.querySelector("option");
        const labs = [...(data.labs || [])].sort((a, b) => String(a.name).localeCompare(String(b.name)));
        const options = [first ? first.outerHTML : ""];
        for (const lab of labs) {
          if (!lab.name) continue;
          const value = String(lab.lab_id || lab.name).replace(/"/g, "&quot;");
          const name = String(lab.name).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
          options.push(`<option value="${value}">${name}</option>`);
        }
        labSelect.innerHTML = options.join("");
      })
      .catch(() => {});

    const openIdea = () => {
      if (status) {
        status.textContent = "";
        delete status.dataset.state;
      }
      dialog?.showModal();
    };
    document.querySelector("#idea-upload")?.addEventListener("click", openIdea);
    document.querySelectorAll("[data-close-idea]").forEach((button) => {
      button.addEventListener("click", () => dialog?.close());
    });
    dialog?.addEventListener("click", (event) => {
      if (event.target === dialog) dialog.close();
    });
    document.querySelectorAll("[data-close-thanks]").forEach((button) => {
      button.addEventListener("click", () => thanks?.close());
    });
    thanks?.addEventListener("click", (event) => {
      if (event.target === thanks) thanks.close();
    });

    form?.addEventListener("submit", async (event) => {
      event.preventDefault();
      const description = form.description.value.trim();
      const name = form.contributor.value.trim();
      const images = [...(document.querySelector("#idea-images")?.files || [])];
      const local = location.hostname === "127.0.0.1" || location.hostname === "localhost";
      const fail = (message) => {
        status.textContent = message;
        status.dataset.state = "error";
      };
      if (description.length < 15) return fail(copy.needText);
      if (!name) return fail(copy.needName);
      if (images.length > 4) return fail(copy.tooMany);
      if (!local) return fail(copy.failed);
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
        const who = labId && labId !== "individual" ? labName : (person || copy.you);
        const title = thanks?.querySelector("#thanks-title");
        const note = thanks?.querySelector("#thanks-body");
        if (title) title.textContent = zh ? `谢谢，${who}。` : `Thank you, ${who}.`;
        if (note) note.textContent = copy.grateful;
        thanks?.showModal();
      } catch (error) {
        fail(error.message || copy.failed);
      } finally {
        if (submit) submit.disabled = false;
      }
    });
  }
})();
