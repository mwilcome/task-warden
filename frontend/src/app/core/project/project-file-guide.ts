import { AI_INSTRUCTIONS, SCHEMA_VERSION } from './project.types';

export const PROJECT_FILE_GUIDE_FILENAME = 'task-warden-project-file-guide.md';

export function buildProjectFileGuide(): string {
  return `# Task Warden project file guide

This file explains the Task Warden project format.

**What it is for:** hand this guide to a local AI (or any tool) so it can read and edit a \`.tw.json\` project file on your computer.

**File extension:** \`.tw.json\`  
**Schema version:** ${SCHEMA_VERSION} (must match exactly)

---

## How Task Warden uses the file

- One project = one \`.tw.json\` file on disk.
- The browser app opens that file, shows a board, and saves changes back to the same file.
- You can also edit the file outside the app. If the project is already open, use **Reload from Disk** in Task Warden after external edits.

---

## Full JSON shape

\`\`\`json
{
  "version": "${SCHEMA_VERSION}",
  "id": "uuid-v4",
  "name": "string",
  "owner": "string or null",
  "startDate": "ISO-8601 UTC or null",
  "endDate": "ISO-8601 UTC or null",
  "statuses": ["Todo", "In Progress", "Done"],
  "aiInstructions": "string",
  "tasks": [
    {
      "id": "uuid-v4",
      "title": "string (required, non-empty)",
      "description": "string",
      "points": "integer >= 0 or null",
      "status": "must be one of statuses",
      "assigned": "string or null",
      "created": "ISO-8601 UTC",
      "updated": "ISO-8601 UTC",
      "closed": "ISO-8601 UTC or null"
    }
  ]
}
\`\`\`

---

## Rules when editing

1. Keep **valid JSON**. Do not invent new top-level fields.
2. \`version\` must be exactly \`${SCHEMA_VERSION}\`.
3. Every \`id\` (project and tasks) must be a **UUID v4**. Generate a new one for every new task.
4. \`statuses\` is an ordered list of column names. The **last** status is the done column (do not hard-code the word "Done").
5. Each task \`status\` must match one entry in \`statuses\`.
6. On every task change, set \`updated\` to the current time in ISO-8601 UTC.
7. When a task moves into the **last** status, set \`closed\` to ISO-8601 UTC. When it leaves the last status, set \`closed\` to \`null\`.
8. \`points\` is an integer ≥ 0, or \`null\`.
9. Prefer short, clear task titles.
10. Leave \`aiInstructions\` as a string. New files embed a standard instructions block; you may leave it as-is.

---

## Instructions embedded in each project file

Every \`.tw.json\` includes an \`aiInstructions\` field. For new files created by Task Warden, that text is:

\`\`\`
${AI_INSTRUCTIONS}
\`\`\`

Follow that field on the specific file you are editing if it differs.

---

## Minimal valid example

\`\`\`json
{
  "version": "${SCHEMA_VERSION}",
  "id": "a1b2c3d4-e5f6-4789-a012-3456789abcde",
  "name": "Sample Project",
  "owner": null,
  "startDate": null,
  "endDate": null,
  "statuses": ["Todo", "In Progress", "Done"],
  "aiInstructions": "(see aiInstructions on a real project file)",
  "tasks": [
    {
      "id": "b2c3d4e5-f6a7-4890-b123-456789abcdef",
      "title": "Example task",
      "description": "",
      "points": 1,
      "status": "Todo",
      "assigned": null,
      "created": "2026-08-10T18:00:00.000Z",
      "updated": "2026-08-10T18:00:00.000Z",
      "closed": null
    }
  ]
}
\`\`\`

---

## After you edit

1. Save the \`.tw.json\` file.
2. In Task Warden, open the project (or press **Reload from Disk** if it is already open).
3. Invalid JSON or schema errors are rejected; the app will not silently repair the file.
`;
}

/** Blob download; works without File System Access. */
export function downloadProjectFileGuide(): void {
  const content = buildProjectFileGuide();
  const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = PROJECT_FILE_GUIDE_FILENAME;
  anchor.rel = 'noopener';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
