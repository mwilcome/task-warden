# Run and deploy

## Requirements

- Node.js (current LTS is fine)
- npm
- **Chrome or Edge** to use the app (File System Access API)

## Install and run locally

```bash
cd frontend
npm install
npm start
```

Open the URL printed by the dev server (usually `http://localhost:4200`).

### Using the app

1. **New Project** (Chrome/Edge) saves a new `.tw.json` where you choose.
2. **Open Project** (Chrome/Edge) picks an existing `.tw.json`.
3. **Browser only** starts a project stored in this browser only (works on Safari / iPhone; no disk file).
4. **Last opened** / recents re-open a known project (file handle or browser cache).
5. **Reload from Disk** replaces the board with the open file on disk (disk always wins; disk projects only).
6. **Close** returns to the empty board and the start dialog.

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

Serve that directory with any static host (nginx, S3, GitHub Pages, etc.). The app is client-only; no API URL is required for the current build.

### Browser notes for a public host

- Users need Chrome or Edge for disk files.
- First visit shows the project-file dialog until they open or create a file.
- The browser may keep a local cache of the last project; that is optional convenience, not the source of truth. The `.tw.json` on disk is.

## Backend scaffold (optional)

Not required to run the product.

```bash
cd backend
mvn compile
```

Needs JDK 21+ and Maven 3.9+ if you touch it.
