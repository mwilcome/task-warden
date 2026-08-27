import type { TwProject, TwTask } from './project.types';
import { nextTaskId } from './ids';

/** ISO-8601 UTC timestamp now. */
export function utcNowIso(): string {
  return new Date().toISOString();
}

/** Last entry in statuses = done (never hard-code "Done"). */
export function lastStatus(statuses: string[]): string | null {
  if (statuses.length === 0) {
    return null;
  }
  return statuses[statuses.length - 1] ?? null;
}

export function isDoneStatus(statuses: string[], status: string): boolean {
  const last = lastStatus(statuses);
  return last !== null && status === last;
}

/**
 * closed = now when status is last; null when not last.
 */
export function closedForStatus(
  statuses: string[],
  status: string,
  now: string = utcNowIso(),
): string | null {
  return isDoneStatus(statuses, status) ? now : null;
}

export interface CreateTaskInput {
  title: string;
  description?: string;
  status: string;
}

export interface UpdateTaskInput {
  title: string;
  description: string;
  status: string;
}

export type TaskOpError = { ok: false; reason: string };
export type TaskOpOk<T> = { ok: true; value: T };
export type TaskOpResult<T> = TaskOpOk<T> | TaskOpError;

function normalizeTitle(title: string): string {
  return title.trim();
}

/** Build a new task for a column status. Id is tN after the highest tN in existingTasks. */
export function buildNewTask(
  input: CreateTaskInput,
  statuses: string[],
  existingTasks: readonly TwTask[] = [],
  now: string = utcNowIso(),
): TaskOpResult<TwTask> {
  const title = normalizeTitle(input.title);
  if (!title) {
    return { ok: false, reason: 'Title is required.' };
  }
  if (!statuses.includes(input.status)) {
    return { ok: false, reason: 'Status is not in the project statuses list.' };
  }

  const task: TwTask = {
    id: nextTaskId(existingTasks),
    title,
    description: input.description ?? '',
    status: input.status,
    created: now,
    updated: now,
    closed: closedForStatus(statuses, input.status, now),
  };
  return { ok: true, value: task };
}

/** Apply field updates; always refresh updated; closed follows last-status rule. */
export function applyTaskUpdate(
  existing: TwTask,
  input: UpdateTaskInput,
  statuses: string[],
  now: string = utcNowIso(),
): TaskOpResult<TwTask> {
  const title = normalizeTitle(input.title);
  if (!title) {
    return { ok: false, reason: 'Title is required.' };
  }
  if (!statuses.includes(input.status)) {
    return { ok: false, reason: 'Status is not in the project statuses list.' };
  }

  const task: TwTask = {
    ...existing,
    title,
    description: input.description ?? '',
    status: input.status,
    updated: now,
    closed: closedForStatus(statuses, input.status, now),
  };
  return { ok: true, value: task };
}

export function addTask(project: TwProject, task: TwTask): TwProject {
  return {
    ...project,
    tasks: [...project.tasks, task],
  };
}

export function replaceTask(project: TwProject, task: TwTask): TwProject {
  return {
    ...project,
    tasks: project.tasks.map((t) => (t.id === task.id ? task : t)),
  };
}

export function removeTask(project: TwProject, taskId: string): TwProject {
  return {
    ...project,
    tasks: project.tasks.filter((t) => t.id !== taskId),
  };
}

export function findTask(project: TwProject, taskId: string): TwTask | undefined {
  return project.tasks.find((t) => t.id === taskId);
}

/**
 * Move task to another status. Same closed/updated rules as edit.
 * No-op success if status unchanged.
 */
export function moveTaskToStatus(
  project: TwProject,
  taskId: string,
  newStatus: string,
  now: string = utcNowIso(),
): TaskOpResult<TwProject> {
  const existing = findTask(project, taskId);
  if (!existing) {
    return { ok: false, reason: 'Task not found.' };
  }
  if (!project.statuses.includes(newStatus)) {
    return { ok: false, reason: 'Status is not in the project statuses list.' };
  }
  if (existing.status === newStatus) {
    return { ok: true, value: project };
  }
  const updated = applyTaskUpdate(
    existing,
    {
      title: existing.title,
      description: existing.description,
      status: newStatus,
    },
    project.statuses,
    now,
  );
  if (!updated.ok) {
    return updated;
  }
  return { ok: true, value: replaceTask(project, updated.value) };
}

/** Rename project. Empty names rejected. */
export function renameProject(
  project: TwProject,
  name: string,
): TaskOpResult<TwProject> {
  const trimmed = name.trim();
  if (!trimmed) {
    return { ok: false, reason: 'Project name is required.' };
  }
  if (trimmed === project.name) {
    return { ok: true, value: project };
  }
  return { ok: true, value: { ...project, name: trimmed } };
}
