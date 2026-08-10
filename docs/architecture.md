# Frontend architecture

How the Angular app is structured. Layout mirrors **family-skill-tracker** (`frontend/src/app`): thin shell, `core/` for non-UI logic, feature folders for screens, global styles only.

## Domain-driven design

| Layer | Where | May know about |
|-------|--------|----------------|
| **Domain** | `app/core/{bounded-context}/` pure modules | Schema, invariants, factories — no Angular UI, DOM, or File System Access API |
| **Application** | Injectable services under `core/` | Domain + infrastructure |
| **Infrastructure** | `app/core/{tech}/` (e.g. `fs/`) | Browser APIs, serialization |
| **Presentation** | Feature folders | Templates, signals, application services |

**Bounded context:** `project` — the `.tw.json` aggregate (types, template, validation, task/status ops, session).

- Domain code is unit-testable without `TestBed` when possible.
- Components call domain/application APIs; they do not invent UUIDs or validate schema inline.
- File open/save is infrastructure (`core/fs`).

## Global styling only (SCSS)

| Do | Do not |
|----|--------|
| All styles in `frontend/src/styles.scss` (or partials imported only from that file) | Component/page `.scss` / `.css` |
| Global class names in templates | `styleUrl` / `styleUrls` / inline `styles` |
| Design tokens as CSS variables in `:root` | One-off hard-coded theme values in components |

CLI is configured with `"style": "none"` so new components do not get style files.

## Folder structure

```
frontend/src/
  styles.scss                 ← only style entry
  app/
    app.ts                    ← router-outlet only
    app.config.ts
    app.routes.ts
    core/
      project/                ← domain + ProjectSessionService
      fs/                     ← File System Access adapter
    home/                     ← landing + open session
    board/                    ← kanban columns + cards
    task-panel/               ← create / edit / delete
```

## Dependency direction

```
Presentation → Application → Domain
                 ↘ Infrastructure
```

## Related

- Schema: [schema.md](./schema.md)
- Run / overview: [README.md](../README.md)
