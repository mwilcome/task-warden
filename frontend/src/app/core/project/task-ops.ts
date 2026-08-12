import type { TwProject, TwTask } from './project.types';
import { createUuidV4 } from './uuid';

export function utcNowIso(): string {
  return new Date().toISOString();
}

/** Last statuses entry is done; do not hard-code the word "Done". */
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
  points?: number | null;
  assigned?: string | null;
  status: string;
}

export interface UpdateTaskInput {
  title: string;
  description: string;
  points: number | null;
  assigned: string | null;
  status: string;
}

export type TaskOpError = { ok: false; reason: string };
export type TaskOpOk<T> = { ok: true; value: T };
export type TaskOpResult<T> = TaskOpOk<T> | TaskOpError;

function normalizeTitle(title: string): string {
  return title.trim();
}

function normalizePoints(points: number | null | undefined): TaskOpResult<number | null> {
  if (points === null || points === undefined || (typeof points === 'number' && Number.isNaN(points))) {
    return { ok: true, value: null };
  }
  if (typeof points !== 'number' || !Number.isInteger(points) || points < 0) {
    return { ok: false, reason: 'Points must be an integer ≥ 0 or empty.' };
  }
  return { ok: true, value: points };
}

export function buildNewTask(
  input: CreateTaskInput,
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
  const pointsResult = normalizePoints(input.points ?? null);
  if (!pointsResult.ok) {
    return pointsResult;
  }

  const task: TwTask = {
    id: createUuidV4(),
    title,
    description: input.description ?? '',
    points: pointsResult.value,
    status: input.status,
    assigned: input.assigned?.trim() ? input.assigned.trim() : null,
    created: now,
    updated: now,
    closed: closedForStatus(statuses, input.status, now),
  };
  return { ok: true, value: task };
}

/** Sets `updated`; `closed` follows the last-status rule. */
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
  const pointsResult = normalizePoints(input.points);
  if (!pointsResult.ok) {
    return pointsResult;
  }

  const task: TwTask = {
    ...existing,
    title,
    description: input.description ?? '',
    points: pointsResult.value,
    status: input.status,
    assigned: input.assigned?.trim() ? input.assigned.trim() : null,
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
      points: existing.points,
      assigned: existing.assigned,
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
