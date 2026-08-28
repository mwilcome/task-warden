# Project file schema (`*.tw.json`)

**Version:** `1.0.0` (exact match required)

## Shape

```json
{
  "version": "1.0.0",
  "id": "k7xm2p9q",
  "name": "string",
  "statuses": ["Todo", "In Progress", "Done"],
  "aiInstructions": "string",
  "tasks": [
    {
      "id": "t1",
      "title": "string (required, non-empty)",
      "description": "string",
      "status": "must be one of statuses",
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
| Project id | 8 lowercase characters (e.g. `k7xm2p9q`) |
| Task id | `t1`, `t2`, … next integer after the highest `tN` in that file (`t1` if none) |
| Timestamps | ISO-8601 UTC |
| Done column | Last entry in `statuses` (do not hard-code the name `"Done"`) |
| `closed` | Set when the task is in the last status; otherwise `null` |
| Edits | Update task `updated` on every change |
| Validation | Invalid files are rejected; the app does not repair them. Extra keys are ignored |
| `aiInstructions` | Required on every file; the app does not change this string after create |

## Defaults for a new project

- `name`: `"Untitled Project"`
- `statuses`: `["Todo", "In Progress", "Done"]`
- `tasks`: `[]`
- `aiInstructions`: fixed text from `frontend/src/app/core/project/project.types.ts`

## Editing the file outside the app

Keep valid JSON. Do not add new top-level fields. Copy an existing id pattern; do not invent UUIDs. Prefer short task titles. Read `aiInstructions` on the file for the full edit rules the file expects.

Task Warden can **Download schema (.md)** from create-or-open or the Projects menu.
