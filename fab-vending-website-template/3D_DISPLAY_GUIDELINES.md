# 3D Product Display Guidelines

These rules define how the **How to Vend Almost Anything** machine and all future replacement parts should appear on the public product page.

The goal is not to imitate a desktop CAD application. The goal is to make a real, traceable engineering product easy to understand, compare and improve.

## 1. Two representations, one product

Every released physical part may have two representations:

1. **Manufacturing source** — STEP/STL. This is the authoritative geometry used for fabrication and engineering.
2. **Web display derivative** — GLB. This is generated from the released source for fast browser display.

The GLB is never allowed to become the only source. If the display derivative and source CAD disagree, the source CAD wins.

## 2. Coordinate and naming contract

For web derivatives, follow glTF conventions:

- right-handed coordinate system
- +Y up
- +Z forward
- meters for linear units
- the front of the part/machine faces +Z

Each web model should keep a stable node/part name matching the product manifest `partId` whenever possible. Do not name released nodes `Cube.001`, `Object`, `final-final`, or other tool-generated names.

Recommended asset name:

`{partId}__{version}.glb`

Example:

`dispenser__v0.2.glb`

## 3. Default camera

- Start in a three-quarter view with a small amount of top visibility.
- The initial view must make the silhouette understandable before the user touches the model.
- Do not auto-rotate continuously.
- Allow orbit, zoom, fit-all and reset.
- Avoid extreme perspective. Product-display perspective should feel closer to industrial photography than a game camera.
- When focusing a part, move the camera only as much as needed to keep context.

## 4. Material and lighting style

The public page uses a restrained engineering material system.

- Matte materials by default.
- Low metalness unless the part is materially metallic and that distinction matters.
- Moderate roughness to keep surfaces readable.
- One soft key light, one fill/hemisphere source and one restrained rim light are enough.
- Do not add decorative neon lighting, reflections or fake textures that imply materials not present in the source product.
- Ambient occlusion/shadows may help depth but must not hide small geometry.

### State colors

- **Current selected part:** bright lime focus.
- **Released/current but not selected:** neutral group material.
- **V0 baseline:** neutral engineering material.
- **Previous revision:** ghosted/lower opacity when compared.
- **Proposed/unreleased:** outline/dashed treatment and explicit `PROPOSED` label.

Never use color alone to indicate released status. Always pair it with a text label.

## 5. Exploded view

The exploded view is an explanation layer, not an assembly-coordinate claim.

- Parts in one subsystem should move along a consistent direction.
- Preserve relative order inside a group.
- Do not explode a part to a visually convenient place if it creates a false relationship.
- `0%` must always return the system to the compact view.
- The default public view may open around 65-75% exploded when this improves readability.
- The page must say when positions are arranged for clarity rather than taken from an assembly model.

## 6. Focus, isolate and ghosting

Clicking a part should do four things:

1. select it in the 3D scene;
2. highlight the matching part card/inspector;
3. show revision/source information;
4. keep enough neighboring geometry visible to understand where it belongs.

For interior components, prefer **ghosting the shell** to deleting it. A transparent outer enclosure preserves spatial context.

A future `Isolate` action may fully hide unrelated geometry, but isolation should be an explicit user action.

## 7. Replacement comparison

A replacement is a revision of a stable part identity.

Recommended compare modes:

- **Overlay:** V0/previous is ghosted; current is solid.
- **Side-by-side:** same camera and scale for both revisions.
- **Difference note:** human-written explanation of what changed and why.

Do not call a model `replacement`, `current` or `released` only because a newer file exists in a folder. Release state must come from revision metadata.

## 8. Labels and annotations

Show compact engineering context:

- stable part ID
- human-readable name
- group/system
- quantity
- current revision
- source format
- release state

Use short leader labels or an inspector panel. Do not place paragraphs on top of the 3D object.

Annotations should describe **why the part matters**, not repeat its filename.

## 9. Model preparation

### Source

Keep original STEP/STL untouched after a release.

### Web derivative

For production delivery, generate GLB per part/revision. Use open tooling to:

- merge duplicate vertices/materials where safe;
- preserve important hard edges;
- calculate sane normals;
- remove unused data;
- quantize/compress geometry;
- limit texture size if textures are introduced later.

The final visual must still preserve holes, mating geometry and overall proportions that matter for understanding the part.

## 10. Performance budget

Treat the 3D scene as progressive content.

- HTML/text/parts metadata should render first.
- Show a poster/reference image while the scene loads.
- Lazy-load the full 3D runtime.
- Prefer optimized GLB on the public path.
- Avoid triangulating every STEP file with WASM during first paint once the project has many revisions.
- Load current revisions first; load old revisions only when Compare is opened.
- Do not load textures when a simple material communicates the same information.

A page must remain useful if WebGL/WASM does not load.

## 11. Mobile and accessibility

- Drag = orbit; pinch = zoom.
- Keep large touch targets for reset, fit, explode and part groups.
- Provide the same part/revision information as DOM text outside the canvas.
- Respect `prefers-reduced-motion`.
- Do not require hover.
- Keep a static poster and complete parts board as fallback.

## 12. Recommended open-source toolchain

| Layer | Tool | Recommended use |
| --- | --- | --- |
| Web scene | Three.js | Custom exploded view, selection, camera, comparison |
| CAD import | occt-import-js / OpenCascade.js | STEP/IGES/BREP import and triangulation |
| Multi-format inspection | Online 3D Viewer | Inspect source CAD and manually export glTF when useful |
| glTF processing | glTF Transform | Validate, deduplicate, optimize, compress and transform GLB |
| Mesh optimization | meshoptimizer / gltfpack | Geometry optimization and compact delivery |
| Simple embedded preview | `<model-viewer>` | Single-part viewer and possible AR entry point |
| Authoring/cleanup | Blender | Optional scene cleanup, staging, materials, GLB export |

For this project, Three.js remains the primary runtime because the page needs a custom exploded layout and revision interaction. `<model-viewer>` is better reserved for simple individual-part preview or future AR rather than replacing the custom system viewer.

## 13. Publish unit for every new revision

A released replacement should arrive as one coherent unit:

```text
replacements/
  v0.2/
    dispenser.step              # or .stl; source CAD
    dispenser__v0.2.glb         # web derivative
    dispenser__v0.2.webp        # optional poster
```

And one metadata record:

```js
{
  partId: "dispenser",
  version: "V0.2",
  title: "Wide product dispenser",
  source: "replacements/v0.2/dispenser.step",
  display: "replacements/v0.2/dispenser__v0.2.glb",
  poster: "replacements/v0.2/dispenser__v0.2.webp",
  date: "2026-10-20",
  status: "released",
  note: "Supports a wider package while keeping the mounting interface."
}
```

The current V0 code only requires `source`; `display`, `poster`, and `status` are the recommended next fields when the optimized-asset pipeline is added.

## 14. Final-page definition of done

The final public experience should provide all of the following:

- whole-machine product view;
- system-level explode control;
- click-to-inspect parts;
- current/previous revision comparison;
- explicit source CAD link;
- version timeline and human change note;
- build/BOM/firmware/software entry points;
- real-machine photo/video evidence;
- mobile/static fallback;
- performance-safe web derivatives;
- open-source attribution and license notices;
- clear distinction between released and proposed designs.
