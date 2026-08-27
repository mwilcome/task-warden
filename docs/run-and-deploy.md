# Run and deploy

## Requirements

- Node.js (current LTS is fine)
- npm
- **Chrome or Edge** to keep a `.tw.json` file open on disk (File System Access API)
- **Safari** can use **New browser project** (saved in this browser), or upload a file to open it and download to save

## Install and run locally

```bash
cd frontend
npm install
npm start
```

Open the URL printed by the dev server (usually `http://localhost:4200`).

### Using the app

1. **New project** — Chrome/Edge saves a new `.tw.json` where you choose. Safari starts a **New browser project**.
2. **New browser project** — saved in this browser (no disk file). **Download** writes a `.tw.json`.
3. **Open project** — Chrome/Edge picks an existing `.tw.json`. Safari uploads a file.
4. **Recent** — last few disk paths and browser-saved projects in this browser.
5. **Reload** — replace the board with the open file on disk (disk projects only). If the file changed under you, choose **Reload** or **Overwrite**. There is no merge.
6. **Close** — leaves the board and returns to create-or-open.

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
- Safari is New browser project plus upload + download.
- First visit shows create-or-open until a project is created or opened. The empty board is blocked until then.
- A disk `.tw.json` is the source of truth when a file is open. New browser project is saved in this browser.
