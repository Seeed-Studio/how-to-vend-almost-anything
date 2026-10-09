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
})();
