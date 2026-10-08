const STATUS_LABEL = {
  directory: "名录条目",
  interested: "有兴趣参与项目",
  pilot: "已确认的试点",
  verified: "已核实的售货机",
  recent_update: "新公布的动态"
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
      ? `<li><p>没有实验室符合这些筛选。</p></li>`
      : `<li><p>没有加载名录快照，也没有审核过的售货安装。</p></li>`;
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
    list.insertAdjacentHTML("beforeend", `<li><p>显示 ${labs.length} 中的 ${shown.length} 个。缩小搜索以查看更多。</p></li>`);
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
    ? lab.machines.map((machine) => `${esc(machine.version)} · ${esc(machine.installation_status)} · 核对于 ${esc(machine.updated_at)}`).join("<br>")
    : "这个实验室还没有公布已核实的售货机。";
  const productText = ownProducts.length
    ? `<ul>${ownProducts.map((product) => {
        const confirmed = product.availability_status === "confirmed";
        const state = confirmed
          ? `最近确认可获得 ${esc(product.availability_updated_at)}`
          : "已列出的产品。可获得性最近没有确认。";
        return `<li>${esc(product.name)} · ${esc(product.category)} · ${state}</li>`;
      }).join("")}</ul>`
    : "<p>没有已审核的产品。</p>";
  panel.hidden = false;
  panel.innerHTML = `
    <p class="status status-${lab.marker_status === "directory" ? "planned" : "done"}">${esc(STATUS_LABEL[lab.marker_status] || lab.marker_status)}</p>
    <h2>${esc(lab.name)}</h2>
    <p>${esc(lab.city)}, ${esc(lab.country)}</p>
    <p>${profile ? `<a href="${esc(profile)}" target="_blank" rel="noreferrer">FabLabs.io 官方资料</a>` : ""}</p>
    <p>${website ? `<a href="${esc(website)}" target="_blank" rel="noreferrer">实验室网站</a>` : "没有记录实验室网站。"}</p>
    <p><strong>已安装的机器。</strong><br>${machineText}</p>
    <div><strong>产品。</strong>${productText}</div>
    <p>最近一次核实更新： ${esc(lab.verification_date || "尚未为本项目核实")}</p>
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
        <h3>第一个参与的实验室还没有公布。</h3>
        <p>在实验室提交安装且有人批准之前，这里保持空白。若存在名录快照，FabLabs.io 上的一个点只表示该实验室在那个名录里。</p>
        <p><a href="https://github.com/Seeed-Studio/how-to-vend-almost-anything/issues/new?template=submit-installation.yml">提交已确认的机器安装</a></p>
      </article>
    `;
  } else {
    machineRoot.innerHTML = publicMachines.map((machine) => {
      const categories = (products.products || []).filter((product) => product.machine_id === machine.machine_id).map((product) => product.category);
      const photo = (machine.photo_urls || []).find((url) => safeHref(url));
      return `
        <article>
          ${photo ? `<img src="${esc(photo)}" alt="安装于 ${esc(labName(machine.lab_id))}" />` : ""}
          <h3>${esc(labName(machine.lab_id))}</h3>
          <p>${esc(machine.version)} · ${esc(machine.installation_status)} · ${esc(machine.published_at)}</p>
          <p>${esc(categories.join(", ") || "没有已审核的产品类别")}</p>
          <p><a href="${esc(safeHref(machine.verification_source))}">核实来源</a></p>
        </article>
      `;
    }).join("");
  }

  const approved = (updates.updates || [])
    .filter((item) => item.review_status === "approved")
    .sort((a, b) => String(b.verified_at).localeCompare(String(a.verified_at)));
  const updateRoot = document.querySelector("#update-feed");
  if (!approved.length) {
    updateRoot.innerHTML = `<article class="invite"><h3>没有已批准的公开动态。</h3><p>提议中的更新不显示在这里。公布需要来源、时间和一次审核。</p></article>`;
    return;
  }
  updateRoot.innerHTML = approved.map((item) => `
    <article>
      <h3>${esc(item.type)}</h3>
      <p>${esc(labName(item.lab_id))}</p>
      <p>${esc(item.description)}</p>
      <p>提交于 ${esc(item.submitted_at)} · 核实于 ${esc(item.verified_at)} · ${esc(item.review_status)}</p>
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
    note.textContent = "地图库没有加载。实验室列表仍然可用。";
    return null;
  }
  const map = window.L.map(canvas, { scrollWheelZoom: true, minZoom: 2 }).setView([20, 0], 2);
  const tiles = window.L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 18,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
  });
  tiles.on("tileerror", () => {
    note.hidden = false;
    note.textContent = "地图瓦片没有加载。搜索和实验室列表仍然可用。";
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
      option.textContent = "没有已审核的产品类别";
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
        empty.textContent = directory.note || "还没有名录快照，也没有参与的实验室。";
      } else if (!visible.length) {
        empty.hidden = false;
        empty.textContent = "没有符合这些筛选的结果。";
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
    error.textContent = `地图数据无法加载。 ${cause.message}`;
  }
}

init();
