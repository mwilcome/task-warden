# Domain: Project

Bounded context for the `.tw.json` aggregate.

| Kind | Files |
|------|--------|
| Types / constants | `project.types.ts` |
| Factory | `create-empty-project.ts` |
| Validation | `validate-project.ts` |
| Tasks / statuses | `task-ops.ts`, `status-ops.ts`, `board-model.ts` |
| Identity | `uuid.ts` |
| Application session | `project-session.service.ts` |

Domain modules are pure TypeScript (no DOM / File System Access). Session orchestrates domain + `core/fs`. Schema reference: repo `docs/schema.md`.

Public API: `index.ts`.
