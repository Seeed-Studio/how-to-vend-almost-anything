import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { STLLoader } from 'three/addons/loaders/STLLoader.js';

const manifest = window.VENDING_PARTS;
const replacements = Array.isArray(window.VENDING_REPLACEMENTS) ? window.VENDING_REPLACEMENTS : [];
const repoRaw = 'https://raw.githubusercontent.com/Seeed-Studio/how-to-vend-almost-anything/main/';
const repoBlob = 'https://github.com/Seeed-Studio/how-to-vend-almost-anything/blob/main/';
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
document.getElementById('part-count').textContent = manifest.parts.length;

// --- Render navigation and static parts board first. The page stays useful even if WebGL/CDN loading fails.
const groupButtons = document.getElementById('group-buttons');
manifest.groups.forEach((group, index) => {
  const count = manifest.parts.filter((p) => p.group === group.id).length;
  const button = document.createElement('button');
  button.className = 'group-button';
  button.dataset.group = group.id;
  button.innerHTML = `<span>${String(index + 1).padStart(2,'0')}</span><strong>${group.name}</strong><small>${count} modeled parts</small>`;
  groupButtons.appendChild(button);
});

const partsGroups = document.getElementById('parts-groups');
manifest.groups.forEach((group) => {
  const wrap = document.createElement('section');
  wrap.className = 'part-group';
  const items = manifest.parts.filter((p) => p.group === group.id);
  wrap.innerHTML = `<div class="part-group-heading"><strong>${group.name} · ${String(items.length).padStart(2,'0')}</strong><p>${group.description}</p></div><div class="part-grid"></div>`;
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

const inspector = document.getElementById('inspector-content');
function renderInspector(partId) {
  const index = manifest.parts.findIndex((p) => p.id === partId);
  const part = manifest.parts[index] || manifest.parts[0];
  const current = activeModel(part);
  const previous = previousModel(part);
  const revisions = replacementMap.get(part.id) || [];
  const group = groupById.get(part.group);
  inspector.innerHTML = `
    <div class="part-index">${String(index + 1).padStart(2,'0')} / ${current.version || 'V0'}</div>
    <h2>${current.title || part.name}</h2>
    <p class="part-role">${current.note || part.role}</p>
    <div class="part-facts">
      <div><span>GROUP</span><strong>${group.name}</strong></div>
      <div><span>QTY</span><strong>${part.variantOf ? 'ALT ' : ''}×${part.qty}</strong></div>
      <div><span>FORMAT</span><strong>${(current.format || part.format).toUpperCase()}</strong></div>
    </div>
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
const camera = new THREE.PerspectiveCamera(36, 1, 0.1, 1000);
camera.position.set(0, 25, 78);
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.dampingFactor = .06;
controls.target.set(0, 0, 0);
controls.minDistance = 28;
controls.maxDistance = 180;

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

const groupCenters = {
  shell: -28,
  frame: -13,
  dispensing: 2,
  interface: 18,
  foundation: 31
};
const groupCompact = {
  shell: -8,
  frame: -4,
  dispensing: 0,
  interface: 4,
  foundation: 8
};
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

function normalizeObject(object, target=5.4) {
  const box = new THREE.Box3().setFromObject(object);
  const size = new THREE.Vector3(); box.getSize(size);
  const center = new THREE.Vector3(); box.getCenter(center);
  const max = Math.max(size.x,size.y,size.z) || 1;
  object.position.sub(center);
  const scale = target / max;
  object.scale.setScalar(scale);
}

function makeProxy(part) {
  const shapes = {
    'outer-enclosure':[5.0,7.2,4.3], 'top-plate':[5.2,.6,3.2], 'back-plate':[4.8,6.2,.45],
    'lock-holder':[2.2,1.2,1.3], 'mag-plate':[2.6,.5,1.5]
  };
  const dims = shapes[part.id] || [3,3,3];
  const geo = new THREE.BoxGeometry(...dims);
  const mesh = new THREE.Mesh(geo, meshMaterial(part));
  const edges = new THREE.LineSegments(new THREE.EdgesGeometry(geo), new THREE.LineBasicMaterial({color:0xe5eee9,transparent:true,opacity:.22}));
  const group = new THREE.Group(); group.add(mesh,edges); group.userData.proxy = true;
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
  normalizeObject(group, 6.3);
  return group;
}

function fitBakedGeometry(object, target) {
  object.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(object);
  const size = new THREE.Vector3();
  const center = new THREE.Vector3();
  box.getSize(size);
  box.getCenter(center);
  const scale = target / (Math.max(size.x, size.y, size.z) || 1);
  object.traverse((child) => {
    if (!child.isMesh) return;
    const geometry = child.geometry.clone();
    geometry.applyMatrix4(child.matrixWorld);
    geometry.translate(-center.x, -center.y, -center.z);
    geometry.scale(scale, scale, scale);
    child.geometry = geometry;
  });
  object.traverse((child) => {
    child.position.set(0, 0, 0);
    child.rotation.set(0, 0, 0);
    child.scale.set(1, 1, 1);
    child.updateMatrix();
  });
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
  fitBakedGeometry(object, part.format === 'step' ? 6.3 : 5.5);
  return object;
}

async function loadStl(part, model) {
  const geometry = await stlLoader.loadAsync(resolvePath(model.source));
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.center();
  const mesh = new THREE.Mesh(geometry, meshMaterial(part));
  normalizeObject(mesh, 5.5);
  return mesh;
}

function currentPartPosition(part) {
  const sameGroup = manifest.parts.filter((p) => p.group === part.group);
  const index = sameGroup.findIndex((p) => p.id === part.id);
  const count = sameGroup.length;
  const expandedX = groupCenters[part.group];
  const compactX = groupCompact[part.group];
  const x = THREE.MathUtils.lerp(compactX, expandedX, explodedAmount);
  const expandedY = (index - (count - 1) / 2) * 7.2;
  const compactY = (index - (count - 1) / 2) * 2.0;
  const y = THREE.MathUtils.lerp(compactY, expandedY, explodedAmount);
  const z = THREE.MathUtils.lerp(0, groupZ[part.group] * 3 + (index % 2 ? 2.2 : -1.4), explodedAmount);
  return new THREE.Vector3(x,y,z);
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
      state.textContent = `${done}/${manifest.parts.length} display models ready`;
    }
  };
  await Promise.all([worker(),worker(),worker()]);
  document.getElementById('fallback-map').style.opacity = '0';
  state.textContent = `${manifest.parts.length} display models · V0`;
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
      controls.target.lerp(pos,.75);
      const direction = camera.position.clone().sub(controls.target).normalize();
      camera.position.copy(pos.clone().add(direction.multiplyScalar(34)));
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

document.getElementById('reset-view').addEventListener('click',() => {
  camera.position.set(0,25,78); controls.target.set(0,0,0); controls.update();
});
document.getElementById('fit-view').addEventListener('click',fitAll);

function fitAll() {
  const box = new THREE.Box3().setFromObject(modelRoot);
  if (box.isEmpty()) return;
  const size = new THREE.Vector3(); box.getSize(size);
  const center = new THREE.Vector3(); box.getCenter(center);
  const max = Math.max(size.x,size.y,size.z);
  controls.target.copy(center);
  camera.position.set(center.x, center.y + max * .3, center.z + Math.max(62,max * 1.15));
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
  document.getElementById('load-state').textContent = '3D runtime unavailable · parts board remains available';
});
