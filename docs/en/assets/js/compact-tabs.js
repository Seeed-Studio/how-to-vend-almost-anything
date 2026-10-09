(() => {
  const decodeHash = (hash) => {
    try {
      return decodeURIComponent(hash.replace(/^#/, ""));
    } catch {
      return hash.replace(/^#/, "");
    }
  };

  function init() {
    const tabsets = [...document.querySelectorAll("[data-tabs]")].map((root, setIndex) => {
      const list = root.querySelector("[data-tablist]");
      const tabs = list ? [...list.querySelectorAll("a[data-tab]")] : [];
      const panels = [...root.querySelectorAll("[data-tab-panel]")];
      if (!tabs.length || tabs.length !== panels.length) return null;

      const linkedPanels = tabs.map((tab) => {
        const id = tab.getAttribute("aria-controls");
        const href = tab.getAttribute("href") || "";
        const panel = panels.find((item) => item.id === id);
        return id && href.startsWith("#") && panel && decodeHash(href) === id ? panel : null;
      });
      if (linkedPanels.some((panel) => !panel) || new Set(linkedPanels).size !== panels.length) return null;

      let selected;
      list.setAttribute("role", "tablist");
      tabs.forEach((tab, index) => {
        if (!tab.id) tab.id = `companion-tab-${setIndex + 1}-${index + 1}`;
        tab.setAttribute("role", "tab");
        linkedPanels[index].setAttribute("role", "tabpanel");
        linkedPanels[index].setAttribute("aria-labelledby", tab.id);
        linkedPanels[index].setAttribute("tabindex", "0");
      });

      const activate = (panel, focus = false) => {
        const index = linkedPanels.indexOf(panel);
        if (index < 0) return;
        tabs.forEach((tab, tabIndex) => {
          const active = tabIndex === index;
          tab.setAttribute("aria-selected", String(active));
          tab.setAttribute("tabindex", active ? "0" : "-1");
          tab.classList.toggle("is-active", active);
          linkedPanels[tabIndex].hidden = !active;
        });
        if (focus) tabs[index].focus();
        if (selected !== panel) {
          selected = panel;
          root.dispatchEvent(new CustomEvent("companion:tabchange", {
            bubbles: true,
            detail: { panelId: panel.id }
          }));
        }
      };

      root.classList.add("tabs-ready");
      activate(linkedPanels[0]);
      return { list, tabs, panels: linkedPanels, activate };
    }).filter(Boolean);
    if (!tabsets.length) return;

    let scrollRequest = 0;
    const findDestination = (hash) => {
      const id = decodeHash(hash);
      const target = id ? document.getElementById(id) : null;
      if (!target) return null;
      for (const set of tabsets) {
        const panel = set.panels.find((item) => item === target || item.contains(target));
        if (panel) return { set, panel, target };
      }
      return null;
    };

    const reveal = ({ set, panel, target }, scroll = true) => {
      for (let node = target; node; node = node.parentElement) {
        if (node.tagName === "DETAILS") node.open = true;
      }
      set.activate(panel);
      const request = ++scrollRequest;
      if (scroll) {
        requestAnimationFrame(() => {
          if (request !== scrollRequest) return;
          (target === panel ? set.list : target).scrollIntoView({
            behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
            block: "start"
          });
        });
      }
    };

    const updateHash = (hash) => {
      if (decodeHash(window.location.hash) !== decodeHash(hash)) {
        history.pushState(null, "", hash);
      }
    };

    const followHash = () => {
      const destination = findDestination(window.location.hash);
      if (destination) reveal(destination);
      else if (!window.location.hash) {
        ++scrollRequest;
        tabsets.forEach((set) => set.activate(set.panels[0]));
      }
    };

    document.addEventListener("click", (event) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const anchor = event.target.closest?.("a[href]");
      if (!anchor || anchor.hasAttribute("download") || (anchor.target && anchor.target !== "_self")) return;
      let url;
      try {
        url = new URL(anchor.href, document.baseURI);
      } catch {
        return;
      }
      if (url.origin !== location.origin || url.pathname !== location.pathname || url.search !== location.search || !url.hash) return;
      const destination = findDestination(url.hash);
      if (!destination) return;
      event.preventDefault();
      const isTab = destination.set.tabs.includes(anchor);
      reveal(destination, !isTab);
      updateHash(url.hash);
    });

    tabsets.forEach((set) => {
      set.list.addEventListener("keydown", (event) => {
        const index = set.tabs.indexOf(event.target.closest?.("[data-tab]"));
        if (index < 0 || event.altKey || event.ctrlKey || event.metaKey) return;
        let next;
        if (event.key === "ArrowRight") next = (index + 1) % set.tabs.length;
        else if (event.key === "ArrowLeft") next = (index - 1 + set.tabs.length) % set.tabs.length;
        else if (event.key === "Home") next = 0;
        else if (event.key === "End") next = set.tabs.length - 1;
        else return;
        event.preventDefault();
        ++scrollRequest;
        set.activate(set.panels[next], true);
        updateHash(`#${encodeURIComponent(set.panels[next].id)}`);
      });
    });

    window.addEventListener("hashchange", followHash);
    window.addEventListener("popstate", followHash);
    document.addEventListener("companion:ready", followHash);
    followHash();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, { once: true });
  else init();
})();
