# Task Warden – Frontend Architecture

This document is **locked for MVP**. Product rules live in [`MVP.md`](../MVP.md); this file covers **how** the frontend is structured.

The frontend layout deliberately mirrors **family-skill-tracker** (`frontend/src/app`): thin app shell, `core/` for non-UI logic, feature folders for screens, global styles only.

---

## 1. Hard requirements

### 1.1 Domain-driven design (DDD)

| Layer | Where it lives | Allowed to know about |
|-------|----------------|------------------------|
| **Domain** | `app/core/{bounded-context}/` pure modules | Schema, invariants, factories — **no** Angular UI, **no** DOM, **no** File System Access API |
| **Application** | `app/core/...` injectable services that orchestrate use cases | Domain + infrastructure ports |
| **Infrastructure** | `app/core/{tech}/` adapters (e.g. future `core/fs/`) | Browser APIs, serialization |
| **Presentation** | Feature folders + `layout/` | Templates, signals, calling application services |

**Bounded context (MVP):** `project` — the single `.tw.json` aggregate (`TwProject`, tasks, statuses, validation, empty template).

Rules of thumb:

- Domain code is unit-testable without `TestBed` when possible.
- Components do not validate schema or invent UUIDs; they call domain/application APIs.
- File open/save is infrastructure, not domain.

### 1.2 Global styling only (SCSS)

| Do | Do not |
|----|--------|
| Put **all** styles in `frontend/src/styles.scss` (or SCSS partials **imported only** from that entry) | Add `*.component.scss` / `*.component.css` |
| Style via **global class names** in templates (`.btn`, `.card`, `.landing`, …) | Use `styleUrl` / `styleUrls` / inline `styles: []` on components |
| Share design tokens as CSS custom properties in `:root` | Duplicate one-off page styles in component files |

Angular CLI is configured with `"style": "none"` for components so new components do not get style files.

**Reference:** same pattern as family-skill-tracker (`styles.css` global + components with HTML/TS only). Task Warden uses **SCSS** as the single entry (`styles.scss`).

---

## 2. Folder structure (frontend)

```
frontend/src/
  index.html
  main.ts
  styles.scss                 ← only style entry (global)
  app/
    app.ts                    ← router-outlet only; no styles
    app.config.ts
    app.routes.ts
    app.spec.ts
    core/                     ← domain + application + infrastructure
      project/                ← Project bounded context (domain)
        project.types.ts
        create-empty-project.ts
        validate-project.ts
        uuid.ts
        index.ts
        *.spec.ts
        README.md
        project-session.service.ts   ← application: open/new/auto-save session
      fs/                     ← infrastructure: File System Access API
        project-file.repository.ts
        file-system-access.types.ts
        index.ts
    layout/                   ← chrome shells (when needed)
    home/                     ← feature: landing + open-session shell
      home.component.ts
      home.component.html
    board/                    ← feature: kanban board (columns + cards)
      board.component.ts
      board.component.html
    task-panel/               ← create / edit / delete task side panel
      task-panel.component.ts
      task-panel.component.html
    # …other features as screens, not as style silos
```

### Naming (match family-skill-tracker)

- Features: `feature-name/feature-name.component.ts` + `.html`
- Core services: `core/{area}/*.service.ts` or pure modules
- No per-feature style files

---

## 3. Dependency direction

```
Presentation (home, board, layout)
        │
        ▼
Application (session / use-case services)
        │
        ├──► Domain (project types, validation, factories)
        │
        └──► Infrastructure (File System Access, etc.)
```

- Presentation **must not** import infrastructure details if an application service can wrap them.
- Infrastructure **must not** import presentation.
- Domain **must not** import Angular or browser file APIs.

---

## 4. Styling conventions

1. Prefer utility/layout classes already in `styles.scss` (`.page`, `.container`, `.stack`, `.btn`, `.card`, `.alert`, …).
2. Add new **named** blocks for product UI (e.g. `.board`, `.task-card`) in `styles.scss`, not in the component file.
3. Use design tokens (`--color-*`, `--space-*`) instead of hard-coded values when practical.
4. Keep motion minimal (MVP Story M).

Optional later: split `styles.scss` into partials such as `_tokens.scss`, `_forms.scss` imported by the entry file only — still **no** component SCSS.

---

## 5. Testing

| Layer | How |
|-------|-----|
| Domain | Vitest unit tests next to pure modules (`*.spec.ts`) |
| Components | Light smoke tests; prefer domain tests for business rules |

---

## 6. Backend (out of MVP runtime)

`backend/` is Java scaffold only. When a server exists post-MVP, mirror DDD by **bounded context packages** (as in family-skill-tracker backend), not by technical layers alone. Frontend architecture above still applies to the SPA.

---

## 7. Related docs

- Product / stories: [`MVP.md`](../MVP.md)
- Schema / `aiInstructions`: MVP.md §3
- Repo overview: [`README.md`](../README.md)
