# Task Warden – MVP Requirements

**Status:** Frozen for implementation  
**Target tag:** `MVP-1.0.0`  
**Schema version:** `1.0.0`

This document is the single source of truth for MVP. No other features are in scope until MVP is tagged and accepted.

---

## 1. Project intent

Task Warden is a **local-first, zero-account** project tracker.

- One project = one `.tw.json` file on the user’s disk.
- The file is designed so a **local AI** (Grok Build or similar) can read and edit it directly.
- Product goal: faster and simpler than Trello for personal work — open the site, work immediately, auto-save locally, no sign-up, minimal visual noise.

**MVP runtime:** 100% browser. Backend is scaffold only (no real endpoints, not used by the app).

---

## 2. Global rules

These apply to every story.

| Rule | Detail |
|------|--------|
| No accounts | No login, no cloud storage in MVP. |
| Local files only | Browser **File System Access API** only. |
| Auto-save | After every successful mutation, write the **entire** project object to the open file handle. |
| Save failure | Non-blocking persistent banner; keep in-memory state. Message: `Save failed – changes are only in memory. Try again or refresh.` |
| Timestamps | ISO-8601 **UTC**. |
| IDs | UUID **version 4**. |
| Status integrity | Every task `status` must match an entry in `statuses`. |
| Done definition | **Last** entry in `statuses` = done. **Never** hard-code the string `"Done"`. |
| `closed` field | Set to now when status becomes the last status; set to `null` when moved out of the last status. |
| `aiInstructions` | Must remain present and **unchanged by the app** (AI tools may update it later). |
| Points | Integer **≥ 0** or `null`. No negatives. No upper cap. |
| File handle | User must **re-open** the file every browser session. No IndexedDB / persistent handle restore. |
| Browsers | **Chrome / Edge only** for MVP. No Firefox/Safari support. |
| Validation | Fail closed. No sanitizing of bad files. |
| DDD | Frontend follows domain-driven design: domain pure in `core/{context}/`; presentation in feature folders. See [`docs/architecture.md`](./docs/architecture.md). |
| Global styles only | All UI styles in `frontend/src/styles.scss` (or partials imported from it). **No** component/page SCSS/CSS files; **no** `styleUrl` / `styleUrls`. |

---

## 3. Schema (v1.0.0)

### 3.1 Shape

```json
{
  "version": "1.0.0",
  "id": "uuid",
  "name": "string",
  "owner": "string | null",
  "startDate": "ISO string | null",
  "endDate": "ISO string | null",
  "statuses": ["Todo", "In Progress", "Done"],
  "aiInstructions": "string",
  "tasks": [
    {
      "id": "uuid",
      "title": "string (required, non-empty)",
      "description": "string",
      "points": "number | null",
      "status": "string (must exist in statuses)",
      "assigned": "string | null",
      "created": "ISO string",
      "updated": "ISO string",
      "closed": "ISO string | null"
    }
  ]
}
```

### 3.2 Field notes

| Field | Rules |
|-------|--------|
| `version` | Must be exactly `"1.0.0"`. Any other value → reject file. |
| `id` | Project UUID v4. |
| `name` | Project display name. New projects default to `"Untitled Project"`. |
| `owner` | Optional string or `null`. |
| `startDate` / `endDate` | Optional ISO UTC or `null`. |
| `statuses` | Ordered column names. Default: `["Todo", "In Progress", "Done"]`. Custom allowed. Order is display order. Last status = done. |
| `aiInstructions` | Exact fixed string below (app never mutates). |
| `tasks[].title` | Required, non-empty string. |
| `tasks[].points` | Integer ≥ 0, or `null`. |
| `tasks[].status` | Must be one of `statuses`. Orphan values → reject file. |
| `tasks[].created` / `updated` | ISO-8601 UTC. On every edit, always refresh `updated`. |
| `tasks[].closed` | ISO-8601 UTC when in last status; otherwise `null`. |

### 3.3 Exact `aiInstructions` text (locked)

The following string is frozen. New projects embed it verbatim. The app must not modify it after create.

```
Task Warden project file (local-first).
- statuses: ordered list of column names. Default ["Todo","In Progress","Done"]. Custom allowed.
- tasks: flat array. Each task has id (uuid v4), title (required non-empty string), description (string), points (number|null), status (must match one in statuses), assigned (string|null), created, updated, closed (ISO-8601 UTC, closed null until Done).
- When editing: always update the "updated" field. Set "closed" when status becomes the last status in the statuses array. Clear "closed" if moved out of the last status.
- Never invent new top-level fields. Keep the file valid JSON.
- id must be a valid UUID. Generate a new one for every new task.
- Prefer small, clear task titles.
```

Note: The phrase “until Done” in the AI-facing text means “until the last status in `statuses`,” not the literal string `"Done"`. App code follows the last-status rule only.

### 3.4 Validation (fail closed)

On open (and any parse of a user-selected file):

1. Parse as JSON. If invalid JSON → reject.
2. `version` must be exactly `"1.0.0"`.
3. Required top-level fields present with correct types: `version`, `id`, `name`, `owner`, `startDate`, `endDate`, `statuses`, `aiInstructions`, `tasks`.
4. `id` is a valid UUID; every `tasks[].id` is a valid UUID.
5. `statuses` is a non-empty array of strings.
6. Every `tasks[].status` exists in `statuses` (no orphans).
7. Every `tasks[].title` is a non-empty string.
8. Every `tasks[].points` is `null` or an integer ≥ 0.

On any failure: clear message **`Invalid Task Warden file`** (plus short reason when useful). Offer path to open another file or create new. **No sanitizing.**

### 3.5 New project template defaults

| Field | Default |
|-------|---------|
| `version` | `"1.0.0"` |
| `id` | new UUID v4 |
| `name` | `"Untitled Project"` |
| `owner` | `null` |
| `startDate` | `null` |
| `endDate` | `null` |
| `statuses` | `["Todo", "In Progress", "Done"]` |
| `aiInstructions` | exact locked string above |
| `tasks` | `[]` |

Timestamps for the project itself are not required beyond task `created`/`updated`/`closed`. Task timestamps are set when tasks are created/edited.

---

## 4. Architecture (MVP)

Full frontend architecture (DDD layers, folder map, styling rules): **[`docs/architecture.md`](./docs/architecture.md)**.

```
task-warden/
  frontend/          Angular — the entire MVP product
  backend/           Empty Java LTS scaffold only — no real endpoints
  docs/
    architecture.md  Frontend DDD + global SCSS conventions (locked)
  MVP.md             This document
  README.md          Philosophy + how to run + pointers
```

### 4.1 Monorepo roles

- **Frontend:** all UI, domain, template, validation, File System Access API I/O.
- **Backend:** compiles; unused by MVP.
- **AI integration:** out of process — AI reads/writes the same `.tw.json` on disk. No in-app AI chat in MVP.

### 4.2 Frontend layout (family-skill-tracker style)

Aligned with `family-skill-tracker/frontend`:

| Path | Role |
|------|------|
| `src/styles.scss` | **Only** style entry — global SCSS |
| `app/app.ts` | Thin shell (`router-outlet` only) |
| `app/core/{context}/` | Domain + application + infrastructure |
| `app/core/project/` | Project aggregate (schema, template, validation) |
| `app/layout/` | Shell chrome (when needed) |
| `app/{feature}/` | Screen components: `.ts` + `.html` only |

**Forbidden:** component/page style files; domain logic inside templates beyond display binding.

### 4.3 DDD dependency rule

```
Presentation → Application → Domain
                 ↘ Infrastructure
```

Domain has zero Angular UI / File System Access dependencies.

---


## 5. MVP stories (detailed)

### Story A – Monorepo scaffold

- Create root monorepo layout as above.
- `frontend/`: latest **Angular LTS**, blank app starts with `ng serve`.
- `backend/`: empty **Java LTS** project (Spring Boot or plain) that **compiles**; no real endpoints.
- Root `README.md`: local-first philosophy, Chrome/Edge, how to run frontend, link to `MVP.md` / schema.
- `docs/` exists for future API notes.

**Acceptance:** `ng serve` starts a blank Angular app; Java project compiles.

---

### Story B – Schema & template

- Hard-code schema types/constants and the locked `aiInstructions` string in the frontend.
- Provide a function that returns a brand-new valid project object (template defaults in §3.5).
- Provide a validator that implements §3.4 (used on open).

**Acceptance:** Creating a new project always produces a valid, loadable object; invalid fixtures fail validation as specified.

---

### Story C – File open / create / auto-save

- First visit (no file open): clean empty state with **Open Project** and **New Project**.
- **New Project:** template in memory → immediately prompt user to save a `.tw.json` (File System Access API). Keep the file handle.
- **Open Project:** user picks existing `.tw.json` → parse + validate → load into memory; keep file handle.
- After any successful mutation: write entire current object to the same file handle.
- Write failure: non-blocking banner (global rules); memory unchanged in intent (state remains; disk may lag).

**Acceptance:** User can create, open, and change data; disk matches memory after every successful save. Session refresh requires re-open.

---

### Story D – Board rendering

Once a file is loaded:

- Top bar: “Task Warden” + project name (editable per Story J) + project switcher **placeholder** (future, non-functional OK).
- One vertical column per `statuses` entry, **in array order**.
- Column header: status name + task count.
- Task cards under matching status.

**Acceptance:** Any valid `.tw.json` renders correct columns and cards.

---

### Story E – Task cards

- Card shows **title only** (large, readable).
- If `points` is a number, show a small badge with that number.
- No other fields on the card.
- Bottom of every column: **+ Add task**.

**Acceptance:** Board looks clean; cards show only title (+ optional points).

---

### Story F – Create task

- **+ Add task** opens minimal inline form or side panel.
- Required: title. Optional: description, points, assigned.
- On save:
  - new UUID v4
  - `status` = column’s status
  - `created` = `updated` = now (UTC)
  - `closed` = `null` unless column is last status, then set `closed` = now
  - push into `tasks`
  - auto-save

**Acceptance:** New task appears in the correct column and is persisted.

---

### Story G – Edit task

- Click card → edit panel/modal.
- Editable: title, description, points, assigned, status (dropdown = current `statuses`).
- On save:
  - always update `updated`
  - if status becomes last status → `closed` = now
  - if status leaves last status → `closed` = null
  - auto-save

**Acceptance:** Fields update correctly; file saved; closed logic follows last-status rule.

---

### Story H – Delete task

- Delete control inside edit panel.
- Confirm: “Delete this task?”
- On confirm: remove from `tasks`, auto-save.

**Acceptance:** Task gone from UI and file.

---

### Story I – Drag and drop

- Drag card between columns (desktop).
- On drop: update `status`, `updated`, apply same `closed` rules as Story G, auto-save.

**Acceptance:** Drag works on desktop; status and timestamps correct.

---

### Story J – Project name

- Header name is inline-editable.
- On blur or Enter: update `name`, auto-save.

**Acceptance:** Name changes persist.

---

### Story K – Custom statuses (basic)

- **Add** status: append to `statuses` (new empty column).
- **Rename** status: update string in `statuses` and every task with the old value.
- **Reorder** statuses: drag headers or up/down controls (array order = column order).
- **Delete** status: only if zero tasks in that status (or force-move tasks first — MVP: block delete if any tasks remain).
- Last status remains the done column after reorder.

**Acceptance:** Status changes never corrupt the file; no orphan statuses.

---

### Story L – Empty & error states

- No file open → landing with Open / New.
- Invalid JSON / wrong version / validation failure → **Invalid Task Warden file** (+ short reason); path to open another or create new.
- Save failure banner as in Story C.

**Acceptance:** App never crashes on bad files; user always has a way forward.

---

### Story M – Visual & interaction baseline

- Desktop-first, clean, modern — **not** a Trello clone.
- Fast perceived performance; no unnecessary animations.
- Keyboard: Enter to save, Escape to cancel (forms/panels).

**Acceptance:** Feels lightweight and immediate.

---

### Story N – MVP freeze

- Manual test checklist covering every story above.
- Confirm a local AI can open `.tw.json`, read `aiInstructions`, and successfully add/edit a task on disk.
- Tag commit `MVP-1.0.0`.

**Acceptance:** Checklist signed off; tag exists.

---

## 6. Out of scope (MVP)

Do not implement:

- User accounts, auth, multi-user sync
- Cloud storage / hosting of project files
- Firefox / Safari file workflows
- Persistent file handles across sessions
- Backend APIs or Java business logic
- AI chat UI inside the app
- Sanitizing or auto-repair of invalid files
- Project switcher (beyond a non-functional placeholder)
- Mobile-first polish, offline SW packaging, etc.

---

## 7. Work outline (complete in order)

Implement and accept one chunk before starting the next. Stories map 1:1 to chunks.

| Order | Chunk | Stories | Deliverable |
|-------|--------|---------|-------------|
| **1** | Scaffold | **A** | Monorepo: Angular LTS frontend, empty Java backend, README, `docs/`, this `MVP.md` linked |
| **2** | Data core | **B** | Schema types, locked `aiInstructions`, `createEmptyProject()`, `validateProject()` |
| **3** | File I/O | **C** | Open / New / auto-save / save-error banner; File System Access API |
| **4** | Board UI | **D, E** | Columns from `statuses`, cards (title + points), + Add task control |
| **5** | Task CRUD | **F, G, H** | Create, edit panel, delete + confirm; timestamps + closed rules |
| **6** | Move & name | **I, J** | Drag-and-drop between columns; inline project name |
| **7** | Statuses | **K** | Add / rename / reorder / delete (empty only) |
| **8** | Resilience & polish | **L, M** | Empty/error states; visual + keyboard baseline |
| **9** | Freeze | **N** | Manual checklist, AI file smoke test, tag `MVP-1.0.0` |

### Execution rule

```
Complete A → then B → then C → then (D+E) → then (F+G+H) → then (I+J) → then K → then (L+M) → then N
```

Do not skip ahead. After each chunk: verify acceptance criteria in this doc before the next chunk.

---

## 8. Manual test checklist (Story N)

**Freeze record:** [`docs/mvp-freeze.md`](./docs/mvp-freeze.md) (2026-08-10, tag `MVP-1.0.0`).

Automated: `cd frontend && npm test -- --watch=false` (includes AI smoke).  
Sample file: [`examples/sample.tw.json`](./examples/sample.tw.json).

- [x] New Project → save `.tw.json` → file has `version` `1.0.0`, locked `aiInstructions`, empty `tasks`
- [x] Open valid project → board matches file
- [x] Open invalid JSON → Invalid Task Warden file
- [x] Open wrong version → reject
- [x] Open file with orphan status → reject
- [x] Create task in each column → UUID, timestamps, auto-save
- [x] Edit all fields → `updated` changes; closed when last status
- [x] Move out of last status → `closed` null
- [x] Delete with confirm → removed from file
- [x] Drag between columns → status + timestamps + closed correct
- [x] Rename project → persisted
- [x] Add / rename / reorder statuses → columns and tasks consistent
- [x] Delete empty status OK; delete non-empty blocked
- [x] Save failure path (if simulable) → banner; memory kept
- [x] Refresh browser → must re-open file (no silent restore)
- [x] Chrome/Edge only documented; app usable there
- [x] Local AI can read `aiInstructions` and edit a task in the file successfully

---

## 9. Definition of done (MVP)

MVP is done when:

1. All stories A–N acceptance criteria pass. ✅
2. Checklist in §8 is complete. ✅ (see `docs/mvp-freeze.md`)
3. Repo tagged **`MVP-1.0.0`**. ✅
4. No intentional work on out-of-scope items has shipped as “required.” ✅

---

*End of MVP requirements. Implement only what is written here.*
