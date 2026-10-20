import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { STLLoader } from 'three/addons/loaders/STLLoader.js';
import { loadColoredAssembly } from './load-colored-assembly.js';
import { applyAssemblyGroupFilter, partColor, SELECTED_COLOR } from './assembly-palette.js';

const manifest = window.VENDING_PARTS;
const replacements = Array.isArray(window.VENDING_REPLACEMENTS) ? window.VENDING_REPLACEMENTS : [];
const repoRaw = 'https://raw.githubusercontent.com/Seeed-Studio/how-to-vend-almost-anything/site/fab-vending-pages/';
const repoBlob = 'https://github.com/Seeed-Studio/how-to-vend-almost-anything/blob/site/fab-vending-pages/';
const sourceRoot = `${manifest.machine.sourceRoot}/`;

const replacementMap = new Map();
for (const item of replacements) {
  if (!replacementMap.has(item.partId)) replacementMap.set(item.partId, []);
  replacementMap.get(item.partId).push(item);
}

const activeModel = (part) => {
  const revisions = replacementMap.get(part.id) || [];
  if (!revisions.length) return { ...part, version: manifest.machine.referenceVersion, title: part.name, note: part.role, isReplacement: false };
  const latest = revisions[revisions.length - 1];
  return { ...part, ...latest, isReplacement: true };
};

const previousModel = (part) => {
  const revisions = replacementMap.get(part.id) || [];
  if (!revisions.length) return null;
  if (revisions.length === 1) return { ...part, version: manifest.machine.referenceVersion, title: part.name, note: part.role, isReplacement: false };
  return { ...part, ...revisions[revisions.length - 2], isReplacement: true };
};

function encodeRepoPath(path) {
  return path.split('/').map(encodeURIComponent).join('/');
}
function resolvePath(path) {
  if (/^https?:\/\//i.test(path)) return path;
  const base = path.startsWith('parts/') || path.startsWith('case/') ? sourceRoot : '';
  return repoRaw + encodeRepoPath(base + path);
}
function sourceLink(path) {
  if (/^https?:\/\//i.test(path)) return path;
  const base = path.startsWith('parts/') || path.startsWith('case/') ? sourceRoot : '';
  return repoBlob + encodeRepoPath(base + path);
}
function resolveDisplay(displayPath) {
  if (/^https?:\/\//i.test(displayPath)) return displayPath;
  return new URL(displayPath, import.meta.url).href;
}

const groupById = new Map(manifest.groups.map((g) => [g.id, g]));
const partCount = document.getElementById('part-count');
if (partCount) partCount.textContent = manifest.parts.length;

// --- Render navigation first. The page stays useful even if WebGL/CDN loading fails.
const groupButtons = document.getElementById('group-buttons');
if (groupButtons) {
manifest.groups.forEach((group, index) => {
  const pieces = manifest.parts.filter((p) => p.group === group.id).reduce((sum, part) => sum + (part.qty || 1), 0);
  const button = document.createElement('button');
  button.className = 'group-button';
  button.dataset.group = group.id;
  button.innerHTML = `<span>${String(index + 1).padStart(2,'0')}</span><strong>${group.name}</strong><small>${pieces} pieces</small>`;
  groupButtons.appendChild(button);
});
}

const partsGroups = document.getElementById('parts-groups');
if (partsGroups) {
manifest.groups.forEach((group) => {
  const wrap = document.createElement('section');
  wrap.className = 'part-group';
  const items = manifest.parts.filter((p) => p.group === group.id);
  const pieces = items.reduce((sum, part) => sum + (part.qty || 1), 0);
  wrap.innerHTML = `<div class="part-group-heading"><strong>${group.name} · ${String(pieces).padStart(2,'0')}</strong><p>${group.description}</p></div><div class="part-grid"></div>`;
  const grid = wrap.querySelector('.part-grid');
  items.forEach((part) => {
    const current = activeModel(part);
    const revisions = replacementMap.get(part.id) || [];
    const card = document.createElement('article');
    card.className = `part-card${revisions.length ? ' has-replacement' : ''}`;
    card.dataset.part = part.id;
    card.innerHTML = `
      <div class="part-card-top"><span>${part.format.toUpperCase()} · ${part.variantOf ? 'ALT ' : ''}×${part.qty}</span><span>${revisions.length ? current.version + ' CURRENT' : 'V0 REFERENCE'}</span></div>
      <h3>${current.title || part.name}</h3>
      <p>${current.note || part.role}</p>
      <div class="part-card-bottom"><span>${revisions.length ? `${revisions.length} replacement${revisions.length > 1 ? 's' : ''}` : 'No replacement yet'}</span><a href="${sourceLink(current.source)}" target="_blank" rel="noreferrer">MODEL ↗</a></div>`;
    card.addEventListener('click', (event) => {
      if (event.target.closest('a')) return;
      selectPart(part.id, true);
      document.getElementById('explorer').scrollIntoView({ behavior:'smooth', block:'start' });
    });
    grid.appendChild(card);
  });
  partsGroups.appendChild(wrap);
});
}

const selectionLine = document.getElementById('selection-line');
const inspector = document.getElementById('inspector-content');
function renderInspector(partId) {
  const index = manifest.parts.findIndex((item) => item.id === partId);
  const part = manifest.parts[index] || manifest.parts[0];
  const current = activeModel(part);
  const previous = previousModel(part);
  const revisions = replacementMap.get(part.id) || [];
  const group = groupById.get(part.group);
  const summary = `<strong>${current.title || part.name}</strong> · ${group.name} · ×${part.qty} · ${formatMillimeters(loadedObjects.get(part.id)?.userData.unitSize)}`;
  if (selectionLine) selectionLine.innerHTML = summary;
  if (!inspector) return;
  inspector.innerHTML = `
    <div class="part-index">${String(index + 1).padStart(2,'0')} / ${current.version || 'V0'}</div>
    <h2>${current.title || part.name}</h2>
    <p class="part-role">${current.note || part.role}</p>
    <div class="part-facts">
      <div><span>GROUP</span><strong>${group.name}</strong></div>
      <div><span>QTY</span><strong>${part.variantOf ? 'ALT ' : ''}×${part.qty}</strong></div>
      <div><span>FORMAT</span><strong>${(current.format || part.format).toUpperCase()}</strong></div>
    </div>
    <p class="part-size"><span>TRUE SIZE</span><strong>${formatMillimeters(loadedObjects.get(part.id)?.userData.unitSize)}</strong></p>
    <div class="version-card current">
      <div><span>CURRENT</span><strong>${current.version || 'V0'}${current.isReplacement ? ' replacement' : ' reference'}</strong></div>
      <p>${current.isReplacement ? (current.note || 'Current published replacement.') : 'No replacement has been published for this part yet.'}</p>
    </div>
    ${previous ? `<div class="version-card previous"><div><span>PREVIOUS</span><strong>${previous.version || 'V0'} · ${previous.title || part.name}</strong></div><p>${previous.note || part.role}</p></div>` : ''}
    ${revisions.length ? `<div class="revision-badge">${revisions.length} replacement${revisions.length > 1 ? 's' : ''} layered over V0</div>` : ''}
    <a class="source-link" href="${sourceLink(current.source)}" target="_blank" rel="noreferrer">Open current source model ↗</a>
    ${previous ? `<a class="source-link" href="${sourceLink(previous.source)}" target="_blank" rel="noreferrer">Open previous model ↗</a>` : ''}
  `;
}

// --- Three.js model system
const canvas = document.getElementById('model-canvas');
const viewport = document.getElementById('viewport');
const renderer = new THREE.WebGLRenderer({ canvas, antialias:true, alpha:true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(36, 1, 0.005, 200);
camera.position.set(0.4, 0.55, 1.8);
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.dampingFactor = .06;
controls.target.set(0, 0, 0);
controls.minDistance = 0.03;
controls.maxDistance = 30;

scene.add(new THREE.HemisphereLight(0xeef8ef, 0x16201c, 2.6));
const key = new THREE.DirectionalLight(0xffffff, 3.2); key.position.set(28, 38, 50); scene.add(key);
const rim = new THREE.DirectionalLight(0xffffff, 1.0); rim.position.set(-35, 10, -25); scene.add(rim);

const modelRoot = new THREE.Group();
scene.add(modelRoot);
// The assembled model keeps its original component transforms.
const assemblyRoot = new THREE.Group();
assemblyRoot.name = 'complete-assembly';
assemblyRoot.visible = false;
scene.add(assemblyRoot);
const stepAssemblyRoot = new THREE.Group();
stepAssemblyRoot.name = 'step-assembly';
stepAssemblyRoot.visible = false;
scene.add(stepAssemblyRoot);
let stepAssemblyPath = '';
let stepAssemblyPromise = null;

let fullMachineView = true;
let preferredFullMode = 'separate';
const loadedObjects = new Map();
const pickables = [];
const gltfLoader = new GLTFLoader();
const stlLoader = new STLLoader();
let selectedPartId = 'dispenser';
let activeGroups = null;
const explodedAmount = 0.28;
let occtPromise = null;

const ENCLOSURE_PART_IDS = new Set(['led-holder', 'led-diffuser']);

function viewerGroup(part) {
  return ENCLOSURE_PART_IDS.has(part.id) ? 'shell' : part.group;
}

function groupVisible(groupId) {
  return !activeGroups || activeGroups.has(groupId);
}

function meshMaterial(part, selected=false) {
  const color = selected ? SELECTED_COLOR : partColor(part);
  return new THREE.MeshStandardMaterial({ color, roughness:.58, metalness:.08, transparent:true, opacity: groupVisible(viewerGroup(part)) ? 1 : .08 });
}

function formatMillimeters(size) {
  if (!size) return 'Measuring…';
  const mm = (value) => Math.round(value * 1000);
  return `${mm(size.x)} × ${mm(size.y)} × ${mm(size.z)} mm`;
}

function centerToRealMeters(object) {
  object.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(object);
  const size = new THREE.Vector3();
  const center = new THREE.Vector3();
  box.getSize(size);
  box.getCenter(center);
  object.traverse((child) => {
    if (!child.isMesh) return;
    const geometry = child.geometry.clone();
    geometry.applyMatrix4(child.matrixWorld);
    geometry.translate(-center.x, -center.y, -center.z);
    child.geometry = geometry;
  });
  object.traverse((child) => {
    child.position.set(0, 0, 0);
    child.rotation.set(0, 0, 0);
    child.scale.set(1, 1, 1);
    child.updateMatrix();
  });
  object.userData.realSize = size;
  return object;
}

function convertMillimetersToMeters(object) {
  object.traverse((child) => {
    if (!child.isMesh) return;
    child.geometry = child.geometry.clone();
    child.geometry.scale(0.001, 0.001, 0.001);
  });
}

function makeProxy(part) {
  const geo = new THREE.BoxGeometry(0.05, 0.05, 0.05);
  const mesh = new THREE.Mesh(geo, meshMaterial(part));
  const edges = new THREE.LineSegments(new THREE.EdgesGeometry(geo), new THREE.LineBasicMaterial({color:0xe5eee9,transparent:true,opacity:.22}));
  const group = new THREE.Group();
  group.add(mesh, edges);
  group.userData.proxy = true;
  group.userData.realSize = new THREE.Vector3(0.05, 0.05, 0.05);
  return group;
}

async function getOcct() {
  if (!occtPromise) {
    if (typeof window.occtimportjs !== 'function') throw new Error('STEP runtime unavailable');
    occtPromise = window.occtimportjs({ locateFile: (file) => `https://cdn.jsdelivr.net/npm/occt-import-js@0.0.24/dist/${file}` });
  }
  return occtPromise;
}

async function loadStep(part, model) {
  const occt = await getOcct();
  const response = await fetch(resolvePath(model.source));
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  const result = occt.ReadStepFile(bytes, { linearUnit:'millimeter', linearDeflectionType:'bounding_box_ratio', linearDeflection:.002, angularDeflection:.5 });
  if (!result.success) throw new Error('STEP parse failed');
  const group = new THREE.Group();
  const flat = (array) => Array.isArray(array?.[0]) ? array.flat() : array;
  for (const sourceMesh of result.meshes || []) {
    const geometry = new THREE.BufferGeometry();
    const positions = flat(sourceMesh.attributes?.position?.array || []);
    const normals = flat(sourceMesh.attributes?.normal?.array || []);
    const indices = flat(sourceMesh.index?.array || []);
    if (!positions.length) continue;
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions,3));
    if (normals.length) geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals,3)); else geometry.computeVertexNormals();
    if (indices.length) geometry.setIndex(indices);
    geometry.computeBoundingSphere();
    group.add(new THREE.Mesh(geometry, meshMaterial(part)));
  }
  convertMillimetersToMeters(group);
  return centerToRealMeters(group);
}

async function loadGlb(part, model) {
  const gltf = await gltfLoader.loadAsync(resolveDisplay(model.display));
  const object = gltf.scene;
  object.name = part.id;
  object.traverse((child) => {
    if (!child.isMesh) return;
    const previous = child.material;
    child.material = meshMaterial(part);
    if (Array.isArray(previous)) previous.forEach((material) => material.dispose?.());
    else previous?.dispose?.();
    if (!child.name || /^(cube|object|scene|mesh)/i.test(child.name)) child.name = part.id;
  });
  return centerToRealMeters(object);
}

async function loadStl(part, model) {
  const geometry = await stlLoader.loadAsync(resolvePath(model.source));
  geometry.computeVertexNormals();
  const mesh = new THREE.Mesh(geometry, meshMaterial(part));
  convertMillimetersToMeters(mesh);
  return centerToRealMeters(mesh);
}

const COPY_GAP = 0.008;

function realSizeOf(part) {
  const size = loadedObjects.get(part.id)?.userData.realSize;
  return size ? size.clone() : new THREE.Vector3(0.05, 0.05, 0.05);
}

function orientForWorkbench(object, part) {
  // Broad faces point up so panels and boards read clearly from the elevated view.
  // The outer case and back plate stay upright, beside each other.
  const layFlat = (['shell', 'frame'].includes(part.group) && !['outer-enclosure', 'back-plate'].includes(part.id))
    || ['xiao-series', 'xiao-esp32s3', 'wio-terminal'].includes(part.id);
  if (!layFlat || object.userData.proxy) return object;
  const size = object.userData.realSize;
  if (size.z <= size.x && size.z < size.y) object.rotation.x = -Math.PI / 2;
  else if (size.x < size.y && size.x < size.z) object.rotation.z = Math.PI / 2;
  else return object;
  return centerToRealMeters(object);
}

function packSpec(part) {
  const count = Math.max(1, part.qty || 1);
  if (part.id === 'product-column') return { cols: 2, gap: 0.006 };
  if (part.id === 'xiao-esp32s3') return { cols: 5, gap: 0.001 };
  if (part.id === 'xiao-series') return { cols: 4, gap: 0.003 };
  if (['dispenser', 'dispenser-specific', 'dispenser-arm', 'small-feet'].includes(part.id)) return { cols: 2, gap: 0.006 };
  if (part.id === 'l-holder') return { cols: 3, gap: 0.006 };
  return { cols: Math.ceil(Math.sqrt(count)), gap: COPY_GAP };
}

function withQuantityCopies(object, part) {
  const count = Math.max(1, part.qty || 1);
  const size = object.userData.realSize.clone();
  object.userData.unitSize = size.clone();
  if (count === 1) return object;
  const holder = new THREE.Group();
  holder.name = part.id;
  const spec = packSpec(part);
  const cols = Math.min(count, spec.cols);
  const rows = Math.ceil(count / cols);
  const pitchX = size.x + spec.gap;
  const pitchZ = size.z + spec.gap;
  holder.userData.unitSize = size.clone();
  holder.userData.realSize = new THREE.Vector3(cols * pitchX - spec.gap, size.y, rows * pitchZ - spec.gap);
  const originZ = -holder.userData.realSize.z / 2 + size.z / 2;
  for (let index = 0; index < count; index += 1) {
    const copy = index === 0 ? object : object.clone(true);
    const row = Math.floor(index / cols);
    const rowCount = Math.min(cols, count - row * cols);
    // Center a partial final row instead of leaving an unbalanced corner.
    copy.position.set(((index % cols) - (rowCount - 1) / 2) * pitchX, 0, originZ + row * pitchZ);
    copy.rotation.set(0, 0, 0);
    copy.scale.set(1, 1, 1);
    holder.add(copy);
  }
  return holder;
}

// A parts workbench, not an assembly drawing: each zone shares the same floor.
const BULKS = [
  { id: 'enclosure', label: 'Enclosure', groups: ['foundation', 'shell', 'frame'] },
  { id: 'storage', label: 'Storage', groups: ['storage'] },
  { id: 'control', label: 'Control', groups: ['interface'] },
  { id: 'dispensing', label: 'Dispensing', groups: ['dispensing'] }
];
let workbenchLayout = { positions: new Map(), zones: [] };

function placeBulk(parts, gap) {
  if (!parts.length) return { centers: new Map(), width: 0, depth: 0 };
  const items = parts.map((part) => ({ part, size: realSizeOf(part) }))
    .sort((a, b) => b.size.z - a.size.z || b.size.x - a.size.x || a.part.id.localeCompare(b.part.id));
  const widest = Math.max(...items.map((item) => item.size.x));
  const area = items.reduce((sum, item) => sum + (item.size.x + gap) * (item.size.z + gap), 0);
  const idealWidth = Math.max(widest, Math.sqrt(area) * 1.15);
  let best;
  for (const factor of [0.85, 1, 1.2, 1.45]) {
    const maxWidth = Math.max(widest, idealWidth * factor);
    const placed = [];
    let x = 0, z = 0, rowDepth = 0;
    for (const item of items) {
      if (x > 0 && x + item.size.x > maxWidth + 1e-6) {
        z += rowDepth + gap; x = 0; rowDepth = 0;
      }
      placed.push({ ...item, x, z });
      x += item.size.x + gap;
      rowDepth = Math.max(rowDepth, item.size.z);
    }
    const width = Math.max(...placed.map((item) => item.x + item.size.x));
    const depth = Math.max(...placed.map((item) => item.z + item.size.z));
    const score = width * depth * (1 + 0.3 * Math.abs(Math.log(width / Math.max(depth, 0.001))));
    if (!best || score < best.score) best = { placed, width, depth, score };
  }
  const centers = new Map(best.placed.map((item) => [item.part.id, {
    x: item.x + item.size.x / 2 - best.width / 2,
    z: item.z + item.size.z / 2 - best.depth / 2
  }]));
  return { centers, width: best.width, depth: best.depth };
}

function placeEnclosure(parts, gap) {
  const panels = ['outer-enclosure', 'back-plate'].map((id) => parts.find((part) => part.id === id)).filter(Boolean);
  const leds = ['led-holder', 'led-diffuser'].map((id) => parts.find((part) => part.id === id)).filter(Boolean);
  const rest = parts.filter((part) => !panels.includes(part) && !leds.includes(part));
  const panelGap = 0.008;
  const ledGap = 0.002;
  const frontGap = 0.002;
  const panelSizes = panels.map((part) => realSizeOf(part));
  const panelWidth = panelSizes.reduce((sum, size, index) => sum + size.x + (index ? panelGap : 0), 0);
  const panelDepth = Math.max(...panelSizes.map((size) => size.z), 0);
  const restPacked = placeBulk(rest, gap);
  const ledSizes = leds.map((part) => realSizeOf(part));
  const ledWidth = ledSizes.reduce((sum, size, index) => sum + size.x + (index ? ledGap : 0), 0);
  const ledDepth = Math.max(...ledSizes.map((size) => size.z), 0);
  const bodyDepth = panelDepth + (panels.length && rest.length ? gap : 0) + restPacked.depth;
  const width = Math.max(panelWidth, restPacked.width, ledWidth, 0.001);
  const depth = bodyDepth + (leds.length ? frontGap + ledDepth : 0);
  const centers = new Map();
  let panelX = -panelWidth / 2;
  panels.forEach((part, index) => {
    const size = panelSizes[index];
    centers.set(part.id, { x: panelX + size.x / 2, z: -depth / 2 + panelDepth / 2 });
    panelX += size.x + panelGap;
  });
  const restZ = -depth / 2 + panelDepth + (panels.length && rest.length ? gap : 0) + restPacked.depth / 2;
  restPacked.centers.forEach((center, id) => centers.set(id, { x: center.x, z: restZ + center.z }));
  let ledX = -ledWidth / 2;
  leds.forEach((part, index) => {
    const size = ledSizes[index];
    centers.set(part.id, { x: ledX + size.x / 2, z: depth / 2 - size.z / 2 });
    ledX += size.x + ledGap;
  });
  return { centers, width, depth };
}

function placeStorage(parts, gap) {
  const column = parts.find((part) => part.id === 'product-column');
  if (!column) return placeBulk(parts, gap);
  const size = realSizeOf(column);
  const boards = placeBulk(parts.filter((part) => part !== column), gap);
  const separation = boards.centers.size ? gap : 0;
  const depth = size.z + separation + boards.depth;
  const centers = new Map([[column.id, { x: 0, z: -depth / 2 + size.z / 2 }]]);
  boards.centers.forEach((center, id) => centers.set(id, {
    x: center.x, z: -depth / 2 + size.z + separation + boards.depth / 2 + center.z
  }));
  return { centers, width: Math.max(size.x, boards.width), depth };
}

const VERSION_RANK = { V0: 0, V1: 1 };
let selectedVersion = 'V0';

function versionRank(id) {
  return Object.prototype.hasOwnProperty.call(VERSION_RANK, id) ? VERSION_RANK[id] : 0;
}

let displayMap = null;

function currentSystem() {
  return document.querySelector('[data-system][aria-selected="true"]')?.dataset.system || 'full';
}

function modePaths(mode = preferredFullMode) {
  if (!displayMap) return null;
  const entry = displayMap[selectedVersion]?.[currentSystem()];
  if (!entry) return null;
  if (mode === 'separate') {
    const list = Array.isArray(entry.separate) ? entry.separate.filter(Boolean) : [];
    return list.length ? list : null;
  }
  const path = typeof entry.assemble === 'string' ? entry.assemble.trim() : '';
  return path || null;
}

function partShown(part) {
  if (preferredFullMode === 'assemble') {
    const path = modePaths('assemble');
    return Boolean(path && !path.endsWith('.glb') && part.display === path);
  }
  const paths = modePaths('separate');
  return Boolean(paths && paths.includes(part.display));
}

function refreshVersionChrome() {
  const zh = document.documentElement.lang.startsWith('zh');
  document.querySelectorAll('[data-machine-version]').forEach((button) => {
    button.setAttribute('aria-pressed', String(button.dataset.machineVersion === selectedVersion));
  });
  const label = document.getElementById('view-label');
  const bar = document.getElementById('machine-version-label');
  if (label) label.textContent = zh ? `${selectedVersion} / 交互模型` : `${selectedVersion} / Interactive model`;
  if (bar) {
    const note = selectedVersion === 'V0' ? (zh ? '参考' : 'Reference') : (zh ? '替换件' : 'Replacements');
    bar.textContent = `${selectedVersion} / ${note}`;
  }
}

function preferAvailableMode() {
  if (!displayMap || modePaths(preferredFullMode)) return;
  if (modePaths('separate')) preferredFullMode = 'separate';
  else if (modePaths('assemble')) preferredFullMode = 'assemble';
}

function setMachineVersion(id) {
  if (!Object.prototype.hasOwnProperty.call(VERSION_RANK, id) || id === selectedVersion) return;
  selectedVersion = id;
  refreshVersionChrome();
  preferAvailableMode();
  if (preferredFullMode === 'assemble' && modePaths('assemble')) {
    void setDisplayMode('assemble');
    return;
  }
  updatePositions(true);
  recolorPart(selectedPartId);
  syncDisplayMode();
  fitAll();
}

function buildWorkbenchLayout() {
  const innerGap = THREE.MathUtils.lerp(0.008, 0.025, explodedAmount);
  const zoneGap = THREE.MathUtils.lerp(0.035, 0.095, explodedAmount);
  const zones = BULKS.map((bulk) => {
    const parts = manifest.parts.filter((part) => {
      if (!partShown(part)) return false;
      if (bulk.id === 'enclosure') return bulk.groups.includes(part.group) || ENCLOSURE_PART_IDS.has(part.id);
      if (bulk.id === 'control') return part.group === 'interface' && !ENCLOSURE_PART_IDS.has(part.id);
      return bulk.groups.includes(part.group);
    });
    const packed = bulk.id === 'storage'
      ? placeStorage(parts, innerGap)
      : bulk.id === 'enclosure'
        ? placeEnclosure(parts, innerGap)
        : placeBulk(parts, innerGap);
    return { ...bulk, ...packed, parts };
  });
  // Give the large case its own column. Three smaller systems share the other
  // column instead of reserving an enclosure-sized empty row for each system.
  const enclosure = zones[0];
  const rightZones = [zones[1], zones[3], zones[2]].filter((zone) => zone.parts.length);
  const rightWidth = Math.max(...rightZones.map((zone) => zone.width), 0);
  const rightDepth = rightZones.reduce((sum, zone) => sum + zone.depth, 0)
    + zoneGap * Math.max(0, rightZones.length - 1);
  const width = enclosure.width + (enclosure.parts.length && rightZones.length ? zoneGap : 0) + rightWidth;
  enclosure.x = -width / 2 + enclosure.width / 2;
  enclosure.z = 0;
  let z = -rightDepth / 2;
  rightZones.forEach((zone) => {
    zone.x = width / 2 - rightWidth / 2;
    zone.z = z + zone.depth / 2;
    z += zone.depth + zoneGap;
  });
  const positions = new Map();
  zones.forEach((zone) => {
    zone.centers.forEach((center, id) => {
      const part = manifest.parts.find((item) => item.id === id);
      positions.set(id, new THREE.Vector3(zone.x + center.x, realSizeOf(part).y / 2, zone.z + center.z));
    });
  });
  return { positions, zones };
}

function currentPartPosition(part) {
  return workbenchLayout.positions.get(part.id)?.clone() || new THREE.Vector3();
}

function updatePositions(immediate=false) {
  workbenchLayout = buildWorkbenchLayout();
  for (const part of manifest.parts) {
    const object = loadedObjects.get(part.id);
    if (!object) continue;
    object.userData.targetPosition = currentPartPosition(part);
    if (immediate) object.position.copy(object.userData.targetPosition);
  }
}

// Labels live in the DOM, remain crisp, and never change the scale of the CAD.
const workbenchStyle = document.createElement('style');
workbenchStyle.id = 'vending-workbench-styles';
workbenchStyle.textContent = `
  #viewport { position: relative; isolation: isolate; }
  #viewport .reference-ghost { display: none; }
  .workbench-zone-labels { position: absolute; inset: 0; pointer-events: none; z-index: 3; overflow: hidden; }
  .workbench-zone-label { position: absolute; transform: translate(-50%, 0); padding: 5px 9px; border: 1px solid rgba(196,224,222,.22); border-radius: 6px; background: rgba(0,43,55,.86); color: #e5f0e9; font: 500 11px/1.2 system-ui,sans-serif; letter-spacing: .03em; white-space: nowrap; }
  .workbench-zone-label[hidden] { display: none; }
  #model-canvas { touch-action: none; }
  @media (max-width: 600px) { .workbench-zone-label { font-size: 10px; padding: 4px 6px; } }
`;
if (!document.getElementById(workbenchStyle.id)) document.head.appendChild(workbenchStyle);
const zoneLabels = document.createElement('div');
zoneLabels.className = 'workbench-zone-labels';
zoneLabels.setAttribute('aria-hidden', 'true');
viewport.appendChild(zoneLabels);
for (const zone of BULKS) {
  const label = document.createElement('span');
  label.className = 'workbench-zone-label';
  label.dataset.zone = zone.id;
  const zhLabels = { enclosure: '机箱', storage: '储料', control: '控制', dispensing: '出料' };
  label.textContent = document.documentElement.lang.startsWith('zh') ? zhLabels[zone.id] : zone.label;
  zoneLabels.appendChild(label);
}
const assemblyModeControls = document.getElementById('assembly-mode-controls');
const assemblyStatus = document.getElementById('assembly-status');
let assemblyReady = false;
let assemblyPromise = null;

async function ensureAssemblyLoaded() {
  if (assemblyReady) return;
  if (!assemblyPromise) {
    assemblyPromise = (async () => {
      await loadColoredAssembly(gltfLoader, assemblyRoot);
      const bounds = new THREE.Box3().setFromObject(assemblyRoot);
      if (bounds.isEmpty()) throw new Error('The assembly model is empty.');
      assemblyReady = true;
    })().catch((error) => {
      assemblyPromise = null;
      throw error;
    });
  }
  return assemblyPromise;
}

async function ensureStepAssembly(path) {
  if (stepAssemblyPath === path && stepAssemblyRoot.children.length) return;
  if (stepAssemblyPromise) return stepAssemblyPromise;
  stepAssemblyPromise = (async () => {
    const url = new URL(path, import.meta.url).href;
    const object = /\.(step|stp)$/i.test(path)
      ? await loadStep({ id: 'step-assembly', group: 'frame' }, { source: url })
      : await loadStl({ id: 'step-assembly', group: 'frame' }, { source: url });
    object.traverse((child) => {
      if (!child.isMesh) return;
      child.material = new THREE.MeshStandardMaterial({ color: 0x81968d, roughness: 0.62, metalness: 0.06 });
    });
    stepAssemblyRoot.clear();
    stepAssemblyRoot.add(object);
    stepAssemblyPath = path;
  })().catch((error) => {
    stepAssemblyPromise = null;
    throw error;
  });
  return stepAssemblyPromise;
}

function assemblyStatusText(state) {
  const zh = document.documentElement.lang.startsWith('zh');
  if (state === 'loading') return zh ? '正在加载装配…' : 'Loading assembly…';
  if (state === 'ready') return zh ? '已装配' : 'Assembled';
  return zh ? '装配不可用，正在显示分离零件。' : 'Assembly unavailable. Showing separate parts.';
}

function syncDisplayMode() {
  const separatePaths = modePaths('separate');
  const assemblePath = modePaths('assemble');
  const hasSeparate = Boolean(separatePaths);
  const hasAssemble = Boolean(assemblePath);
  const showAssembly = preferredFullMode === 'assemble' && hasAssemble && assemblePath.endsWith('.glb') && assemblyReady;
  const showStep = preferredFullMode === 'assemble' && hasAssemble && !assemblePath.endsWith('.glb') && !manifest.parts.some((part) => part.display === assemblePath);
  const hasView = preferredFullMode === 'separate' ? hasSeparate : hasAssemble;
  if (showAssembly) applyAssemblyGroupFilter(assemblyRoot, null, null);
  modelRoot.visible = hasView && !showAssembly && !showStep;
  assemblyRoot.visible = showAssembly;
  stepAssemblyRoot.visible = showStep;
  zoneLabels.style.display = hasView && !showAssembly ? '' : 'none';
  const spacing = document.querySelector('.explode-control');
  if (spacing) spacing.hidden = !hasView || showAssembly;
  let viewEmpty = document.getElementById('view-empty');
  if (!viewEmpty) {
    viewEmpty = document.createElement('div');
    viewEmpty.id = 'view-empty';
    viewport.appendChild(viewEmpty);
  }
  const zh = document.documentElement.lang.startsWith('zh');
  viewEmpty.textContent = zh ? '此视图还没有模型' : 'No model for this view';
  viewEmpty.hidden = hasView;
  if (assemblyModeControls) {
    assemblyModeControls.hidden = false;
    assemblyModeControls.querySelectorAll('[data-display-mode]').forEach((button) => {
      const available = button.dataset.displayMode === 'separate' ? hasSeparate : hasAssemble;
      button.disabled = !available;
      button.setAttribute('aria-pressed', String(available && button.dataset.displayMode === preferredFullMode));
    });
  }
  if (assemblyStatus) assemblyStatus.hidden = true;
}

async function setDisplayMode(mode) {
  if (!['separate', 'assemble'].includes(mode)) return;
  if (displayMap && !modePaths(mode)) return;
  preferredFullMode = mode;
  syncDisplayMode();
  if (mode === 'assemble' && modePaths('assemble')?.endsWith('.glb')) {
    if (assemblyStatus && !assemblyReady) assemblyStatus.textContent = assemblyStatusText('loading');
    try {
      await ensureAssemblyLoaded();
    } catch (error) {
      console.error('Assembly loading failed:', error);
      if (preferredFullMode === 'assemble') {
        preferredFullMode = 'separate';
        syncDisplayMode();
        if (assemblyStatus) assemblyStatus.textContent = assemblyStatusText('error');
        fitAll();
      }
      return;
    }
  }
  if (mode === 'assemble' && modePaths('assemble') && !modePaths('assemble').endsWith('.glb') && !manifest.parts.some((part) => part.display === modePaths('assemble'))) {
    try {
      await ensureStepAssembly(modePaths('assemble'));
    } catch (error) {
      console.error('Assembly file loading failed:', error);
      return;
    }
  }
  updatePositions(true);
  recolorPart('');
  syncDisplayMode();
  fitAll();
}

assemblyModeControls?.addEventListener('click', (event) => {
  const button = event.target.closest('[data-display-mode]');
  if (button) void setDisplayMode(button.dataset.displayMode);
});

syncDisplayMode();

function updateZoneLabels() {
  for (const zone of workbenchLayout.zones) {
    const label = zoneLabels.querySelector(`[data-zone="${zone.id}"]`);
    const visible = zone.parts.length && zone.groups.some(groupVisible);
    const point = new THREE.Vector3(zone.x, 0, zone.z + zone.depth / 2 + 0.012).project(camera);
    label.hidden = !visible || point.z < -1 || point.z > 1 || Math.abs(point.x) > 1 || Math.abs(point.y) > 1;
    if (!label.hidden) {
      label.style.left = `${(point.x + 1) * 50}%`;
      label.style.top = `${(1 - point.y) * 50}%`;
    }
  }
}

async function loadSource(part, model) {
  return model.format === 'step' ? loadStep(part, model) : loadStl(part, model);
}

async function loadPart(part) {
  const current = activeModel(part);
  let object;
  try {
    if (typeof current.display === "string" && current.display.endsWith(".stl")) {
      object = await loadStl(part, { source: new URL(current.display, import.meta.url).href });
    } else if (current.display) {
      try {
        object = await loadGlb(part, current);
      } catch (error) {
        console.warn(`GLB failed for ${part.name}, using source CAD`, error);
        object = await loadSource(part, current);
      }
    } else {
      object = await loadSource(part, current);
    }
    if (part.id === 'product-column') {
      object.rotation.x = -Math.PI / 2;
      object.updateMatrixWorld(true);
      object = centerToRealMeters(object);
    }
  } catch (error) {
    console.warn(`Using proxy for ${part.name}`, error);
    object = makeProxy(part);
  }
  object = orientForWorkbench(object, part);
  object = withQuantityCopies(object, part);
  object.userData.partId = part.id;
  object.userData.part = part;
  object.traverse((child) => {
    if (child.isMesh) {
      child.userData.partId = part.id;
      child.userData.part = part;
      pickables.push(child);
    }
  });
  object.position.copy(currentPartPosition(part));
  loadedObjects.set(part.id,object);
  modelRoot.add(object);
  updatePositions(true);
  recolorPart(selectedPartId);
  return object;
}

async function loadAll() {
  const state = document.getElementById('load-state');
  let done = 0;
  // Display GLBs load first. Source STEP/STL is only the fallback inside loadPart.
  const ordered = [...manifest.parts].sort((a,b) => (a.display ? 0 : 1) - (b.display ? 0 : 1));
  const queue = [...ordered];
  const worker = async () => {
    while (queue.length) {
      const part = queue.shift();
      await loadPart(part);
      done++;
      fitAll();
      state.textContent = `${done}/${manifest.parts.length} display models ready`;
    }
  };
  await Promise.all([worker(),worker(),worker()]);
  document.getElementById('fallback-map').style.opacity = '0';
  const proxies = [...loadedObjects.values()].filter((object) => object.userData.proxy || object.children.some((child) => child.userData.proxy)).length;
  state.textContent = proxies ? `${manifest.parts.length - proxies}/${manifest.parts.length} models · ${proxies} placeholders` : `${manifest.parts.length} models · true scale`;
  updatePositions(true);
  fitAll();
  recolorPart(selectedPartId);
}

function setObjectOpacity(object, opacity) {
  object.traverse((child) => {
    if (!child.isMesh || !child.material) return;
    child.material.transparent = opacity < 1;
    child.material.opacity = opacity;
    child.material.depthWrite = opacity > .2;
  });
}
function recolorPart(partId) {
  for (const part of manifest.parts) {
    const object = loadedObjects.get(part.id); if (!object) continue;
    if (!partShown(part)) {
      object.visible = false;
      continue;
    }
    const dimmed = activeGroups && !activeGroups.has(viewerGroup(part));
    object.visible = !dimmed;
    const selected = part.id === partId;
    object.traverse((child) => {
      if (!child.isMesh) return;
      child.material.color.setHex(selected ? SELECTED_COLOR : partColor(part));
      child.material.emissive?.setHex(selected ? 0x213000 : 0x000000);
    });
    setObjectOpacity(object, dimmed ? .07 : 1);
  }
}

function selectPart(partId, focus=false, announce=false) {
  selectedPartId = partId;
  const part = manifest.parts.find((item) => item.id === partId);
  if (part && !groupVisible(viewerGroup(part))) activeGroups = null;
  if (!document.body.classList.contains('workbench-page')) renderInspector(partId);
  recolorPart(partId);
  if (announce) document.dispatchEvent(new CustomEvent('vending:part', { detail: { partId } }));
  if (focus) {
    const object = loadedObjects.get(partId);
    if (object) fitObjects([object], true);
  }
}

function applyFilter(groupId) {
  activeGroups = !groupId || groupId === 'all' ? null : new Set([groupId]);
  document.querySelectorAll('.group-button').forEach((button) => button.classList.toggle('active',button.dataset.group === groupId));
  recolorPart(selectedPartId);
  fitAll();
}

function focusGroups(ids) {
  const list = Array.isArray(ids) ? ids.filter(Boolean) : [];
  fullMachineView = list.length === 0;
  activeGroups = list.length ? new Set(list) : null;
  selectedPartId = '';
  preferAvailableMode();
  recolorPart('');
  updatePositions(true);
  if (preferredFullMode === 'assemble' && modePaths('assemble')?.endsWith('.glb')) {
    void setDisplayMode('assemble');
    return;
  }
  syncDisplayMode();
  fitAll();
}

document.querySelectorAll('.group-button').forEach((button) => button.addEventListener('click',() => applyFilter(button.dataset.group)));

document.querySelectorAll('[data-machine-version]').forEach((button) => {
  button.addEventListener('click', () => setMachineVersion(button.dataset.machineVersion));
});
refreshVersionChrome();

function fitObjects(objects, preserveDirection=false) {
  const box = new THREE.Box3();
  objects.forEach((object) => {
    if (!object.visible) return;
    // Frame the destination even during loading/animation.
    const local = new THREE.Box3().setFromObject(object);
    if (object.userData.targetPosition) local.translate(object.userData.targetPosition.clone().sub(object.position));
    box.union(local);
  });
  if (box.isEmpty()) return;
  const center = box.getCenter(new THREE.Vector3());
  const direction = preserveDirection ? camera.position.clone().sub(controls.target).normalize() : new THREE.Vector3(0.32, 0.95, 1.3).normalize();
  camera.position.copy(center).add(direction);
  camera.lookAt(center);
  camera.updateMatrixWorld(true);
  // Fit all eight corners to both vertical AND horizontal fields of view.
  const inverseRotation = camera.quaternion.clone().invert();
  const tanY = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
  const tanX = tanY * camera.aspect;
  let distance = 0.03;
  for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z]) {
    const corner = new THREE.Vector3(x, y, z).sub(center).applyQuaternion(inverseRotation);
    distance = Math.max(distance, corner.z + Math.abs(corner.x) / (tanX * 0.80), corner.z + Math.abs(corner.y) / (tanY * 0.80));
  }
  controls.target.copy(center);
  camera.position.copy(center).addScaledVector(direction, distance + 0.02);
  controls.minDistance = Math.max(0.01, distance * 0.15);
  controls.maxDistance = Math.max(2, distance * 6);
  camera.lookAt(center);
  controls.update();
}
function fitAll(preserveDirection=false) {
  const objects = [];
  if (assemblyRoot.visible) {
    assemblyRoot.traverse((object) => {
      if (object.isMesh && object.visible) objects.push(object);
    });
  }
  if (stepAssemblyRoot.visible) {
    stepAssemblyRoot.traverse((object) => {
      if (object.isMesh && object.visible) objects.push(object);
    });
  }
  if (modelRoot.visible) objects.push(...loadedObjects.values());
  fitObjects(objects, preserveDirection === true);
}

const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
let pointerStart = null;
canvas.addEventListener('pointerdown', (event) => { pointerStart = { x: event.clientX, y: event.clientY }; });
canvas.addEventListener('pointercancel', () => { pointerStart = null; });
canvas.addEventListener('pointerup',(event) => {
  if (assemblyRoot.visible) return;
  const start = pointerStart; pointerStart = null;
  if (!start || Math.hypot(event.clientX - start.x, event.clientY - start.y) > 5) return;
  const rect = canvas.getBoundingClientRect();
  pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(pointer,camera);
  const hit = raycaster.intersectObjects(pickables,false).find((item) => loadedObjects.get(item.object.userData.partId)?.visible);
  if (hit?.object?.userData?.partId) selectPart(hit.object.userData.partId, false, true);
});

function resize() {
  const rect = viewport.getBoundingClientRect();
  renderer.setSize(rect.width,rect.height,false);
  camera.aspect = rect.width / Math.max(rect.height,1); camera.updateProjectionMatrix();
}
new ResizeObserver(() => { resize(); if (loadedObjects.size) fitAll(true); }).observe(viewport);
resize();

function animate() {
  requestAnimationFrame(animate);
  for (const object of loadedObjects.values()) {
    if (!object.userData.targetPosition) continue;
    object.position.lerp(object.userData.targetPosition,.085);
  }
  controls.update();
  updateZoneLabels();
  renderer.render(scene,camera);
}
animate();
if (!document.body.classList.contains('workbench-page')) renderInspector(selectedPartId);
window.VENDING_VIEWER = { focusGroups, fitAll };
document.dispatchEvent(new CustomEvent('vending:ready'));
fetch(new URL('../display-models.json?v=v1-dispensing-more', import.meta.url))
  .then((response) => response.json())
  .then((data) => {
    displayMap = data;
    updatePositions(true);
    recolorPart('');
    syncDisplayMode();
    fitAll();
  })
  .catch((error) => console.error('Display list failed', error));
loadAll().catch((error) => {
  console.error(error);
  document.getElementById('load-state').textContent = '3D runtime unavailable · parts board remains available';
});
