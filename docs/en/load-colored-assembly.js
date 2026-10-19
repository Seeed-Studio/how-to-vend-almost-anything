import { applyAssemblyPalette } from './assembly-palette.js';

// Load directly through GLTFLoader so CAD hierarchy and placements survive.
// Pass the existing loader and assemblyRoot from exploded.js.
const pending = new WeakMap();

export function loadColoredAssembly(gltfLoader, assemblyRoot, options = {}) {
  if (pending.has(assemblyRoot)) return pending.get(assemblyRoot);
  const url = options.url ?? new URL(
    './models/machine-assembly.glb?v=matched-colors-20261010',
    import.meta.url
  ).href;
  const promise = gltfLoader.loadAsync(url).then(({ scene }) => {
    const result = applyAssemblyPalette(scene);
    assemblyRoot.add(scene);
    assemblyRoot.updateMatrixWorld(true);
    return { scene, ...result };
  }).catch(error => {
    pending.delete(assemblyRoot);
    throw error;
  });
  pending.set(assemblyRoot, promise);
  return promise;
}
