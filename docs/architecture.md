# Frontend architecture

How the Angular app is organized so you can find code and keep changes consistent.

## Layout

```text
frontend/src/
  styles.scss              all CSS lives here
  app/
    app.ts                 root shell (router only)
    app.config.ts
    app.routes.ts
    core/
      project/             project model, validation, session
      fs/                  File System Access, recents, in-browser cache, Safari download
    home/                  create-or-open, header, shell
    board/                 columns and cards
    task-panel/            title, body, confirm-delete
```

## Layers

| Layer | Location | Responsibility |
|-------|----------|----------------|
| Domain | `core/project/` pure modules | Types, validation, task/status ops (no DOM) |
| Application | services in `core/` | Session orchestration, save/open |
| Infrastructure | `core/fs/` | File System Access, recents, in-browser cache, upload/download |
| UI | feature folders | Templates and user events |

UI calls services. Services call domain helpers and `fs`. Domain code does not call the browser file API.

Recents store last few disk paths (File System Access handles) and browser-saved projects. Browser projects keep full JSON in IndexedDB (`ProjectCacheService`). Disk `.tw.json` is the source of truth when a file is open.

## Styling

- All styles: `frontend/src/styles.scss` only.
- No component `.scss` / `.css` files.
- Templates use global class names.
- Theme tokens are CSS variables on `:root`.

Angular CLI is set to `"style": "none"` so new components do not get style files.

## Related

- Schema: [schema.md](./schema.md)
- Run / build: [run-and-deploy.md](./run-and-deploy.md)
