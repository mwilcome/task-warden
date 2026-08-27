import {
  INVALID_FILE_MESSAGE,
  SCHEMA_VERSION,
  type ProjectValidationResult,
  type TwProject,
  type TwTask,
} from './project.types';
import { isNonEmptyId } from './ids';

function fail(reason: string): ProjectValidationResult {
  return {
    ok: false,
    message: INVALID_FILE_MESSAGE,
    reason,
  };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === 'string';
}

/**
 * Validates an unknown value as a TwProject.
 * Extra keys are ignored. Missing or invalid required fields are rejected.
 */
export function validateProject(value: unknown): ProjectValidationResult {
  if (!isPlainObject(value)) {
    return fail('Root value must be a JSON object.');
  }

  const requiredKeys = ['version', 'id', 'name', 'statuses', 'aiInstructions', 'tasks'] as const;

  for (const key of requiredKeys) {
    if (!(key in value)) {
      return fail(`Missing required field: ${key}.`);
    }
  }

  if (value['version'] !== SCHEMA_VERSION) {
    return fail(`Unsupported version (expected "${SCHEMA_VERSION}").`);
  }

  if (!isNonEmptyId(value['id'])) {
    return fail('Project id must be a non-empty string.');
  }

  if (typeof value['name'] !== 'string') {
    return fail('name must be a string.');
  }

  if (typeof value['aiInstructions'] !== 'string') {
    return fail('aiInstructions must be a string.');
  }

  const statuses = value['statuses'];
  if (!Array.isArray(statuses) || statuses.length === 0) {
    return fail('statuses must be a non-empty array of strings.');
  }
  for (let i = 0; i < statuses.length; i++) {
    if (typeof statuses[i] !== 'string' || statuses[i] === '') {
      return fail(`statuses[${i}] must be a non-empty string.`);
    }
  }

  const statusSet = new Set(statuses as string[]);

  const tasks = value['tasks'];
  if (!Array.isArray(tasks)) {
    return fail('tasks must be an array.');
  }

  const validatedTasks: TwTask[] = [];
  for (let i = 0; i < tasks.length; i++) {
    const taskResult = validateTask(tasks[i], i, statusSet);
    if (!taskResult.ok) {
      return taskResult;
    }
    validatedTasks.push(taskResult.task);
  }

  const project: TwProject = {
    version: SCHEMA_VERSION,
    id: value['id'] as string,
    name: value['name'] as string,
    statuses: [...(statuses as string[])],
    aiInstructions: value['aiInstructions'] as string,
    tasks: validatedTasks,
  };

  return { ok: true, project };
}

type TaskOk = { ok: true; task: TwTask };
type TaskFail = { ok: false; message: string; reason: string };

function taskFail(reason: string): TaskFail {
  return {
    ok: false,
    message: INVALID_FILE_MESSAGE,
    reason,
  };
}

function validateTask(
  value: unknown,
  index: number,
  statusSet: Set<string>,
): TaskOk | TaskFail {
  const prefix = `tasks[${index}]`;

  if (!isPlainObject(value)) {
    return taskFail(`${prefix} must be an object.`);
  }

  const taskKeys = ['id', 'title', 'description', 'status', 'created', 'updated', 'closed'] as const;

  for (const key of taskKeys) {
    if (!(key in value)) {
      return taskFail(`${prefix} missing required field: ${key}.`);
    }
  }

  if (!isNonEmptyId(value['id'])) {
    return taskFail(`${prefix}.id must be a non-empty string.`);
  }

  if (typeof value['title'] !== 'string' || value['title'].trim() === '') {
    return taskFail(`${prefix}.title must be a non-empty string.`);
  }

  if (typeof value['description'] !== 'string') {
    return taskFail(`${prefix}.description must be a string.`);
  }

  if (typeof value['status'] !== 'string') {
    return taskFail(`${prefix}.status must be a string.`);
  }
  if (!statusSet.has(value['status'])) {
    return taskFail(`${prefix}.status is not in statuses (orphan status).`);
  }

  if (typeof value['created'] !== 'string') {
    return taskFail(`${prefix}.created must be a string.`);
  }

  if (typeof value['updated'] !== 'string') {
    return taskFail(`${prefix}.updated must be a string.`);
  }

  if (!isNullableString(value['closed'])) {
    return taskFail(`${prefix}.closed must be a string or null.`);
  }

  return {
    ok: true,
    task: {
      id: value['id'] as string,
      title: value['title'] as string,
      description: value['description'] as string,
      status: value['status'] as string,
      created: value['created'] as string,
      updated: value['updated'] as string,
      closed: value['closed'] as string | null,
    },
  };
}

/**
 * Parse a JSON string and validate as a TwProject.
 * Invalid JSON → Invalid Task Warden file.
 */
export function parseAndValidateProject(jsonText: string): ProjectValidationResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText) as unknown;
  } catch {
    return fail('File is not valid JSON.');
  }
  return validateProject(parsed);
}
