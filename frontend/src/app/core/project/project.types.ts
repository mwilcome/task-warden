/**
 * Task Warden project schema v1.0.0.
 * Domain types for the Project bounded context (no Angular / no I/O).
 * See docs/schema.md and docs/architecture.md.
 */

/** Schema version required on every project file. */
export const SCHEMA_VERSION = '1.0.0' as const;

/** Default column order for new projects. Last entry = done (never hard-code "Done"). */
export const DEFAULT_STATUSES = ['Todo', 'In Progress', 'Done'] as const;

/** Default project name for new projects. */
export const DEFAULT_PROJECT_NAME = 'Untitled Project';

/**
 * Locked aiInstructions text embedded in every new project.
 * The app must never mutate this field after create.
 */
export const AI_INSTRUCTIONS = `Task Warden project file.
- statuses: ordered list of column names. Default ["Todo","In Progress","Done"]. Custom allowed.
- tasks: flat array. Each task has id (uuid v4), title (required non-empty string), description (string), status (must match one in statuses), created, updated, closed (ISO-8601 UTC; closed is set only in the last status).
- When editing: always update "updated". Set "closed" when status becomes the last status. Clear "closed" if moved out of the last status.
- Never invent new top-level fields. Keep the file valid JSON. Leave unused keys unchanged.
- Generate a new UUID v4 for every new task. Prefer small, clear task titles.`;

/** User-facing validation failure prefix. */
export const INVALID_FILE_MESSAGE = 'Invalid Task Warden file';

/** A single task in the project board. */
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

/** Root project document stored as `.tw.json`. */
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

/** Result of validating an unknown value as a TwProject. */
export type ProjectValidationResult =
  | { ok: true; project: TwProject }
  | { ok: false; message: string; reason: string };
