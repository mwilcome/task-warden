export const SCHEMA_VERSION = '1.0.0' as const;

/** Last entry is done; do not hard-code the word "Done". */
export const DEFAULT_STATUSES = ['Todo', 'In Progress', 'Done'] as const;

export const DEFAULT_PROJECT_NAME = 'Untitled Project';

/** Embedded in new projects. The app must not change this after create. */
export const AI_INSTRUCTIONS = `Task Warden project file (local-first).
- statuses: ordered list of column names. Default ["Todo","In Progress","Done"]. Custom allowed.
- tasks: flat array. Each task has id (uuid v4), title (required non-empty string), description (string), points (number|null), status (must match one in statuses), assigned (string|null), created, updated, closed (ISO-8601 UTC, closed null until Done).
- When editing: always update the "updated" field. Set "closed" when status becomes the last status in the statuses array. Clear "closed" if moved out of the last status.
- Never invent new top-level fields. Keep the file valid JSON.
- id must be a valid UUID. Generate a new one for every new task.
- Prefer small, clear task titles.`;

export const INVALID_FILE_MESSAGE = 'Invalid Task Warden file';

export interface TwTask {
  id: string;
  title: string;
  description: string;
  points: number | null;
  status: string;
  assigned: string | null;
  created: string;
  updated: string;
  closed: string | null;
}

export interface TwProject {
  version: typeof SCHEMA_VERSION | string;
  id: string;
  name: string;
  owner: string | null;
  startDate: string | null;
  endDate: string | null;
  statuses: string[];
  aiInstructions: string;
  tasks: TwTask[];
}

export type ProjectValidationResult =
  | { ok: true; project: TwProject }
  | { ok: false; message: string; reason: string };
