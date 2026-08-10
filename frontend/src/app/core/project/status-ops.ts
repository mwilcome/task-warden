import type { TwProject, TwTask } from './project.types';
import { lastStatus, type TaskOpResult, utcNowIso } from './task-ops';

function normalizeStatusName(name: string): string {
  return name.trim();
}

/**
 * After statuses change, sync each task's `closed` to last-status rule.
 * Only bumps `updated` when `closed` actually changes.
 */
export function syncClosedFields(
  project: TwProject,
  now: string = utcNowIso(),
): TwProject {
  const last = lastStatus(project.statuses);
  const tasks: TwTask[] = project.tasks.map((task) => {
    const shouldBeClosed = last !== null && task.status === last;
    if (shouldBeClosed) {
      if (task.closed !== null) {
        return task;
      }
      return { ...task, closed: now, updated: now };
    }
    if (task.closed === null) {
      return task;
    }
    return { ...task, closed: null, updated: now };
  });
  return { ...project, tasks };
}

/** Append a new empty status column. */
export function addStatus(
  project: TwProject,
  name: string,
): TaskOpResult<TwProject> {
  const trimmed = normalizeStatusName(name);
  if (!trimmed) {
    return { ok: false, reason: 'Status name is required.' };
  }
  if (project.statuses.includes(trimmed)) {
    return { ok: false, reason: 'A status with that name already exists.' };
  }
  const next: TwProject = {
    ...project,
    statuses: [...project.statuses, trimmed],
  };
  return { ok: true, value: syncClosedFields(next) };
}

/** Rename a status and rewrite every task that used the old name. */
export function renameStatus(
  project: TwProject,
  oldName: string,
  newName: string,
): TaskOpResult<TwProject> {
  const trimmed = normalizeStatusName(newName);
  if (!trimmed) {
    return { ok: false, reason: 'Status name is required.' };
  }
  const index = project.statuses.indexOf(oldName);
  if (index < 0) {
    return { ok: false, reason: 'Status not found.' };
  }
  if (trimmed === oldName) {
    return { ok: true, value: project };
  }
  if (project.statuses.includes(trimmed)) {
    return { ok: false, reason: 'A status with that name already exists.' };
  }

  const statuses = project.statuses.map((s, i) => (i === index ? trimmed : s));
  const tasks = project.tasks.map((t) =>
    t.status === oldName ? { ...t, status: trimmed } : t,
  );
  return { ok: true, value: syncClosedFields({ ...project, statuses, tasks }) };
}

/** Move status at fromIndex to toIndex (array order = column order). */
export function reorderStatuses(
  project: TwProject,
  fromIndex: number,
  toIndex: number,
): TaskOpResult<TwProject> {
  const { statuses } = project;
  if (
    fromIndex < 0 ||
    toIndex < 0 ||
    fromIndex >= statuses.length ||
    toIndex >= statuses.length
  ) {
    return { ok: false, reason: 'Invalid status position.' };
  }
  if (fromIndex === toIndex) {
    return { ok: true, value: project };
  }
  const next = [...statuses];
  const [item] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, item);
  return { ok: true, value: syncClosedFields({ ...project, statuses: next }) };
}

/**
 * Delete a status only when it has zero tasks.
 * Must keep at least one status.
 */
export function deleteStatus(
  project: TwProject,
  name: string,
): TaskOpResult<TwProject> {
  if (!project.statuses.includes(name)) {
    return { ok: false, reason: 'Status not found.' };
  }
  if (project.statuses.length <= 1) {
    return { ok: false, reason: 'At least one status is required.' };
  }
  const taskCount = project.tasks.filter((t) => t.status === name).length;
  if (taskCount > 0) {
    return {
      ok: false,
      reason: `Cannot delete “${name}” while it has ${taskCount} task(s). Move or delete them first.`,
    };
  }
  const statuses = project.statuses.filter((s) => s !== name);
  return { ok: true, value: syncClosedFields({ ...project, statuses }) };
}
