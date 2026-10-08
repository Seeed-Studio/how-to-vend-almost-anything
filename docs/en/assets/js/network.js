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
  if (!url) return "";
  if (url.startsWith("https://") || url.startsWith("http://")) return url;
  return "";
}

async function load(path) {
  const response = await fetch(path);
  if (!response.ok) throw new Error(`${path} returned ${response.status}`);
  return response.json();
}

function hasCoords(lab) {
  return typeof lab.latitude === "number" && typeof lab.longitude === "number";
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

function renderList(labs, total) {
  const list = document.querySelector("#lab-list");
  const shown = labs.slice(0, 80);
  if (!shown.length) {
    list.innerHTML = total
      ? `<li><p>No labs match these filters.</p></li>`
      : `<li><p>No directory snapshot is loaded, and no vending installation has been reviewed.</p></li>`;
    return;
  }
  list.innerHTML = shown.map((lab) => `
    <li>
      <button type="button" data-lab="${esc(lab.lab_id)}">
        <strong>${esc(lab.name)}</strong>
        <span>${esc(lab.city)}, ${esc(lab.country)} · ${esc(STATUS_LABEL[lab.marker_status] || lab.marker_status)}</span>
      </button>
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
    <p>${esc(lab.city)}, ${esc(lab.country)}</p>
    <p>${profile ? `<a href="${esc(profile)}" target="_blank" rel="noreferrer">Official FabLabs.io profile</a>` : ""}</p>
    <p>${website ? `<a href="${esc(website)}" target="_blank" rel="noreferrer">Lab website</a>` : "No lab website is recorded."}</p>
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
        <h3>The first participating lab has not been published.</h3>
        <p>This space stays empty until a lab submits an installation and a person approves it. A FabLabs.io pin, when the directory snapshot exists, only means the lab is in that directory.</p>
        <p><a href="https://github.com/Seeed-Studio/how-to-vend-almost-anything/issues/new?template=submit-installation.yml">Submit a confirmed machine installation</a></p>
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
    updateRoot.innerHTML = `<article class="invite"><h3>No approved public updates.</h3><p>A proposed update is not shown here. Publication waits for a source, a timestamp, and a review.</p></article>`;
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
    labs.forEach((lab) => {
      lab.machines.forEach((machine) => {
        machine.product_categories = (products.products || [])
          .filter((product) => product.machine_id === machine.machine_id)
          .map((product) => product.category);
      });
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

    const apply = () => {
      const state = {
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
        empty.textContent = directory.note || "No directory snapshot and no participating labs yet.";
      } else if (!visible.length) {
        empty.hidden = false;
        empty.textContent = "Nothing matches these filters.";
      } else {
        empty.hidden = true;
      }
      renderList(visible, labs.length);
      mapApi?.draw(visible);
      if (selected && !visible.some((lab) => lab.lab_id === selected)) renderPanel(null, products);
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
    document.querySelector("#directory-note").textContent = directory.note || "";
    renderFeeds(machines, products, updates, labs);
    apply();
  } catch (cause) {
    error.hidden = false;
    error.textContent = `Map data could not be loaded. ${cause.message}`;
  }
}

init();
