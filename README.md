# Task Warden

**Local-first, zero-account project tracker.**

One project = one `.tw.json` file on your disk. Open the site, work immediately, auto-save locally. No sign-up. No cloud. Built so a local AI (Grok Build or similar) can read and edit the same file.

## Philosophy

- **Local-first** — your data never leaves your machine in MVP.
- **Zero friction** — no accounts, no onboarding maze.
- **AI-friendly** — stable `.tw.json` schema + embedded `aiInstructions`.
- **Simple board** — statuses as columns; tasks as cards.

Full MVP requirements (frozen): **[MVP.md](./MVP.md)**.

## Browser support (MVP)

| Browser | Supported |
|---------|-----------|
| Chrome  | Yes       |
| Edge    | Yes       |
| Firefox | No (MVP)  |
| Safari  | No (MVP)  |

MVP uses the **File System Access API** (Chrome / Edge).

## Repository layout

```
task-warden/
  frontend/     Angular 22 — the entire MVP product
  backend/      Java 21 scaffold only — unused by MVP
  docs/         Architecture + future API notes
  MVP.md        Frozen MVP requirements
  README.md     This file
```

### Frontend architecture (locked)

- **DDD:** domain in `frontend/src/app/core/{context}/`; screens as feature folders.
- **Global SCSS only:** `frontend/src/styles.scss` — no component style files.
- Folder shape matches **family-skill-tracker** frontend (`core/`, features, thin `app.ts`).

Details: **[docs/architecture.md](./docs/architecture.md)**.

## Prerequisites

- **Node.js** 22+ (or current LTS compatible with Angular 22)
- **npm** 11+
- **JDK 21** + **Maven 3.9+** (only if you build the backend scaffold)

## Run the frontend (the app)

```bash
cd frontend
npm install
npm start
```

Then open the URL printed by `ng serve` (usually `http://localhost:4200`).

Equivalent:

```bash
cd frontend
npx ng serve
```

## Build the frontend

```bash
cd frontend
npm run build
```

## Backend scaffold (not used by MVP)

The backend is an empty Java project so the monorepo is ready for a future API. **MVP runs 100% in the browser.**

```bash
cd backend
mvn compile
```

## Schema

Project files are JSON with extension `.tw.json`, schema version `1.0.0`.  
See [MVP.md §3](./MVP.md#3-schema-v100) for the exact shape, validation rules, and locked `aiInstructions` text.

## Work plan

MVP stories A–N are complete and frozen as tag **`MVP-1.0.0`**.  
Freeze record: [`docs/mvp-freeze.md`](./docs/mvp-freeze.md).

```
A → B → C → (D+E) → (F+G+H) → (I+J) → K → (L+M) → N  ✓
```

Sample project file: [`examples/sample.tw.json`](./examples/sample.tw.json).

## License

Private / TBD.
