import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { STLLoader } from 'three/addons/loaders/STLLoader.js';

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
manifest.groups.forEach((group, index) => {
  const pieces = manifest.parts.filter((p) => p.group === group.id).reduce((sum, part) => sum + (part.qty || 1), 0);
  const button = document.createElement('button');
  button.className = 'group-button';
  button.dataset.group = group.id;
  button.innerHTML = `<span>${String(index + 1).padStart(2,'0')}</span><strong>${group.name}</strong><small>${pieces} 件</small>`;
  groupButtons.appendChild(button);
});

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
      <div class="part-card-top"><span>${part.format.toUpperCase()} · ${part.variantOf ? 'ALT ' : ''}×${part.qty}</span><span>${revisions.length ? current.version + ' 当前' : 'V0 参考'}</span></div>
      <h3>${current.title || part.name}</h3>
      <p>${current.note || part.role}</p>
      <div class="part-card-bottom"><span>${revisions.length ? `${revisions.length} 个替换件` : '还没有替换件'}</span><a href="${sourceLink(current.source)}" target="_blank" rel="noreferrer">模型 ↗</a></div>`;
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
  const summary = `<strong>${current.title || part.name}</strong> · ${group.name} · ×${part.qty} · ${formatMillimeters(loadedObjects.get(part.id)?.userData.realSize)}`;
  if (selectionLine) selectionLine.innerHTML = summary;
  if (!inspector) return;
  inspector.innerHTML = `
    <div class="part-index">${String(index + 1).padStart(2,'0')} / ${current.version || 'V0'}</div>
    <h2>${current.title || part.name}</h2>
    <p class="part-role">${current.note || part.role}</p>
    <div class="part-facts">
      <div><span>分组</span><strong>${group.name}</strong></div>
      <div><span>数量</span><strong>${part.variantOf ? 'ALT ' : ''}×${part.qty}</strong></div>
      <div><span>格式</span><strong>${(current.format || part.format).toUpperCase()}</strong></div>
    </div>
    <p class="part-size"><span>真实尺寸</span><strong>${formatMillimeters(loadedObjects.get(part.id)?.userData.realSize)}</strong></p>
    <div class="version-card current">
      <div><span>当前</span><strong>${current.version || 'V0'}${current.isReplacement ? ' 替换' : ' 参考'}</strong></div>
      <p>${current.isReplacement ? (current.note || '当前已公布的替换件。') : '这个零件还没有公布替换件。'}</p>
    </div>
    ${previous ? `<div class="version-card previous"><div><span>先前</span><strong>${previous.version || 'V0'} · ${previous.title || part.name}</strong></div><p>${previous.note || part.role}</p></div>` : ''}
    ${revisions.length ? `<div class="revision-badge">${revisions.length} 个替换件叠在 V0 之上</div>` : ''}
    <a class="source-link" href="${sourceLink(current.source)}" target="_blank" rel="noreferrer">打开当前源模型 ↗</a>
    ${previous ? `<a class="source-link" href="${sourceLink(previous.source)}" target="_blank" rel="noreferrer">打开先前模型 ↗</a>` : ''}
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
const rim = new THREE.DirectionalLight(0x9fd21b, 2.0); rim.position.set(-35, 10, -25); scene.add(rim);

const modelRoot = new THREE.Group();
scene.add(modelRoot);
const loadedObjects = new Map();
const pickables = [];
const gltfLoader = new GLTFLoader();
const stlLoader = new STLLoader();
let selectedPartId = 'dispenser';
let activeFilter = 'all';
let explodedAmount = .74;
let occtPromise = null;

const groupZ = { shell:-2, frame:1, dispensing:0, interface:2, foundation:-1 };
const materialBase = {
  shell: 0xb7c5bc,
  frame: 0x779286,
  dispensing: 0x9fd21b,
  interface: 0x86bdc7,
  foundation: 0xc3a97d
};

function meshMaterial(part, selected=false) {
  const color = selected ? 0xd5ff4b : materialBase[part.group];
  return new THREE.MeshStandardMaterial({ color, roughness:.58, metalness:.08, transparent:true, opacity: activeFilter === 'all' || activeFilter === part.group ? 1 : .08 });
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

function layoutSizeOf(part) {
  const size = realSizeOf(part);
  const count = Math.max(1, part.qty || 1);
  if (count === 1) return size;
  return new THREE.Vector3(size.x * count + COPY_GAP * (count - 1), size.y, size.z);
}

function withQuantityCopies(object, part) {
  const count = Math.max(1, part.qty || 1);
  if (count === 1) return object;
  const size = object.userData.realSize;
  const holder = new THREE.Group();
  holder.name = part.id;
  holder.userData.realSize = size;
  const total = size.x * count + COPY_GAP * (count - 1);
  let x = -total / 2 + size.x / 2;
  for (let index = 0; index < count; index += 1) {
    const copy = index === 0 ? object : object.clone(true);
    copy.position.set(x, 0, 0);
    copy.rotation.set(0, 0, 0);
    copy.scale.set(1, 1, 1);
    holder.add(copy);
    x += size.x + COPY_GAP;
  }
  return holder;
}

function currentPartPosition(part) {
  const gap = THREE.MathUtils.lerp(0.012, 0.05, explodedAmount);
  const shellParts = manifest.parts.filter((item) => item.group === 'shell');
  const shellSizes = shellParts.map((item) => layoutSizeOf(item));
  const shellWidth = shellSizes.reduce((sum, size) => sum + size.x, 0) + gap * Math.max(shellParts.length - 1, 0);
  const shellHeight = Math.max(...shellSizes.map((size) => size.y), 0.001);

  if (part.group === 'shell') {
    let x = -shellWidth / 2;
    let partX = 0;
    let partY = 0;
    shellParts.forEach((item, index) => {
      const size = shellSizes[index];
      x += size.x / 2;
      if (item.id === part.id) {
        partX = x;
        partY = size.y / 2;
      }
      x += size.x / 2 + gap;
    });
    return new THREE.Vector3(partX, partY, 0);
  }

  const upperGroups = manifest.groups.filter((group) => group.id !== 'shell');
  const columns = upperGroups.map((group) => {
    const parts = manifest.parts.filter((item) => item.group === group.id);
    const sizes = parts.map((item) => layoutSizeOf(item));
    const width = Math.max(...sizes.map((size) => size.x), 0.001);
    return { id: group.id, parts, sizes, width };
  });
  const upperGap = THREE.MathUtils.lerp(0.02, 0.09, explodedAmount);
  const upperWidth = columns.reduce((sum, column) => sum + column.width, 0) + upperGap * Math.max(columns.length - 1, 0);
  let cursor = -upperWidth / 2;
  const groupX = new Map();
  for (const column of columns) {
    cursor += column.width / 2;
    groupX.set(column.id, cursor);
    cursor += column.width / 2 + upperGap;
  }
  const column = columns.find((item) => item.id === part.group);
  let y = shellHeight + THREE.MathUtils.lerp(0.04, 0.1, explodedAmount);
  let partY = y;
  column.parts.forEach((item, index) => {
    const size = column.sizes[index];
    y += size.y / 2;
    if (item.id === part.id) partY = y;
    y += size.y / 2 + gap;
  });
  const z = THREE.MathUtils.lerp(0, (groupZ[part.group] || 0) * 0.03, explodedAmount);
  return new THREE.Vector3(groupX.get(part.group) || 0, partY, z);
}

function updatePositions(immediate=false) {
  for (const part of manifest.parts) {
    const object = loadedObjects.get(part.id);
    if (!object) continue;
    object.userData.targetPosition = currentPartPosition(part);
    if (immediate) object.position.copy(object.userData.targetPosition);
  }
}

async function loadSource(part, model) {
  return model.format === 'step' ? loadStep(part, model) : loadStl(part, model);
}

async function loadPart(part) {
  const current = activeModel(part);
  let object;
  try {
    if (current.display) {
      try {
        object = await loadGlb(part, current);
      } catch (error) {
        console.warn(`GLB failed for ${part.name}, using source CAD`, error);
        object = await loadSource(part, current);
      }
    } else {
      object = await loadSource(part, current);
    }
  } catch (error) {
    console.warn(`Using proxy for ${part.name}`, error);
    object = makeProxy(part);
  }
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
      state.textContent = `${done}/${manifest.parts.length} 个展示模型已就绪`;
    }
  };
  await Promise.all([worker(),worker(),worker()]);
  document.getElementById('fallback-map').style.opacity = '0';
  state.textContent = `${manifest.parts.length} 个展示模型 · 真实比例`;
  updatePositions(true);
  fitAll();
  selectPart(selectedPartId,false);
}

function setObjectOpacity(object, opacity) {
  object.traverse((child) => {
    if (!child.isMesh || !child.material) return;
    child.material.transparent = true;
    child.material.opacity = opacity;
    child.material.depthWrite = opacity > .2;
  });
}
function recolorPart(partId) {
  for (const part of manifest.parts) {
    const object = loadedObjects.get(part.id); if (!object) continue;
    const dimmed = activeFilter !== 'all' && activeFilter !== part.group;
    const selected = part.id === partId;
    object.traverse((child) => {
      if (!child.isMesh) return;
      child.material.color.setHex(selected ? 0xd5ff4b : materialBase[part.group]);
      child.material.emissive?.setHex(selected ? 0x213000 : 0x000000);
    });
    setObjectOpacity(object, dimmed ? .07 : (selected ? 1 : .92));
  }
}

function selectPart(partId, focus=false) {
  selectedPartId = partId;
  renderInspector(partId);
  recolorPart(partId);
  if (focus) {
    const object = loadedObjects.get(partId);
    if (object) {
      const pos = object.position.clone();
      const size = layoutSizeOf(manifest.parts.find((item) => item.id === partId));
      const distance = Math.max(size.x, size.y, size.z, 0.04) * 2.8;
      controls.target.copy(pos);
      const direction = camera.position.clone().sub(pos);
      if (direction.lengthSq() < 1e-6) direction.set(0.2, 0.25, 1);
      camera.position.copy(pos.clone().add(direction.normalize().multiplyScalar(distance)));
    }
  }
}

function applyFilter(groupId) {
  activeFilter = groupId;
  document.querySelectorAll('.group-button').forEach((button) => button.classList.toggle('active',button.dataset.group === groupId));
  recolorPart(selectedPartId);
}

document.querySelectorAll('.group-button').forEach((button) => button.addEventListener('click',() => applyFilter(button.dataset.group)));

document.getElementById('explode-range').addEventListener('input',(event) => {
  explodedAmount = Number(event.target.value) / 100;
  updatePositions();
});

document.getElementById('reset-view').addEventListener('click', fitAll);
document.getElementById('fit-view').addEventListener('click',fitAll);

function fitAll() {
  const box = new THREE.Box3().setFromObject(modelRoot);
  if (box.isEmpty()) return;
  const size = new THREE.Vector3(); box.getSize(size);
  const center = new THREE.Vector3(); box.getCenter(center);
  const max = Math.max(size.x,size.y,size.z);
  const distance = max * 1.75;
  controls.target.copy(center);
  camera.position.set(center.x + distance * 0.18, center.y + distance * 0.28, center.z + distance);
  camera.lookAt(center); controls.update();
}

const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
canvas.addEventListener('pointerup',(event) => {
  if (Math.abs(event.movementX) > 3 || Math.abs(event.movementY) > 3) return;
  const rect = canvas.getBoundingClientRect();
  pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(pointer,camera);
  const hit = raycaster.intersectObjects(pickables,false).find((item) => item.object.visible);
  if (hit?.object?.userData?.partId) selectPart(hit.object.userData.partId,false);
});

function resize() {
  const rect = viewport.getBoundingClientRect();
  renderer.setSize(rect.width,rect.height,false);
  camera.aspect = rect.width / Math.max(rect.height,1); camera.updateProjectionMatrix();
}
window.addEventListener('resize',resize); resize();

function animate() {
  requestAnimationFrame(animate);
  for (const object of loadedObjects.values()) {
    if (!object.userData.targetPosition) continue;
    object.position.lerp(object.userData.targetPosition,.085);
  }
  controls.update();
  renderer.render(scene,camera);
}
animate();
renderInspector(selectedPartId);
loadAll().catch((error) => {
  console.error(error);
  document.getElementById('load-state').textContent = '三维运行环境不可用 · 零件板仍然可用';
});
