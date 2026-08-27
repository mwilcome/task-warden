import { createEmptyProject } from './create-empty-project';
import { addTask, buildNewTask } from './task-ops';
import {
  addStatus,
  deleteStatus,
  renameStatus,
  reorderStatuses,
  syncClosedFields,
} from './status-ops';

describe('status-ops', () => {
  const now = '2026-07-01T00:00:00.000Z';

  it('addStatus appends and rejects duplicates/empty', () => {
    let project = createEmptyProject();
    const added = addStatus(project, '  Review  ');
    expect(added.ok).toBe(true);
    if (added.ok) {
      expect(added.value.statuses).toEqual(['Todo', 'In Progress', 'Done', 'Review']);
      project = added.value;
    }
    expect(addStatus(project, 'Todo').ok).toBe(false);
    expect(addStatus(project, '  ').ok).toBe(false);
  });

  it('renameStatus updates statuses and tasks', () => {
    let project = createEmptyProject();
    const t = buildNewTask({ title: 'A', status: 'Todo' }, project.statuses, project.tasks, now);
    expect(t.ok).toBe(true);
    if (!t.ok) {
      return;
    }
    project = addTask(project, t.value);
    const renamed = renameStatus(project, 'Todo', 'Backlog');
    expect(renamed.ok).toBe(true);
    if (renamed.ok) {
      expect(renamed.value.statuses[0]).toBe('Backlog');
      expect(renamed.value.tasks[0].status).toBe('Backlog');
    }
  });

  it('reorderStatuses changes column order and syncs closed', () => {
    let project = createEmptyProject();
    const t = buildNewTask({ title: 'A', status: 'Todo' }, project.statuses, project.tasks, now);
    expect(t.ok).toBe(true);
    if (!t.ok) {
      return;
    }
    project = addTask(project, t.value);
    // Move Todo to end → becomes last (done)
    const reordered = reorderStatuses(project, 0, 2);
    expect(reordered.ok).toBe(true);
    if (reordered.ok) {
      expect(reordered.value.statuses).toEqual(['In Progress', 'Done', 'Todo']);
      expect(reordered.value.tasks[0].status).toBe('Todo');
      expect(reordered.value.tasks[0].closed).not.toBeNull();
    }
  });

  it('deleteStatus blocks non-empty and last remaining status', () => {
    let project = createEmptyProject();
    const t = buildNewTask({ title: 'A', status: 'Todo' }, project.statuses, project.tasks, now);
    expect(t.ok).toBe(true);
    if (!t.ok) {
      return;
    }
    project = addTask(project, t.value);
    expect(deleteStatus(project, 'Todo').ok).toBe(false);

    const emptyDelete = deleteStatus(project, 'In Progress');
    expect(emptyDelete.ok).toBe(true);

    let onlyOne = createEmptyProject();
    onlyOne = { ...onlyOne, statuses: ['Solo'], tasks: [] };
    expect(deleteStatus(onlyOne, 'Solo').ok).toBe(false);
  });

  it('syncClosedFields clears closed when no longer last', () => {
    let project = createEmptyProject();
    const t = buildNewTask({ title: 'A', status: 'Done' }, project.statuses, project.tasks, now);
    expect(t.ok).toBe(true);
    if (!t.ok) {
      return;
    }
    project = addTask(project, t.value);
    expect(project.tasks[0].closed).toBe(now);

    // Put Done first so it is not last
    const reordered = reorderStatuses(project, 2, 0);
    expect(reordered.ok).toBe(true);
    if (reordered.ok) {
      expect(reordered.value.tasks[0].closed).toBeNull();
    }

    // Explicit sync is idempotent on empty
    const synced = syncClosedFields(createEmptyProject(), now);
    expect(synced.tasks).toEqual([]);
  });
});
