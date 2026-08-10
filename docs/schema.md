# Task Warden file schema (`*.tw.json`)

**Version:** `1.0.0` (must match exactly)

## Shape

```json
{
  "version": "1.0.0",
  "id": "uuid-v4",
  "name": "string",
  "owner": "string | null",
  "startDate": "ISO-8601 UTC | null",
  "endDate": "ISO-8601 UTC | null",
  "statuses": ["Todo", "In Progress", "Done"],
  "aiInstructions": "string",
  "tasks": [
    {
      "id": "uuid-v4",
      "title": "string (required, non-empty)",
      "description": "string",
      "points": "integer ≥ 0 | null",
      "status": "must be one of statuses",
      "assigned": "string | null",
      "created": "ISO-8601 UTC",
      "updated": "ISO-8601 UTC",
      "closed": "ISO-8601 UTC | null"
    }
  ]
}
```

## Rules

| Topic | Rule |
|-------|------|
| IDs | UUID v4 |
| Timestamps | ISO-8601 UTC |
| Done column | **Last** entry in `statuses` — never hard-code `"Done"` |
| `closed` | Set when task status is the last status; `null` otherwise |
| Edits | Always refresh task `updated` |
| Points | Integer ≥ 0 or `null` |
| Validation | Fail closed — invalid files are rejected, not repaired |
| `aiInstructions` | Present on every file; the app does not rewrite it after create |

## Defaults (new project)

- `name`: `"Untitled Project"`
- `statuses`: `["Todo", "In Progress", "Done"]`
- `tasks`: `[]`
- `owner` / `startDate` / `endDate`: `null`
- `aiInstructions`: locked string defined in `frontend/src/app/core/project/project.types.ts`

## For AI tools

Read `aiInstructions` on the file, keep valid JSON, do not invent top-level fields, generate a new UUID v4 for every new task, and prefer short task titles.
