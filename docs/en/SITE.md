# Site guide

The site is an open design call for **Version One**: a vending machine in every Fab Lab, XIAO as the default vending product, a local catalog chosen by each lab, and reusable machine improvements shared openly. Seeed Studio backs the initiative. The sequence is **design together → publish Version One → open lab applications**. Supply arrangements, eligibility, and support details remain forthcoming.

Version Zero is the working reference, controlled by Wio Terminal. Its source files, photographs, and recordings provide evidence and material for the design call. Roadmap statuses describe the reference and the work ahead; they do not make Version One a released product.

## Published pages

GitHub Pages publishes `/docs`. The root page introduces the project and offers English or Chinese. Each locale contains the same pages, and language links switch to the corresponding page.

| Page | File | Purpose |
| --- | --- | --- |
| The idea | `index.html` | Open call, shared principles, design lanes, prototype, release path, questions |
| The workbench | `journey.html` | One workspace: four system tabs, the Version Zero model, and a single inspector |
| The network | `network.html` | Early lab interest, future network, directory map, reviewed records |
| Reference machine | `exploded.html` | Redirects to the Version Zero model on the workbench |
| Open-source notices | `open-source.html` | Library licenses, map attribution, upstream references |

The header uses the same identity, page order, language switch, and contribution action across pages. Its plus mark is a project symbol, not the Seeed Studio logo.

## Design and interaction files

The design direction is a classic workshop publication: warm paper, Seeed teal `#003A4A`, green `#8FC31F`, fine rules, real prototype imagery, and compact contribution cards. The working design notes are kept locally under `_archived/plans/` and are not part of the published site.

- `assets/css/site.css`: shared typography, colors, header, footer, responsive navigation, and companion-page presentation.
- `assets/css/initiative.css`: homepage editorial layouts and contribution components.
- `assets/js/initiative.js`: menu disclosure, homepage section navigation, recording selection, and sharing.
- `assets/css/pages.css`: network layouts and shared page notes.
- `assets/css/companions.css`: compact page layout shared by the workbench and the network.
- `assets/js/workbench.js`: system tabs, model focus, and the shared inspector.
- `assets/js/journey-upload.js`: the proposal dialog on the workbench.
- `assets/js/contribution-config.js`: public endpoint and Turnstile site key. Both start empty.
- `exploded.css` and `exploded.js`: the Version Zero viewer embedded in the workbench.
- `assets/css/section-nav.css` and `assets/js/section-nav.js`: section navigation kept for earlier viewer pages.

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

Review desktop and mobile layouts in both languages. Check the menu, contribution links, prototype recordings, share results, the four workbench systems, the embedded model, the upload dialog, map empty states, keyboard focus, and internal anchors.

## Content and submissions

Homepage narrative is in each locale's `index.html`. The workbench narrative is in `journey.html`. The network still reads each locale's `data/` files, and the workbench JSON remains validated even though the page no longer renders those modules. Keep `done`, `in_progress`, `needs_contributors`, and `planned` statuses tied to evidence. Proposed standards remain ideas or drafts until reviewed.

GitHub issue forms remain the contribution path, including reliability and deployment notes. When `contribution-config.js` has an endpoint and a Turnstile site key, the workbench can also open a draft pull request through `workers/contributions/`. That worker is deployed separately and does not change Version Zero. A GitHub account is required for issues. Registering interest is not an application or an allocation. Review submissions before publishing lab, machine, product, or availability records; do not invent installations, stock, prices, or support terms.

`replacements.js` appends versioned machine changes. Preserve the Version Zero baseline in `parts-manifest.js`, source CAD, and `data/models.json`. An alternative part is not automatically a newer revision.

`directory-labs.json` is refreshed from the public FabLabs.io `/api/labs` export without authentication. The English network page also offers country, capability, and activity filters, website links, a browser-local shortlist, CSV export, and lab-specific submission drafts. Program participation is separate from directory membership. Empty records are deliberate until submissions are reviewed. See [the directory update guide](FABLABS_DIRECTORY.md).

## Publishing and attribution

Preserve the existing GitHub Pages configuration and relative URLs, including the `/how-to-vend-almost-anything/` project subpath. The public directory refresh needs no credentials. Keep any credentials for other services out of the static site.

- Machine photographs, recordings, and CAD come from this repository.
- Seeed Studio name and colors follow the [branding kit](https://www.seeedstudio.com/blog/branding-kit/).
- The viewer uses Three.js and occt-import-js; the map uses Leaflet and OpenStreetMap tiles. Preserve upstream notices and © OpenStreetMap contributors.
- FabLabs.io attribution is retained in the directory snapshot. This is not an official Fab Foundation program.
- See [open-source notices](open-source.html) and [the license inventory](THIRD_PARTY_NOTICES.md) for details.

The website update leaves hardware, firmware, assembly guides, issue templates, data schemas, and deployment configuration unchanged.
