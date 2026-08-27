# Run and deploy

## Requirements

- Node.js (current LTS is fine)
- npm
- **Chrome or Edge** to keep a `.tw.json` file open on disk (File System Access API)
- **Safari** can upload a file to open it and download to save (no on-disk handle)

## Install and run locally

```bash
cd frontend
npm install
npm start
```

Open the URL printed by the dev server (usually `http://localhost:4200`).

### Using the app

1. **New project** — Chrome/Edge saves a new `.tw.json` where you choose. Safari starts a board in memory; use **Download** to save.
2. **Open project** — Chrome/Edge picks an existing `.tw.json`. Safari uploads a file.
3. **Recent** — last few disk paths in this browser (Chrome/Edge handles).
4. **Reload** — replace the board with the open file on disk (disk projects only). If the file changed under you, choose **Reload** or **Overwrite**. There is no merge.
5. **Close** — leaves the board and returns to create-or-open.

Invalid files are rejected. The app does not repair them.

## Tests

```bash
cd frontend
npm test
```

## Production build

```bash
cd frontend
npm run build
```

Static files land in:

```text
frontend/dist/frontend/browser/
```

Serve that directory with any static host. The app is client-only; no API URL is required.

### Browser notes for a public host

- Chrome or Edge can keep the project file open on disk.
- Safari is upload + download only.
- First visit shows create-or-open until a file is created or opened. The empty board is blocked until then.
- The `.tw.json` file is the source of truth.
