# 站点说明

公开站点在 [`websites/`](../)。英文是 [`en/`](../en/)。中文是 [`ch/`](./)。两种语言各自有完整的页面、样式、脚本和 JSON。页眉里的语言链接会切到另一种语言的同一页。

GitHub Pages 发布本分支的 `/docs` 文件夹。那就是站点根目录：语言选择页、`en/` 和 `ch/`。仓库里的 `websites` 指向同一个文件夹。

## Pages

| Page | File | Role |
| --- | --- | --- |
| Vision | `index.html` | The idea, the reference machine, and what is only a proposal |
| Journey | `journey.html` | Roadmap, implementation modules, parts, standards, contributions |
| Network | `network.html` | Map, lab list, empty machine feed, GitHub issue submissions |
| Exploded machine | `exploded.html` | Deep page. Not in the primary navigation |
| Open-source notices | `open-source.html` | Runtime libraries and map data |

Primary navigation is Vision, Journey, Network. The section navigator appears on Vision and on the exploded machine page.

Shared chrome and color live in `assets/css/site.css` (Seeed Green `#8FC31F`, Seeed Blue `#003A4A`). Layouts that belong only to the live pages live in `assets/css/pages.css`. The exploded viewer keeps `exploded.css`, retokened to the same palette. The header plus mark is a project symbol, not the Seeed Studio logo.

## Local preview

From the `websites/` directory:

```bash
python3 -m http.server 8000
```

Open `http://localhost:8000/`, `journey.html`, `network.html`, and `exploded.html`. JSON fetch does not work from a `file://` URL.

From the repository root, check the data files:

```bash
node scripts/validate-site-data.mjs
```

## Deployment

1. Push the branch that contains `websites/`.
2. In GitHub, open Settings, then Pages.
3. Deploy from a branch and select the `/docs` folder.
4. Use relative paths. The site may be served from a project subpath such as `/how-to-vend-almost-anything/`.

Do not put access tokens in `websites/`. The FabLabs.io token belongs in an Actions secret. See [FABLABS_DIRECTORY.md](FABLABS_DIRECTORY.md).

## Editing content

Narrative copy for the Vision page is in `index.html`. Journey and Network read:

```text
websites/ch/data/roadmap.json
websites/ch/data/implementations.json
websites/ch/data/standards.json
websites/ch/data/models.json
websites/ch/data/labs.json
websites/ch/data/machines.json
websites/ch/data/products.json
websites/ch/data/updates.json
websites/ch/data/directory-labs.json
```

`directory-labs.json` is the only file the daily Action may rewrite. Program files change when a maintainer reviews a GitHub issue and edits them. `websites/en/replacements.js` is the exploded view’s replacement list. Append to it. Do not delete Version Zero entries from `websites/en/parts-manifest.js` or from `models.json`.

An alternative part, such as `dispenser-specific`, is not a newer revision of another part.

Statuses are `done`, `in_progress`, `needs_contributors`, and `planned`. A `done` record needs an evidence URL. A standard may not be marked `accepted` without evidence. The validator enforces this.

## Submissions

Issue forms live in `.github/ISSUE_TEMPLATE/`. They open on the repository’s default branch after this work is merged. 网络 page links to them. There is no form on the static site that pretends to save data.

## Attribution

- Seeed Studio name and colors follow the [branding kit](https://www.seeedstudio.com/blog/branding-kit/). The header plus mark is a project symbol. This site does not redraw the logo.
- Machine photographs, videos, and CAD are from this repository.
- The exploded view loads Three.js and occt-import-js from a CDN. See [open-source.html](open-source.html) and [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
- The map uses Leaflet and OpenStreet地图瓦片。© OpenStreetMap 贡献者。
- FabLabs.io is the directory source, used only through the reviewed snapshot described above.

## Checklist

Complete in this site:

- Three-page navigation, shared header and footer, and the Vision section navigator.
- Vision narrative with the photographed reference machine, both dispense recordings, and the Wio Terminal called out as the controller.
- Data-driven Journey timeline, filters, part list, standards at maturity Idea, and contribution cards.
- Exploded viewer kept as a deep page.
- Network map, list, filters, and an empty state for machines, products, and updates.
- GitHub Issue Forms and a documented review path.
- JSON schema check and a FabLabs.io Action that waits for a human token.

Placeholders, deliberately empty:

- `labs.json`, `machines.json`, `products.json`, and `updates.json`.
- `directory-labs.json` until `FABLABS_ACCESS_TOKEN` is set and a fetch succeeds.
- No XIAO stock, prices, pilot labs, or accepted standards.

Needs a later operational step:

- A person completes FabLabs.io OAuth and stores the token.
- A maintainer reviews issues before publishing a lab, machine, photo, or stock date.
- Seeed supply terms, eligibility, and any subsidy or marketing commitment, none of which are confirmed.
- A real backend or CMS if submissions should stop going through GitHub issues.
- Official Seeed logo files, if the branding kit is later added under `websites/en/assets/brand/` without redrawing the mark.

Hardware, firmware, and the assembly guide were not changed.

`_archived/` at the repository root is listed in `.gitignore` and is not part of the published site. It holds the local copies of:

- the stylesheets this restyle replaced (`site-css-before-seeed-restyle/`)
- the Seeed-styled template folder after its visual system was applied to `docs/`
- the five framework notes (`01` through `05`, plus the old framework index)

Those notes are no longer linked from the public pages or the repository README. Hardware, firmware, the assembly guide, the JSON data files, the issue forms, and the FabLabs directory workflow stay in the repository.
