# FabLabs.io directory snapshot

The Network page can show Fab Labs from [FabLabs.io](https://www.fablabs.io/). A directory listing is not participation in this vending program, and it is not an endorsement by the Fab Foundation.

GitHub Pages only reads [`docs/en/data/directory-labs.json`](data/directory-labs.json) and the Chinese copy at `docs/ch/data/directory-labs.json`. It does not call the API, and it must not contain an access token.

## What a person has to do

1. Create a FabLabs.io account.
2. Open the [developer guide](https://docs.fablabs.io/) and register an application in the Developer Console. That console is available after you log in, from the account menu.
3. Confirm the live API base URL. The guide still shows `https://api.fablabs.io`, and that host currently says the legacy API was removed. Put the confirmed base in the Actions secret `FABLABS_API_BASE` if it is not `https://api.fablabs.io`.
4. Complete the OAuth authorization-code login once. The guide describes the application id, shared secret, redirect, authorization code, and access token. Optional refresh tokens are mentioned, but this repository does not guess a token URL.
5. In the GitHub repository, add the access token as the Actions secret `FABLABS_ACCESS_TOKEN`. Never commit the token, the client secret, or a refresh token.
6. Run the **Refresh FabLabs directory** workflow, or wait for the daily run.
7. When the access token expires, repeat the login and replace the secret. A failing workflow means the snapshot was left unchanged.
8. Review the snapshot before treating any lab as a vending participant. Program records belong in `labs.json`, `machines.json`, `products.json`, and `updates.json`, edited by a person after an issue review.

## What the code does

The workflow [`.github/workflows/fablabs-directory.yml`](../.github/workflows/fablabs-directory.yml) runs every day at 03:15 UTC and when someone starts it by hand.

- If `FABLABS_ACCESS_TOKEN` is missing, `scripts/fetch-fablabs-directory.mjs` exits successfully and does not change the JSON file. The map explains that it is waiting for a token.
- If the token is present, the script calls `GET /labs/map` and pages through `GET /labs` with `Authorization: Bearer`.
- It keeps only directory fields, forces `participation_status` to `directory`, and writes `docs/en/data/directory-labs.json` and `docs/ch/data/directory-labs.json`.
- It does not write `labs.json`, `machines.json`, `products.json`, or `updates.json`.
- `scripts/validate-site-data.mjs` then checks the data. A directory lab with any other participation status fails the check.
- If labs were parsed and the file changed, the workflow commits that file as `github-actions[bot]`.
- If the API answers but no labs can be read, or the token is rejected, the script exits with an error and leaves the previous file in place.

## What GitHub Pages cannot do

Pages is a static host. It cannot complete an OAuth login, hide a client secret, or refresh the directory by itself. The browser map is a view of the last committed snapshot.

## Marker meanings

| Marker | Meaning |
| --- | --- |
| Directory listing | Present in the FabLabs.io snapshot only |
| Interested | A person reviewed a register-interest issue |
| Pilot | A person reviewed a pilot installation |
| Verified machine | A person reviewed an active installation |
| New update | A verified lab with an approved public update |

Do not copy directory labs into the program files just because they appear on the map.
