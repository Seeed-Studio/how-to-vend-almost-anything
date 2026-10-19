const STATUS_LABEL = {
  directory: "Directory listing",
  interested: "Interested in the program",
  pilot: "Confirmed pilot",
  verified: "Verified vending machine",
  recent_update: "Newly published update"
};

const MARKER_KIND = {
  directory: "dot",
  interested: "ring",
  pilot: "square",
  verified: "check",
  recent_update: "star"
};

function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, (ch) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#39;"
  }[ch]));
}

function safeHref(url) {
  if (typeof url !== "string") return "";
  try {
    const parsed = new URL(url);
    return ["https:", "http:"].includes(parsed.protocol) && !parsed.username && !parsed.password ? parsed.href : "";
  } catch { return ""; }
}

async function load(path) {
  const response = await fetch(path, { cache: "no-cache" });
  if (!response.ok) throw new Error(`${path} returned ${response.status}`);
  return response.json();
}

function hasCoords(lab) {
  return Number.isFinite(lab.latitude) && Math.abs(lab.latitude) <= 90 && Number.isFinite(lab.longitude) && Math.abs(lab.longitude) <= 180;
}

function buildLabs(directory, program, machines, updates) {
  const byId = new Map();
  (directory.labs || []).forEach((lab) => {
    byId.set(lab.lab_id, { ...lab, participation_status: "directory" });
  });
  (program.labs || []).forEach((lab) => {
    const previous = byId.get(lab.lab_id) || {};
    byId.set(lab.lab_id, { ...previous, ...lab });
  });
  const recentLabs = new Set(
    (updates.updates || [])
      .filter((item) => item.review_status === "approved")
      .map((item) => item.lab_id)
  );
  return [...byId.values()].map((lab) => {
    const ownMachines = (machines.machines || []).filter((item) => item.lab_id === lab.lab_id && item.installation_status !== "proposed");
    let status = lab.participation_status;
    if (status === "verified" && recentLabs.has(lab.lab_id)) status = "recent_update";
    return { ...lab, marker_status: status, machines: ownMachines };
  });
}

function matches(lab, query, state) {
  const haystack = `${lab.name} ${lab.city} ${lab.country}`.toLowerCase();
  if (query && !haystack.includes(query)) return false;
  if (state.country && state.country !== "all" && lab.country !== state.country) return false;
  if (state.activity && state.activity !== "all" && (lab.activity_status || "unknown") !== state.activity) return false;
  if (state.capability && state.capability !== "all" && !(lab.capabilities || []).includes(state.capability)) return false;
  if (state.status !== "all" && lab.marker_status !== state.status && lab.participation_status !== state.status) return false;
  if (state.machine === "with" && !lab.machines.length) return false;
  if (state.machine === "without" && lab.machines.length) return false;
  if (state.category !== "all") {
    const categories = lab.machines.flatMap((machine) => machine.product_categories || []);
    if (!categories.includes(state.category)) return false;
  }
  if (state.recent && lab.marker_status !== "recent_update") return false;
  return true;
}

function productCategories(lab, products) {
  const machineIds = new Set(lab.machines.map((machine) => machine.machine_id));
  return (products.products || []).filter((product) => machineIds.has(product.machine_id));
}

const CAPABILITY_LABEL = {
  three_d_printing: "3D printing",
  laser: "Laser cutting",
  cnc_milling: "CNC milling",
  vinyl_cutting: "Vinyl cutting",
  circuit_production: "Circuit production",
  precision_milling: "Precision milling"
};
const ACTIVITY_LABEL = { active: "Listed as active", planned: "Listed as planned", closed: "Listed as closed", corona: "Legacy COVID status", unknown: "Activity not supplied" };
const PLAN_KEY = "fab-vending-lab-shortlist-v1";
let shortlisted = new Set();
let plannerPersistent = true;

function issueHref(lab, action) {
  const url = new URL("https://github.com/Seeed-Studio/how-to-vend-almost-anything/issues/new");
  const templates = { interest: ["register-interest.yml", "Lab interest"], installation: ["submit-installation.yml", "Installation"], improvement: ["submit-improvement.yml", "Improvement"], correction: ["correct-listing.yml", "Correction"] };
  const [template, title] = templates[action];
  url.searchParams.set("template", template);
  url.searchParams.set("title", `[${title}]: ${lab.name}`);
  if (action === "interest" || action === "installation") {
    url.searchParams.set("lab-name", lab.name);
    url.searchParams.set("city", lab.city || "");
    url.searchParams.set("country", lab.country || "");
  }
  if (action === "interest") {
    url.searchParams.set("fablabs-url", safeHref(lab.official_fablabs_url));
    url.searchParams.set("website", safeHref(lab.lab_website));
  }
  if (action === "improvement") url.searchParams.set("attribution", `${lab.name} · ${safeHref(lab.official_fablabs_url)}`);
  if (action === "correction") {
    url.searchParams.set("record", `${lab.lab_id} · ${lab.name}`);
    url.searchParams.set("source", safeHref(lab.official_fablabs_url));
  }
  return url.href;
}

function csvCell(value) {
  let text = String(value ?? "");
  // Spreadsheet formula prefixes are not executable content in a shortlist.
  if (/^[\s]*[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

function shortlistCsv(labs) {
  const fields = ["lab_id", "name", "city", "country", "activity_status", "capabilities", "official_fablabs_url", "lab_website", "participation_status"];
  return [fields.join(","), ...labs.map((lab) => fields.map((field) => csvCell(Array.isArray(lab[field]) ? lab[field].join("; ") : lab[field])).join(","))].join("\r\n");
}

function savePlanner() {
  try { window.localStorage.setItem(PLAN_KEY, JSON.stringify([...shortlisted])); }
  catch { plannerPersistent = false; }
}

function renderPlanner(labs) {
  const saved = labs.filter((lab) => shortlisted.has(lab.lab_id));
  document.querySelector("#shortlist-note").textContent = saved.length
    ? `${saved.length} lab${saved.length === 1 ? "" : "s"} saved. ${plannerPersistent ? "Saved on this browser only." : "Browser storage is unavailable; this plan lasts for this page session."}`
    : `Select a lab in Explore labs, then choose Save for planning. ${plannerPersistent ? "" : "Browser storage is unavailable; this plan lasts for this page session."}`;
  document.querySelector("#export-shortlist").disabled = !saved.length;
  document.querySelector("#shortlist").innerHTML = saved.map((lab) => `<li>
    <h4>${esc(lab.name)}</h4><p>${esc([lab.city, lab.country].filter(Boolean).join(", "))} · ${esc(ACTIVITY_LABEL[lab.activity_status] || ACTIVITY_LABEL.unknown)}</p>
    <p>${esc(STATUS_LABEL[lab.participation_status] || lab.participation_status)}${lab.capabilities?.length ? ` · ${esc(lab.capabilities.map((key) => CAPABILITY_LABEL[key] || key).join(", "))}` : ""}</p>
    <div class="inline-links">${safeHref(lab.lab_website) ? `<a href="${esc(lab.lab_website)}" target="_blank" rel="noreferrer">Website link ↗</a>` : ""}<a href="${esc(safeHref(lab.official_fablabs_url))}" target="_blank" rel="noreferrer">Directory profile ↗</a></div>
    <div class="inline-links"><a href="${esc(issueHref(lab, "interest"))}" target="_blank" rel="noreferrer">Draft early interest ↗</a><a href="${esc(issueHref(lab, "installation"))}" target="_blank" rel="noreferrer">Report an installation ↗</a><a href="${esc(issueHref(lab, "improvement"))}" target="_blank" rel="noreferrer">Share an improvement ↗</a></div>
    <button type="button" data-shortlist="${esc(lab.lab_id)}" aria-label="Remove ${esc(lab.name)} from your plan">Remove from plan</button>
  </li>`).join("");
}

function initPlanner(labs) {
  try {
    const saved = JSON.parse(window.localStorage.getItem(PLAN_KEY) || "[]");
    if (Array.isArray(saved)) shortlisted = new Set(saved.filter((id) => typeof id === "string" && labs.some((lab) => lab.lab_id === id)));
  } catch { plannerPersistent = false; }
  renderPlanner(labs);
  document.querySelector("#export-shortlist").addEventListener("click", () => {
    const saved = labs.filter((lab) => shortlisted.has(lab.lab_id));
    if (!saved.length) return;
    const url = URL.createObjectURL(new Blob(["\uFEFF", shortlistCsv(saved)], { type: "text/csv;charset=utf-8" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "fab-lab-shortlist.csv";
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
}

function renderDirectoryStats(directory, labs) {
  const records = directory.labs || [];
  const entries = [
    [records.length, "Directory listings"],
    [new Set(records.map((lab) => lab.country).filter(Boolean)).size, "Countries & territories"],
    [records.filter((lab) => safeHref(lab.lab_website)).length, "With website links"],
    [labs.filter((lab) => lab.machines.length).length, "Labs with reviewed machines"]
  ];
  document.querySelector("#directory-stats").innerHTML = entries.map(([value, label]) => `<div><strong>${value.toLocaleString()}</strong><span>${esc(label)}</span></div>`).join("") + `<p class="snapshot-note">${directory.status === "ok" ? `Directory fetched ${esc(directory.fetched_at?.slice(0, 10) || "on an unrecorded date")}. ${records.filter((lab) => lab.activity_status === "active").length.toLocaleString()} listed as active; check current access with the lab.` : "The directory snapshot is not ready. Reviewed program records remain separate."}</p>`;
}

function renderList(labs, total) {
  const list = document.querySelector("#lab-list");
  const shown = labs.slice(0, 80);
  if (!shown.length) {
    list.innerHTML = total
      ? `<li><p>No labs match these filters.</p></li>`
      : "";
    return;
  }
  list.innerHTML = shown.map((lab) => `
    <li>
      <button type="button" data-lab="${esc(lab.lab_id)}">
        <strong>${esc(lab.name)}</strong>
        <span>${esc(lab.city)}, ${esc(lab.country)} · ${esc(STATUS_LABEL[lab.marker_status] || lab.marker_status)}</span>
      </button>
      <div class="lab-links">${safeHref(lab.lab_website) ? `<a href="${esc(lab.lab_website)}" target="_blank" rel="noreferrer">Lab website ↗</a>` : ""}<a href="${esc(safeHref(lab.official_fablabs_url))}" target="_blank" rel="noreferrer">Directory profile ↗</a></div>
    </li>
  `).join("");
  if (labs.length > shown.length) {
    list.insertAdjacentHTML("beforeend", `<li><p>Showing ${shown.length} of ${labs.length}. Narrow the search to see more.</p></li>`);
  }
}

function renderPanel(lab, products) {
  const panel = document.querySelector("#lab-panel");
  if (!lab) {
    panel.hidden = true;
    panel.innerHTML = "";
    return;
  }
  const profile = safeHref(lab.official_fablabs_url);
  const website = safeHref(lab.lab_website);
  const ownProducts = productCategories(lab, products);
  const machineText = lab.machines.length
    ? lab.machines.map((machine) => `${esc(machine.version)} · ${esc(machine.installation_status)} · checked ${esc(machine.updated_at)}`).join("<br>")
    : "No verified vending machine is published for this lab.";
  const productText = ownProducts.length
    ? `<ul>${ownProducts.map((product) => {
        const confirmed = product.availability_status === "confirmed";
        const state = confirmed
          ? `Availability recently confirmed ${esc(product.availability_updated_at)}`
          : "Listed product. Availability has not been recently confirmed.";
        return `<li>${esc(product.name)} · ${esc(product.category)} · ${state}</li>`;
      }).join("")}</ul>`
    : "<p>No reviewed products.</p>";
  panel.hidden = false;
  panel.innerHTML = `
    <p class="status status-${lab.marker_status === "directory" ? "planned" : "done"}">${esc(STATUS_LABEL[lab.marker_status] || lab.marker_status)}</p>
    <h2>${esc(lab.name)}</h2>
    <p>${esc([lab.city, lab.country].filter(Boolean).join(", "))}</p>
    <p>${esc(ACTIVITY_LABEL[lab.activity_status] || ACTIVITY_LABEL.unknown)}</p>
    <p>Listed capabilities: ${esc((lab.capabilities || []).map((key) => CAPABILITY_LABEL[key] || key).join(", ") || "Not supplied")}. Confirm equipment access with the lab.</p>
    <p>${profile ? `<a href="${esc(profile)}" target="_blank" rel="noreferrer">Official FabLabs.io profile</a>` : ""}</p>
    <p>${website ? `<a href="${esc(website)}" target="_blank" rel="noreferrer">Lab website</a>` : "No lab website is recorded."}</p>
    <div class="lab-actions"><button type="button" data-shortlist="${esc(lab.lab_id)}">${shortlisted.has(lab.lab_id) ? "Remove from plan" : "Save for planning"}</button><a href="#fab-actions">Open your plan →</a></div>
    <p><a href="${esc(issueHref(lab, "correction"))}" target="_blank" rel="noreferrer">Suggest a listing correction ↗</a></p>
    ${lab.directory_links?.length ? `<details><summary>All supplied links</summary><ul>${lab.directory_links.map((url) => safeHref(url) ? `<li><a href="${esc(url)}" target="_blank" rel="noreferrer">${esc(new URL(url).hostname)}</a></li>` : "").join("")}</ul></details>` : ""}
    <p><strong>Installed machines.</strong><br>${machineText}</p>
    <div><strong>Products.</strong>${productText}</div>
    <p>Last verified update: ${esc(lab.verification_date || "Not verified for this program")}</p>
  `;
}

function renderFeeds(machines, products, updates, labs) {
  const labName = (id) => labs.find((lab) => lab.lab_id === id)?.name || id;
  const publicMachines = (machines.machines || [])
    .filter((machine) => machine.installation_status === "verified" || machine.installation_status === "pilot")
    .sort((a, b) => String(b.published_at).localeCompare(String(a.published_at)));
  const machineRoot = document.querySelector("#machine-feed");
  if (!publicMachines.length) {
    machineRoot.innerHTML = `
      <article class="invite">
        <h3>Your lab could help shape the first edition.</h3>
        <p>We are designing Version One together. Applications follow the launch; confirmed installations will appear here as labs join.</p>
        <p><a href="https://github.com/Seeed-Studio/how-to-vend-almost-anything/issues/new?template=register-interest.yml&title=%5BLab+interest%5D%3A+&body=A+maintainer+reviews+this+issue+before+any+lab+is+added+to+%60docs%2Fen%2Fdata%2Flabs.json%60+and+%60docs%2Fch%2Fdata%2Flabs.json%60.+Registering+interest+does+not+create+a+map+pin+for+a+vending+machine.%0A%0A%23%23%23+Fab+Lab+name%0A%0A%23%23%23+City%0A%0A%23%23%23+Country%0A%0A%23%23%23+Official+FabLabs.io+profile%0A%0A%23%23%23+Lab+website%0A%0A%23%23%23+What+the+lab+wants+to+know+or+try%0A" target="_blank" rel="noreferrer">Register your lab’s early interest ↗</a></p>
      </article>
    `;
  } else {
    machineRoot.innerHTML = publicMachines.map((machine) => {
      const categories = (products.products || []).filter((product) => product.machine_id === machine.machine_id).map((product) => product.category);
      const photo = (machine.photo_urls || []).find((url) => safeHref(url));
      return `
        <article>
          ${photo ? `<img src="${esc(photo)}" alt="Installed machine at ${esc(labName(machine.lab_id))}" />` : ""}
          <h3>${esc(labName(machine.lab_id))}</h3>
          <p>${esc(machine.version)} · ${esc(machine.installation_status)} · ${esc(machine.published_at)}</p>
          <p>${esc(categories.join(", ") || "No product categories reviewed")}</p>
          <p><a href="${esc(safeHref(machine.verification_source))}">Verification source</a></p>
        </article>
      `;
    }).join("");
  }

  const approved = (updates.updates || [])
    .filter((item) => item.review_status === "approved")
    .sort((a, b) => String(b.verified_at).localeCompare(String(a.verified_at)));
  const updateRoot = document.querySelector("#update-feed");
  if (!approved.length) {
    updateRoot.innerHTML = `<article class="invite"><h3>The next chapter is being designed.</h3><p>Published lab updates will appear here. For now, bring your ideas to the <a href="index.html#contribute">open design call</a>.</p></article>`;
    return;
  }
  updateRoot.innerHTML = approved.map((item) => `
    <article>
      <h3>${esc(item.type)}</h3>
      <p>${esc(labName(item.lab_id))}</p>
      <p>${esc(item.description)}</p>
      <p>Submitted ${esc(item.submitted_at)} · Verified ${esc(item.verified_at)} · ${esc(item.review_status)}</p>
      <p><a href="${esc(safeHref(item.source_url))}">Source</a></p>
    </article>
  `).join("");
}

function markerIcon(status) {
  const kind = MARKER_KIND[status] || "dot";
  return window.L.divIcon({
    className: "marker",
    html: `<span class="marker-shape marker-${kind}"></span>`,
    iconSize: [16, 16],
    iconAnchor: [8, 8]
  });
}

function initMap(onSelect) {
  const canvas = document.querySelector("#map");
  const note = document.querySelector("#map-fallback");
  if (!window.L) {
    note.hidden = false;
    note.textContent = "The map library did not load. The lab list is still available.";
    return null;
  }
  const map = window.L.map(canvas, { scrollWheelZoom: true, minZoom: 2 }).setView([20, 0], 2);
  const tiles = window.L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 18,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
  });
  tiles.on("tileerror", () => {
    note.hidden = false;
    note.textContent = "Map tiles did not load. Search and the lab list still work.";
  });
  tiles.addTo(map);
  const layer = window.L.layerGroup().addTo(map);
  return {
    map,
    layer,
    draw(labs) {
      layer.clearLayers();
      const points = [];
      labs.filter(hasCoords).forEach((lab) => {
        const marker = window.L.marker([lab.latitude, lab.longitude], { icon: markerIcon(lab.marker_status), title: lab.name });
        marker.on("click", () => onSelect(lab.lab_id));
        marker.addTo(layer);
        points.push([lab.latitude, lab.longitude]);
      });
      if (points.length) map.fitBounds(points, { padding: [40, 40], maxZoom: 4 });
      else map.setView([20, 0], 2);
    }
  };
}

async function init() {
  const error = document.querySelector("#data-error");
  try {
    const [directory, program, machines, products, updates] = await Promise.all([
      load("data/directory-labs.json"),
      load("data/labs.json"),
      load("data/machines.json"),
      load("data/products.json"),
      load("data/updates.json")
    ]);
    const labs = buildLabs(directory, program, machines, updates);
    initPlanner(labs);
    renderDirectoryStats(directory, labs);
    const countrySelect = document.querySelector("#filter-country");
    [...new Set(labs.map((lab) => lab.country).filter(Boolean))].sort().forEach((country) => {
      const option = document.createElement("option");
      option.value = country;
      option.textContent = country;
      countrySelect.append(option);
    });
    labs.forEach((lab) => {
      lab.machines.forEach((machine) => {
        machine.product_categories = (products.products || [])
          .filter((product) => product.machine_id === machine.machine_id)
          .map((product) => product.category);
      });
    });
    const capabilitySelect = document.querySelector("#filter-capability");
    [...new Set(labs.flatMap((lab) => lab.capabilities || []))].sort().forEach((key) => {
      const option = document.createElement("option");
      option.value = key;
      option.textContent = CAPABILITY_LABEL[key] || key;
      capabilitySelect.append(option);
    });
    const categorySelect = document.querySelector("#filter-category");
    const categories = [...new Set((products.products || []).map((product) => product.category))].sort();
    categories.forEach((category) => {
      const option = document.createElement("option");
      option.value = category;
      option.textContent = category;
      categorySelect.append(option);
    });
    if (!categories.length) {
      const option = categorySelect.querySelector("option");
      option.textContent = "No reviewed product categories";
    }

    let selected = null;
    const mapApi = initMap((id) => {
      selected = id;
      renderPanel(labs.find((lab) => lab.lab_id === id), products);
    });
    document.addEventListener("companion:tabchange", (event) => {
      if (event.detail?.panelId === "explore") {
        window.requestAnimationFrame(() => mapApi?.map.invalidateSize({ pan: false }));
      }
    });

    const apply = () => {
      const state = {
        country: countrySelect.value,
        activity: document.querySelector("#filter-activity").value,
        capability: document.querySelector("#filter-capability").value,
        status: document.querySelector("#filter-status").value,
        machine: document.querySelector("#filter-machine").value,
        category: document.querySelector("#filter-category").value,
        recent: document.querySelector("#filter-recent").checked
      };
      const query = document.querySelector("#filter-search").value.trim().toLowerCase();
      const visible = labs.filter((lab) => matches(lab, query, state));
      const empty = document.querySelector("#map-empty");
      if (!labs.length) {
        empty.hidden = false;
        empty.textContent = "The lab network is taking shape. Directory listings and confirmed machines will appear here as they are published.";
      } else if (!visible.length) {
        empty.hidden = false;
        empty.textContent = "Nothing matches these filters.";
      } else {
        empty.hidden = true;
      }
      renderList(visible, labs.length);
      document.querySelector("#results-note").textContent = `${visible.length.toLocaleString()} of ${labs.length.toLocaleString()} labs match · ${visible.filter((lab) => safeHref(lab.lab_website)).length.toLocaleString()} with website links · ${visible.filter(hasCoords).length.toLocaleString()} with map locations`;
      mapApi?.draw(visible);
      if (selected && !visible.some((lab) => lab.lab_id === selected)) {
        selected = null;
        renderPanel(null, products);
      }
    };

    document.querySelector("#map-filters").addEventListener("submit", (event) => event.preventDefault());
    document.querySelector("#map-filters").addEventListener("input", apply);
    document.querySelector("#map-filters").addEventListener("change", apply);
    document.querySelector("#lab-list").addEventListener("click", (event) => {
      const button = event.target.closest("button[data-lab]");
      if (!button) return;
      selected = button.dataset.lab;
      renderPanel(labs.find((lab) => lab.lab_id === selected), products);
    });
    document.addEventListener("click", (event) => {
      const button = event.target.closest("button[data-shortlist]");
      if (!button) return;
      const id = button.dataset.shortlist;
      if (shortlisted.has(id)) shortlisted.delete(id);
      else if (labs.some((lab) => lab.lab_id === id)) shortlisted.add(id);
      savePlanner();
      renderPlanner(labs);
      if (selected) renderPanel(labs.find((lab) => lab.lab_id === selected), products);
    });
    document.querySelector("#directory-note").textContent = directory.status === "ok"
      ? `Directory listings come from the public FabLabs.io API, fetched ${directory.fetched_at?.slice(0, 10) || "on an unrecorded date"}. Program participation and installed machines are reviewed separately.`
      : "The directory is not available yet. Lab interest and design contributions are open while we prepare the first edition.";
    renderFeeds(machines, products, updates, labs);
    apply();
    document.dispatchEvent(new CustomEvent("companion:ready"));
  } catch (cause) {
    error.hidden = false;
    error.textContent = `Map data could not be loaded. ${cause.message}`;
  }
}

init();
