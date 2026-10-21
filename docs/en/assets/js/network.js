const STATUS_LABEL = {
  directory: "Directory listing",
  interested: "Interested in the program",
  pilot: "Pilot",
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

function renderList(labs) {
  const list = document.querySelector("#lab-list");
  if (!list) return;
  if (!labs.length) {
    list.innerHTML = "";
    return;
  }
  list.innerHTML = labs.map((lab) => `
    <li>
      <button type="button" data-lab="${esc(lab.lab_id)}">
        <strong>${esc(lab.name)}</strong>
        <span>${esc([lab.city, lab.country].filter(Boolean).join(", "))} · ${esc(STATUS_LABEL[lab.marker_status] || lab.marker_status)}</span>
      </button>
    </li>
  `).join("");
}

function pilotLabIds(submissions, labs) {
  const ids = new Set();
  const byName = new Map();
  labs.forEach((lab) => {
    if (lab.name) byName.set(String(lab.name).trim().toLowerCase(), lab.lab_id);
  });
  (submissions.items || []).forEach((item) => {
    if (item.lab_id && item.lab_id !== "individual") ids.add(item.lab_id);
    const named = byName.get(String(item.lab || "").trim().toLowerCase());
    if (named) ids.add(named);
  });
  return ids;
}

function activitySeconds(item) {
  const explicit = Number(item.created_at);
  if (Number.isFinite(explicit) && explicit >= 1e9) return explicit;
  const match = String(item.id || "").match(/(\d{10})$/);
  return match ? Number(match[1]) : 0;
}

function activityStamp(item) {
  const seconds = activitySeconds(item);
  if (!seconds) return "";
  const date = new Date(seconds * 1000);
  const pad = (value) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function activityCard(item) {
  const skip = new Set(["Individual contributor", "个人贡献者", "individual"]);
  const lab = item.lab && !skip.has(item.lab) ? item.lab : "";
  const person = item.name && !skip.has(item.name) ? item.name : "";
  const who = lab || person;
  const thanks = who ? `Thank you, ${who}.` : "Thank you.";
  const stamp = activityStamp(item);
  const title = String(item.title || "").trim();
  const description = String(item.description || "").trim();
  const message = [title, description].filter((part, index, list) => part && list.indexOf(part) === index).map((part) => `<p class="activity-message">${esc(part)}</p>`).join("");
  return `<article><h3>${esc(thanks)}</h3>${stamp ? `<p class="activity-time">${esc(stamp)}</p>` : ""}${message}</article>`;
}

function renderActivity(submissions, ideas) {
  const board = document.querySelector("#community-activity");
  if (!board) return;
  const items = [...(submissions.items || []), ...(ideas.items || [])]
    .sort((a, b) => activitySeconds(b) - activitySeconds(a));
  board.innerHTML = items.length
    ? items.map(activityCard).join("")
    : `<article class="invite"><h3>Thank you.</h3><p class="activity-time">Uploads and ideas from the workbench will appear here.</p></article>`;
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
    if (note) {
      note.hidden = false;
      note.textContent = "The map library did not load. The lab list is still available.";
    }
    return null;
  }
  const map = window.L.map(canvas, { scrollWheelZoom: true, minZoom: 2 }).setView([20, 0], 2);
  const tiles = window.L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 18,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
  });
  tiles.on("tileerror", () => {
    if (!note) return;
    note.hidden = false;
    note.textContent = "Map tiles did not load. The lab list is still available.";
  });
  tiles.addTo(map);
  const layer = window.L.layerGroup().addTo(map);
  let fitted = false;
  return {
    map,
    draw(labs) {
      layer.clearLayers();
      const points = [];
      labs.filter(hasCoords).forEach((lab) => {
        const marker = window.L.marker([lab.latitude, lab.longitude], { icon: markerIcon(lab.marker_status), title: lab.marker_status === "pilot" ? `${lab.name} · ${STATUS_LABEL.pilot}` : lab.name });
        marker.on("click", () => onSelect(lab.lab_id));
        marker.addTo(layer);
        points.push([lab.latitude, lab.longitude]);
      });
      if (!fitted) {
        if (points.length) map.fitBounds(points, { padding: [40, 40], maxZoom: 4 });
        else map.setView([20, 0], 2);
        fitted = true;
      }
    },
    focus(lab) {
      if (!lab || !hasCoords(lab)) return;
      map.flyTo([lab.latitude, lab.longitude], 6, { duration: 0.6 });
    }
  };
}

async function loadOptional(path) {
  try { return await load(path); }
  catch { return { items: [] }; }
}

async function init() {
  const error = document.querySelector("#data-error");
  try {
    const [directory, program, machines, updates, submissions, ideas] = await Promise.all([
      load("data/directory-labs.json"),
      load("data/labs.json"),
      load("data/machines.json"),
      load("data/updates.json"),
      loadOptional("../submissions.json"),
      loadOptional("../ideas.json")
    ]);
    const labs = buildLabs(directory, program, machines, updates);
    const pilots = pilotLabIds(submissions, labs);
    labs.forEach((lab) => {
      if (pilots.has(lab.lab_id)) lab.marker_status = "pilot";
    });
    renderDirectoryStats(directory, labs);
    const empty = document.querySelector("#map-empty");
    if (empty && !labs.length) {
      empty.hidden = false;
      empty.textContent = "The lab network is taking shape. Directory listings and confirmed machines will appear here as they are published.";
    }
    function selectLab(id) {
      const lab = labs.find((item) => item.lab_id === id);
      document.querySelectorAll("#lab-list button[data-lab]").forEach((button) => {
        const on = button.dataset.lab === id;
        button.classList.toggle("is-selected", on);
        if (on) button.scrollIntoView({ block: "nearest", inline: "nearest" });
      });
      mapApi?.focus(lab);
    }
    const mapApi = initMap(selectLab);
    document.addEventListener("companion:tabchange", (event) => {
      if (event.detail?.panelId === "explore") {
        window.requestAnimationFrame(() => mapApi?.map.invalidateSize({ pan: false }));
      }
    });
    let statusFilter = "";
    const applyFilter = () => {
      const visible = statusFilter ? labs.filter((lab) => lab.marker_status === statusFilter) : labs;
      renderList(visible);
      mapApi?.draw(visible);
      if (empty) {
        const onMap = visible.filter(hasCoords).length;
        if (!visible.length) {
          empty.hidden = false;
          empty.textContent = "No labs match this status.";
        } else if (!onMap) {
          empty.hidden = false;
          empty.textContent = "These labs have no map location.";
        } else {
          empty.hidden = true;
          empty.textContent = "";
        }
      }
      document.querySelectorAll("#status-filters button").forEach((button) => {
        const on = button.dataset.status === statusFilter;
        button.setAttribute("aria-pressed", String(on));
        button.classList.toggle("is-selected", on);
      });
    };
    applyFilter();
    document.querySelector("#status-filters")?.addEventListener("click", (event) => {
      const button = event.target.closest("button[data-status]");
      if (!button) return;
      statusFilter = statusFilter === button.dataset.status ? "" : button.dataset.status;
      applyFilter();
    });
    document.querySelector("#lab-list").addEventListener("click", (event) => {
      const button = event.target.closest("button[data-lab]");
      if (!button) return;
      selectLab(button.dataset.lab);
    });
    const note = document.querySelector("#directory-note");
    if (note) {
      note.textContent = directory.status === "ok"
        ? `Directory listings come from the public FabLabs.io API, fetched ${directory.fetched_at?.slice(0, 10) || "on an unrecorded date"}. Program participation and installed machines are reviewed separately.`
        : "The directory is not available yet. Lab interest and design contributions are open while we prepare the first edition.";
    }
    renderActivity(submissions, ideas);
    document.dispatchEvent(new CustomEvent("companion:ready"));
  } catch (cause) {
    if (error) {
      error.hidden = false;
      error.textContent = `Map data could not be loaded. ${cause.message}`;
    }
  }
}

init();
