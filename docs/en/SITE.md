# Site guide

The site is an open design call for **Version One**: a vending machine in every Fab Lab, XIAO as the default vending product, a local catalog chosen by each lab, and reusable machine improvements shared openly. Seeed Studio backs the initiative. The sequence is **design together → publish Version One → open lab applications**. Supply arrangements, eligibility, and support details remain forthcoming.

Version Zero is the working reference, controlled by Wio Terminal. Its source files, photographs, and recordings provide evidence and material for the design call. Roadmap statuses describe the reference and the work ahead; they do not make Version One a released product.

## Published pages

GitHub Pages publishes `/docs`. The root page introduces the project and offers English or Chinese. Each locale contains the same pages, and language links switch to the corresponding page.

| Page | File | Purpose |
| --- | --- | --- |
| The idea | `index.html` | Open call, shared principles, design lanes, prototype, release path, questions |
| The workbench | `journey.html` | Reference roadmap, implementation filters, parts, standards, contribution tasks |
| The network | `network.html` | Early lab interest, future network, directory map, reviewed records |
| Reference machine | `exploded.html` | Interactive Version Zero viewer and replacement guidance |
| Open-source notices | `open-source.html` | Library licenses, map attribution, upstream references |

The header uses the same identity, page order, language switch, and contribution action across pages. Its plus mark is a project symbol, not the Seeed Studio logo.

## Design and interaction files

The design direction is a classic workshop publication: warm paper, Seeed teal `#003A4A`, green `#8FC31F`, fine rules, real prototype imagery, and compact contribution cards. The working design notes are kept locally under `_archived/plans/` and are not part of the published site.

- `assets/css/site.css`: shared typography, colors, header, footer, responsive navigation, and companion-page presentation.
- `assets/css/initiative.css`: homepage editorial layouts and contribution components.
- `assets/js/initiative.js`: menu disclosure, homepage section navigation, recording selection, and sharing.
- `assets/css/pages.css`: data-driven workbench and network layouts.
- `exploded.css` and `exploded.js`: the reference-machine viewer.
- `assets/css/section-nav.css` and `assets/js/section-nav.js`: the viewer's section navigation.

Hero photography is `assets/reference-machine.jpg`. The prototype player uses the existing `real-operation-order-dispense` and `real-operation-balance-dispense` posters and recordings. Do not present an unbuilt concept as a real machine. Videos use native controls and do not autoplay. Respect reduced-motion preferences.

## Preview and validation

From the repository root:

```bash
python3 -m http.server 8000 --directory docs
```

Open `http://localhost:8000/`, then the English or Chinese pages. Serve over HTTP so roadmap and map JSON can load.

Check the existing data rules with:

```bash
node scripts/validate-site-data.mjs
```

Review desktop and mobile layouts in both languages. Check the menu, contribution links, prototype recordings, share results, workbench filters, map empty states, keyboard focus, and internal anchors.

## Content and submissions

Homepage narrative is in each locale's `index.html`. The workbench and network read each locale's `data/` files. Keep `done`, `in_progress`, `needs_contributors`, and `planned` statuses tied to evidence. Proposed standards remain ideas or drafts until reviewed.

Existing GitHub issue forms handle contributions and early lab interest. A GitHub account is required. Registering interest is not an application or an allocation. Review submissions before publishing lab, machine, product, or availability records; do not invent installations, stock, prices, or support terms.

`replacements.js` appends versioned machine changes. Preserve the Version Zero baseline in `parts-manifest.js`, source CAD, and `data/models.json`. An alternative part is not automatically a newer revision.

`directory-labs.json` is refreshed from FabLabs.io only when authentication is configured. Program participation is separate from directory membership. Empty records are deliberate until submissions are reviewed. See [the directory update guide](FABLABS_DIRECTORY.md).

## Publishing and attribution

Preserve the existing GitHub Pages configuration and relative URLs, including the `/how-to-vend-almost-anything/` project subpath. Do not put access tokens in the site; directory credentials belong in Actions secrets.

- Machine photographs, recordings, and CAD come from this repository.
- Seeed Studio name and colors follow the [branding kit](https://www.seeedstudio.com/blog/branding-kit/).
- The viewer uses Three.js and occt-import-js; the map uses Leaflet and OpenStreetMap tiles. Preserve upstream notices and © OpenStreetMap contributors.
- FabLabs.io attribution is retained in the directory snapshot. This is not an official Fab Foundation program.
- See [open-source notices](open-source.html) and [the license inventory](THIRD_PARTY_NOTICES.md) for details.

The website update leaves hardware, firmware, assembly guides, issue templates, data schemas, and deployment configuration unchanged.
