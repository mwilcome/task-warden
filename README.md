# Task Warden

Local-first, zero-account project tracker.

One project = one `.tw.json` file on your disk. Open the site, work immediately, auto-save locally. No sign-up. No cloud. A local AI can read and edit the same file.

## Run the app

**Chrome or Edge** required (File System Access API).

```bash
cd frontend
npm install
npm start
```

Open the URL from `ng serve` (usually `http://localhost:4200`).

- **New Project** — creates a `.tw.json` and prompts you to save it
- **Open Project** — pick an existing `.tw.json`
- Re-open the file after a browser refresh (handles are not restored)

Production build:

```bash
cd frontend
npm run build
```

## Repository layout

```
task-warden/
  frontend/     Angular app (the product)
  backend/      Java scaffold only — unused for now
  docs/         Architecture + schema reference
  examples/     Sample .tw.json
  README.md     This file
```

## Frontend structure

- **DDD:** domain in `frontend/src/app/core/{context}/`; screens as feature folders
- **Global SCSS only:** `frontend/src/styles.scss` — no component style files
- Details: [docs/architecture.md](./docs/architecture.md)

## Schema (`.tw.json`)

Version **1.0.0**. Full field reference: [docs/schema.md](./docs/schema.md).

Sample file: [examples/sample.tw.json](./examples/sample.tw.json).

## Backend scaffold

Optional empty Java 21 project (no app dependency):

```bash
cd backend
mvn compile
```

## License

Private / TBD.
