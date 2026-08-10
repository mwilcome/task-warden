# Domain: Project

Bounded context for the Task Warden **project aggregate** (the `.tw.json` file).

| Kind | Files |
|------|--------|
| Types / constants | `project.types.ts` |
| Factory | `create-empty-project.ts` |
| Invariants / validation | `validate-project.ts` |
| Identity | `uuid.ts` |
| Application session | `project-session.service.ts` (orchestrates domain + `core/fs`) |

**Rules**

- Domain modules (`project.types`, create, validate, uuid): pure TypeScript — no Angular DI, no DOM, no File System Access API.
- `ProjectSessionService` is the **application** layer: holds session state, calls domain + `ProjectFileRepository`.
- Presentation (`home/`) only talks to the session service.
- Schema and rules come from repo root `MVP.md`.

Public API: `index.ts`.
