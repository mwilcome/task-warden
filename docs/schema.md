# Project file schema (`*.tw.json`)

**Version:** `1.0.0` (exact match required)

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
| Done column | Last entry in `statuses` (do not hard-code the name `"Done"`) |
| `closed` | Set when the task is in the last status; otherwise `null` |
| Edits | Update task `updated` on every change |
| Points | Integer ≥ 0, or `null` |
| Validation | Invalid files are rejected; the app does not repair them |
| `aiInstructions` | Required on every file; the app does not change this string after create |

## Defaults for a new project

- `name`: `"Untitled Project"`
- `statuses`: `["Todo", "In Progress", "Done"]`
- `tasks`: `[]`
- `owner` / `startDate` / `endDate`: `null`
- `aiInstructions`: fixed text from `frontend/src/app/core/project/project.types.ts`

## Editing the file outside the app

Keep valid JSON. Do not add new top-level fields. Use a new UUID v4 for each new task. Prefer short task titles. Read `aiInstructions` on the file for the full edit rules the file expects.
