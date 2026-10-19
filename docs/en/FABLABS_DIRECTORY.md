# FabLabs.io directory and FAB action guide

Verified on **2026-10-10**. The [Network page](network.html#explore) uses a public FabLabs.io directory snapshot. A directory listing is not participation in this vending program or endorsement by the Fab Foundation.

## The API that works today

**Use [`GET https://www.fablabs.io/api/labs`](https://www.fablabs.io/api/labs).** It returned HTTP 200 and a top-level JSON array of 2,874 listings without an account, application, OAuth login, or access token. The current public controller returns the full approved directory in one response; pagination and search parameters are not implemented. Filter locally after fetching it once.

| Endpoint | Observed behavior | Use |
| --- | --- | --- |
| [`/api/labs`](https://www.fablabs.io/api/labs) | 200; full JSON array | Preferred source, including capabilities, activity status, and supplied links |
| [`/labs/mapdata`](https://www.fablabs.io/labs/mapdata) | 200; map-oriented array | Coordinates are rounded; website links are absent |
| [`/labs.json`](https://www.fablabs.io/labs.json) | Redirects to `/api/labs` | Use the destination directly |
| [`api.fablabs.io/0/labs`](https://api.fablabs.io/0/labs) | Compatibility route; 200 and matching ETag | Prefer the current route above |
| [`api.fablabs.io/labs`](https://api.fablabs.io/labs) | 404; endpoint removed | Do not use the previous sync path |
| [`/api/me`](https://www.fablabs.io/api/me) | 401 without authorization | Not a public directory resource |

The [old Swagger documentation](https://docs.fablabs.io/swagger/index.html) still describes OAuth, JSON:API, projects, machines, and write methods. It is a historical reference, not evidence that those methods work today. The old multi-resource API was removed in the [official January 2026 change](https://github.com/fablabbcn/fablabs.io/commit/9832b4ac13a08732ee35a60bf1d67ab17cd4bf00). The domain itself still serves the compatibility route above.

Current implementation sources: [public controller](https://github.com/fablabbcn/fablabs.io/blob/master/app/controllers/api/labs_controller.rb), [lab serializer](https://github.com/fablabbcn/fablabs.io/blob/master/app/serializers/lab_serializer.rb), and [routes](https://github.com/fablabbcn/fablabs.io/blob/master/config/routes.rb). The endpoint is live but has no published versioned stability guarantee.

## Fields and their practical meaning

| API fields | What we use them for | What they do not establish |
| --- | --- | --- |
| `id`, `slug`, `name` | Stable directory reference and official profile link | Project participation |
| `city`, `country_code`, `latitude`, `longitude` | Country search and map locations | Current opening hours or travel access |
| `links[].url` | Lab website links and additional public links | A primary or verified website: the feed does not label link types |
| `capabilities[]` | Find labs declaring printing, laser cutting, CNC milling, vinyl cutting, circuit production, or precision milling | Equipment availability, booking slots, production capacity, or certification |
| `activity_status` | Distinguish active, planned, closed, legacy `corona`, and unspecified records | A recent operating-status check |
| `parent_id`, `kind_name` | Possible future institution/group analysis | A commercial partnership or verified affiliation |

The public serializer also exposes descriptions, images, detailed addresses, phone numbers, and email addresses. This site's snapshot keeps only the directory fields needed for discovery; it does not copy phone numbers, emails, or detailed addresses. The API supplies no per-profile update timestamp. `updated_at` in our normalized records is the snapshot date, not the date the lab confirmed its details.

For website selection, the sync prefers the first supplied HTTP(S) link outside a list of common social platforms and FabLabs.io. Less common social sites or outdated links can still be selected. This is a heuristic. All valid supplied links remain available in the lab inspector; no website uptime check is implied. Unsafe URLs and embedded credentials are discarded.

## What the directory currently tells us

Analysis of the fetched **2026-10-10** response:

| Measure | Count |
| --- | ---: |
| Approved directory listings | 2,874 |
| Country/territory codes represented | 146 |
| Records with usable map coordinates | 2,639 |
| Records with at least one safe supplied HTTP(S) link | 2,343 |
| Records with a preferred website candidate | 2,094 |
| Records declaring at least one capability | 2,755 |
| Records listed as active | 2,009 |
| Records listed as closed | 102 |

**Inference:** the directory is already useful for discovering potential partners and planning regional projects. It is not a measurement of operating vending machines or demand. Country totals include inactive, planned, and unspecified listings, so activity filters matter. For example, the United States has 319 listings, France 296, Brazil 201, and Italy 195; these are directory counts, not pilot priorities or confirmed opportunities.

## Refreshing this site

1. Run `node --test scripts/fetch-fablabs-directory.test.mjs scripts/network.test.mjs`.
2. Run `node scripts/fetch-fablabs-directory.mjs` from the repository root.
3. Run `node scripts/validate-site-data.mjs` and review the resulting snapshot diff.

The [Refresh FabLabs directory workflow](../../.github/workflows/fablabs-directory.yml) does this daily at **03:15 UTC / 11:15 Asia/Shanghai** and on manual dispatch. The public refresh requires **no Actions secrets**. Old `FABLABS_ACCESS_TOKEN` and `FABLABS_API_BASE` secrets are no longer read by that workflow. A local `FABLABS_API_BASE` override is only for a confirmed HTTPS endpoint returning the same full-array schema.

The synchronizer:

- Fetches the public full directory once, with a timeout.
- Validates essential fields and rejects empty, unexpected, or duplicate-ID payloads before writing.
- Preserves absent coordinates as `null`, rather than inventing map points at zero.
- Forces every imported record to `participation_status: "directory"` and `verification_date: null`.
- Prepares both English and Chinese snapshots before replacing them; API/parse failures leave the last good snapshots unchanged.
- Skips a commit when directory content has not changed. `fetched_at` records when the committed snapshot was refreshed, not every daily check.

GitHub Pages reads [`data/directory-labs.json`](data/directory-labs.json). It does not call FabLabs.io from the browser. The map still works from the last snapshot if the provider is temporarily unavailable.

## FAB actions you can build

The following are proposed uses of the verified directory fields. The first group is implemented on the [Network page](network.html#fab-actions).

| Action | Data and workflow | Current support |
| --- | --- | --- |
| Find a fabrication partner | Country + declared capability + lab activity; check the supplied website | Filters and website links |
| Plan a workshop or regional visit | Shortlist labs, confirm access and interest with each lab, export your planning list | Browser-local shortlist and CSV export |
| Register your lab's early interest | Prefill lab name, location, profile, and website; add your needs before submitting | GitHub form draft |
| Report a real vending installation | Start from a shortlisted lab; supply version, date, photograph, and verification source | GitHub form draft; review still required |
| Share an open improvement | Attribute the lab, add CAD/source, compatibility, license, and test evidence | GitHub form draft and existing workbench |
| Improve directory quality | Identify a wrong record and provide evidence | Lab-specific correction draft; provider profile edits happen on FabLabs.io |

Useful next developments, with additional data required:

| Development | Practical FAB outcome | Additional source needed |
| --- | --- | --- |
| Regional XIAO learning-kit program | Find labs declaring circuit production, printing, or laser work; co-design a reproducible workshop | Lab consent, trainer availability, reviewed kit/BOM and learning materials |
| Shared fabrication/build request board | Route a case, dispenser, or product-module request to interested labs with relevant capabilities | Opt-in build requests, dimensions, materials, capacity, and test criteria |
| Lab-to-lab knowledge exchange | Pair a contributor with another lab trying the same design revision | Reviewed project tags, compatibility, language, and willingness to collaborate |
| Pilot readiness checklist | Track a candidate from interest to documented build and verified installation | Maintainer-reviewed program records, evidence, and published support terms |
| Network change digest | Highlight newly listed labs, declared capability changes, or missing websites | Previous snapshots; distinguish feed changes from verified real-world events |
| Nearest matching lab | Find candidates near a user-provided place | Explicit location input, distance calculation, and confirmation of access |
| Machine stock, uptime, or payments | Support installed vending machines | A separate operator backend, machine identity, telemetry, and reviewed permissions; these are not FabLabs.io directory API features |

A sensible first pilot is a **reproducible workshop/build pack**: pick a country and capability, shortlist a small set of labs, ask interested labs to choose one contribution, and publish a tested result another lab can build. Measure opted-in labs, completed tests, and reusable outputs in your own reviewed project records. Do not use directory size as the participation metric.

## Data use and review boundaries

[FabLabs.io's current terms](https://www.fablabs.io/tos), section 7, condition mass collection/use on keeping generated analysis datasets open and available on the platform, and require prior written approval for commercial use or solicitation. Public API access does not itself grant a blanket open-data license. Review those terms with the provider before a commercial campaign or broader redistribution; the repository's software license does not license the upstream directory data.

Shortlists stay in this browser and contain saved directory IDs. Export includes directory metadata, not contact lists. Draft links do not send messages or submit issues automatically.

Program records remain in `labs.json`, `machines.json`, `products.json`, and `updates.json`, edited after review. Directory activity and fabrication capabilities are separate from vending status:

| Marker | Meaning |
| --- | --- |
| Directory listing | Present in the public FabLabs.io snapshot |
| Interested | Reviewed register-interest submission |
| Pilot | Reviewed pilot installation |
| Verified machine | Reviewed active installation |
| New update | Verified program lab with an approved public update |
