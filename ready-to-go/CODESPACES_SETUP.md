# GitHub Codespaces setup

This project is prepared to run the backend in GitHub Codespaces.

## Start backend

In Codespaces terminal:

```bash
cd backend-full
npm start
```

## Make port 3000 public

1. Open the **Ports** tab in Codespaces.
2. Find port **3000**.
3. Right-click the port row.
4. Set **Port Visibility** to **Public**.
5. Copy the forwarded URL.

The URL will look like:

```text
https://something-3000.app.github.dev
```

## Test

Open:

```text
https://YOUR-CODESPACE-URL/api/health
```

Expected response:

```json
{"ok":true,"service":"backend-center","time":"..."}
```

## Wio setting

Put the copied Codespaces URL into the Wio sketch:

```cpp
const char* BACKEND_BASE_URL = "https://YOUR-CODESPACE-URL";
```

Do not add a slash at the end.

## Important

The Codespaces URL only works while the Codespace is running. If the Codespace stops, the Wio cannot reach the backend.
