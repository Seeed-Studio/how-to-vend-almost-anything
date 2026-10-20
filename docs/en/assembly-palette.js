// Shared colors for the Separate and Assemble views.
export const PALETTE = Object.freeze({
  shell: 0xe4ebe7,
  frame: 0x81968d,
  foundation: 0x81968d,
  storage: 0xbfcec3,
  dispensing: 0x9fd21b,
  interface: 0x397781
});
export const SELECTED_COLOR = 0xb6df62;
const clonedMeshes = new WeakSet();

export function partColor(part) {
  if (['led-holder', 'led-diffuser'].includes(part.id)) return PALETTE.shell;
  if (['xiao-series', 'xiao-esp32s3'].includes(part.id)) return PALETTE.interface;
  return PALETTE[part.group] ?? PALETTE.shell;
}

function tint(mesh, color, selected = false) {
  if (!clonedMeshes.has(mesh)) {
    mesh.material = Array.isArray(mesh.material)
      ? mesh.material.map(material => material.clone())
      : mesh.material.clone();
    clonedMeshes.add(mesh);
  }
  const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
  for (const material of materials) {
    material.color?.setHex(color);
    material.emissive?.setHex(selected ? 0x132000 : 0x000000);
  }
}

export function applySeparatePalette(object, part, selected = false) {
  object.traverse(mesh => {
    if (mesh.isMesh && mesh.material) {
      tint(mesh, selected ? SELECTED_COLOR : partColor(part), selected);
    }
  });
}

// machine-assembly.glb includes colorGroup tags generated from the actual STEP.
// No guesswork or manual matching of CAD names is needed for this file.
export function applyAssemblyPalette(root) {
  let colored = 0;
  const unmapped = [];
  root.traverse(mesh => {
    if (!mesh.isMesh || !mesh.material) return;
    let group;
    for (let node = mesh; node; node = node.parent) {
      if (Object.hasOwn(PALETTE, node.userData.colorGroup)) {
        group = node.userData.colorGroup;
        break;
      }
      if (node === root) break;
    }
    if (!group) { unmapped.push(mesh.name); return; }
    mesh.userData.assemblyGroup = group;
    tint(mesh, PALETTE[group]);
    colored++;
  });
  if (unmapped.length) console.warn('Assembly meshes without colorGroup:', unmapped);
  return { colored, unmapped };
}

export function applyAssemblyGroupFilter(root, groups, hiddenGroups) {
  const allow = groups && groups.size ? groups : null;
  const hide = hiddenGroups && hiddenGroups.size ? hiddenGroups : null;
  root.traverse(mesh => {
    if (!mesh.isMesh) return;
    const group = mesh.userData.assemblyGroup;
    const allowed = !allow || Boolean(group && allow.has(group));
    const blocked = Boolean(hide && group && hide.has(group));
    mesh.visible = allowed && !blocked;
  });
}
