# Fab Lab Program V0 landing page

A dependency-free static landing page designed for the existing repository:

https://github.com/Seeed-Studio/how-to-vend-almost-anything

## Recommended deployment in the existing repo

1. Copy the page files into the repository's existing `docs/` directory: `index.html`, `site.css`, `exploded.html`, `exploded.css`, `exploded.js`, `parts-manifest.js`, `replacements.js`, and `.nojekyll`.
2. In GitHub, open **Settings -> Pages**.
3. Choose **Deploy from a branch**.
4. Select the `main` branch and the `/docs` folder.
5. Save. GitHub Pages will use `docs/index.html` as the landing page.

The pages intentionally use the existing repository's public raw images, videos, STL files, and STEP files, so there are no duplicated binary assets to manage.

For local testing, serve the folder over HTTP (ES modules do not reliably run from a `file://` URL):

```bash
python3 -m http.server 8000 --directory .
```

Then open `http://localhost:8000/` and `http://localhost:8000/exploded.html`.

## What this V0 page says

- The reference machine already exists and works.
- XIAO is the proposed default starting stock for the future Fab Lab program.
- Each lab can add locally relevant items.
- Reusable improvements should flow back into the open project.
- Fab Lab applications are **not open yet**.
- The exact Seeed-backed pilot package, eligibility, and supply terms are deferred until the application phase.

## Later changes

When applications open, replace the final `#apply` section with the real application entry point and update the roadmap states. Keep the evidence section tied to real repository artifacts rather than generic claims.

## Exploded product page

`exploded.html` is the versioned product view. It reads the current mechanical source list from `parts-manifest.js` and renders STL/STEP parts directly from this repository at runtime. The 3D view arranges parts by system group for clarity; it is not an assembly-coordinate drawing.

### Add a replacement without changing V0

Keep `parts-manifest.js` as the immutable V0 baseline. Add each new part file to the repository, then append one object to `replacements.js`:

```js
{
  partId: "dispenser",
  version: "V0.1",
  title: "Wide product dispenser",
  source: "replacements/v0.1/wide-dispenser.stl",
  format: "stl",
  date: "2026-10-20",
  note: "Adapts the column for a wider package."
}
```

The last replacement for a `partId` becomes current. Earlier revisions remain visible in the inspector and the V0 source stays untouched.

The page uses Three.js for STL display and `occt-import-js` for STEP parsing. Both are loaded from a CDN, so the deployed GitHub Page needs normal internet access to show the interactive 3D view. The versioned parts board remains readable even if the 3D runtime does not load.


## 3D display standard

The product page now contains the compact public version of the display rules. The detailed maintenance rules are in [`3D_DISPLAY_GUIDELINES.md`](3D_DISPLAY_GUIDELINES.md).

The key architecture is intentional:

- **Manufacturing source:** keep STEP/STL exact and versioned.
- **Web display derivative:** publish GLB for released parts/revisions when the site moves beyond V0.
- **Runtime:** keep Three.js for the custom exploded/selection experience.
- **Direct STEP parsing:** use `occt-import-js` as a source-view/fallback path, not as the long-term first-paint path for every CAD file.
- **Replacement history:** never overwrite V0; add revisions to `replacements.js`.

The repository should also keep [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md) with the deployed page because the interactive viewer uses open-source runtimes with different license obligations.
