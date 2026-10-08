const nav = document.querySelector(".section-nav");
if (nav) {
  const links = [...nav.querySelectorAll('a[href^="#"]')];
  const sections = links.map((link) => document.querySelector(link.getAttribute("href"))).filter(Boolean);
  const toggle = nav.querySelector(".section-nav-toggle");
  const current = nav.querySelector("[data-section-current]");
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");

  const setActive = (id) => {
    links.forEach((link) => {
      const on = link.getAttribute("href") === `#${id}`;
      link.classList.toggle("is-active", on);
      if (on) link.setAttribute("aria-current", "true");
      else link.removeAttribute("aria-current");
      if (on && current) current.textContent = link.querySelector(".section-nav-index").textContent;
    });
  };

  const update = () => {
    const line = window.innerHeight * 0.32;
    let active = sections[0];
    sections.forEach((section) => {
      if (section.getBoundingClientRect().top - 72 <= line) active = section;
    });
    if (active) setActive(active.id);
  };

  links.forEach((link) => {
    link.addEventListener("click", (event) => {
      const id = link.getAttribute("href").slice(1);
      const section = document.getElementById(id);
      if (!section) return;
      event.preventDefault();
      section.scrollIntoView({ behavior: reduced.matches ? "auto" : "smooth", block: "start" });
      history.pushState(null, "", `#${id}`);
      setActive(id);
      nav.classList.remove("is-open");
      toggle?.setAttribute("aria-expanded", "false");
    });
  });

  toggle?.addEventListener("click", () => {
    const open = nav.classList.toggle("is-open");
    toggle.setAttribute("aria-expanded", open ? "true" : "false");
  });

  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    nav.classList.remove("is-open");
    toggle?.setAttribute("aria-expanded", "false");
  });

  document.addEventListener("pointerdown", (event) => {
    if (!nav.contains(event.target)) {
      nav.classList.remove("is-open");
      toggle?.setAttribute("aria-expanded", "false");
    }
  });

  window.addEventListener("scroll", update, { passive: true });
  window.addEventListener("resize", update);
  update();
}
