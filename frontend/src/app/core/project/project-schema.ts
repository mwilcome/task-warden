import { AI_INSTRUCTIONS, SCHEMA_VERSION } from './project.types';

/** Suggested download name (shown in the browser save dialog). */
export const PROJECT_FILE_SCHEMA_FILENAME = 'task-warden-schema.md';

/**
 * Build the downloadable schema for the `.tw.json` project format.
 */
export function buildProjectSchema(): string {
  return `# Task Warden project file schema

This file explains the Task Warden project format.

**File extension:** \`.tw.json\`  
**Schema version:** ${SCHEMA_VERSION} (must match exactly)

---

## How Task Warden uses the file

- One project = one \`.tw.json\` file on disk.
- The browser app opens that file, shows a board, and saves changes back to the same file.
- You can also edit the file outside the app. If the project is already open, use **Reload** in Task Warden after external edits.

---

## JSON shape

\`\`\`json
{
  "version": "${SCHEMA_VERSION}",
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
      "closed": "ISO-8601 UTC or null"
    }
  ]
}
\`\`\`

---

## Rules when editing

1. Keep **valid JSON**. Do not invent new top-level fields.
2. \`version\` must be exactly \`${SCHEMA_VERSION}\`.
3. Project \`id\` is 8 lowercase characters. Task ids are \`t1\`, \`t2\`, … Copy an existing id pattern; do not invent UUIDs.
4. \`statuses\` is an ordered list of column names. The **last** status is the done column (do not hard-code the word "Done").
5. Each task \`status\` must match one entry in \`statuses\`.
6. On every task change, set \`updated\` to the current time in ISO-8601 UTC.
7. When a task moves into the **last** status, set \`closed\` to ISO-8601 UTC. When it leaves the last status, set \`closed\` to \`null\`.
8. Prefer short, clear task titles.
9. Leave \`aiInstructions\` as a string.

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
  "id": "k7xm2p9q",
  "name": "Sample Project",
  "statuses": ["Todo", "In Progress", "Done"],
  "aiInstructions": "(see aiInstructions on a real project file)",
  "tasks": [
    {
      "id": "t1",
      "title": "Example task",
      "description": "",
      "status": "Todo",
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
2. In Task Warden, open the project (or press **Reload** if it is already open).
3. Invalid JSON or schema errors are rejected; the app will not silently repair the file.
`;
}

/**
 * Trigger a browser download of the project file schema.
 */
export function downloadProjectSchema(): void {
  const content = buildProjectSchema();
  const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = PROJECT_FILE_SCHEMA_FILENAME;
  anchor.rel = 'noopener';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
