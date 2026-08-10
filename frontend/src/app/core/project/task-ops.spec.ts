import { createEmptyProject } from './create-empty-project';
import {
  addTask,
  applyTaskUpdate,
  buildNewTask,
  closedForStatus,
  isDoneStatus,
  moveTaskToStatus,
  removeTask,
  renameProject,
  replaceTask,
} from './task-ops';

describe('task-ops', () => {
  const now = '2026-06-01T12:00:00.000Z';

  it('treats last status as done, not the string Done', () => {
    const statuses = ['Todo', 'Ship'];
    expect(isDoneStatus(statuses, 'Ship')).toBe(true);
    expect(isDoneStatus(statuses, 'Done')).toBe(false);
    expect(closedForStatus(statuses, 'Ship', now)).toBe(now);
    expect(closedForStatus(statuses, 'Todo', now)).toBeNull();
  });

  it('buildNewTask sets uuid, timestamps, and closed when last status', () => {
    const statuses = ['Todo', 'In Progress', 'Done'];
    const result = buildNewTask(
      { title: '  Ship it  ', status: 'Done', description: 'd', points: 2, assigned: 'me' },
      statuses,
      now,
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.title).toBe('Ship it');
      expect(result.value.status).toBe('Done');
      expect(result.value.created).toBe(now);
      expect(result.value.updated).toBe(now);
      expect(result.value.closed).toBe(now);
      expect(result.value.points).toBe(2);
      expect(result.value.id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
      );
    }
  });

  it('buildNewTask rejects empty title and bad points', () => {
    const statuses = ['Todo', 'Done'];
    expect(buildNewTask({ title: '  ', status: 'Todo' }, statuses).ok).toBe(false);
    expect(buildNewTask({ title: 'X', status: 'Todo', points: -1 }, statuses).ok).toBe(false);
    expect(buildNewTask({ title: 'X', status: 'Todo', points: 1.5 }, statuses).ok).toBe(false);
  });

  it('applyTaskUpdate refreshes updated and toggles closed', () => {
    const statuses = ['Todo', 'Done'];
    const created = buildNewTask({ title: 'A', status: 'Todo' }, statuses, now);
    expect(created.ok).toBe(true);
    if (!created.ok) {
      return;
    }
    const later = '2026-06-02T12:00:00.000Z';
    const moved = applyTaskUpdate(
      created.value,
      {
        title: 'A',
        description: '',
        points: null,
        assigned: null,
        status: 'Done',
      },
      statuses,
      later,
    );
    expect(moved.ok).toBe(true);
    if (moved.ok) {
      expect(moved.value.updated).toBe(later);
      expect(moved.value.closed).toBe(later);
      expect(moved.value.created).toBe(now);
    }

    const reopened = applyTaskUpdate(
      moved.ok ? moved.value : created.value,
      {
        title: 'A',
        description: '',
        points: null,
        assigned: null,
        status: 'Todo',
      },
      statuses,
      '2026-06-03T12:00:00.000Z',
    );
    expect(reopened.ok).toBe(true);
    if (reopened.ok) {
      expect(reopened.value.closed).toBeNull();
    }
  });

  it('add/replace/remove tasks on project', () => {
    let project = createEmptyProject();
    const t = buildNewTask({ title: 'One', status: 'Todo' }, project.statuses, now);
    expect(t.ok).toBe(true);
    if (!t.ok) {
      return;
    }
    project = addTask(project, t.value);
    expect(project.tasks).toHaveLength(1);

    const updated = applyTaskUpdate(
      t.value,
      { title: 'Two', description: 'x', points: 1, assigned: null, status: 'Todo' },
      project.statuses,
      now,
    );
    expect(updated.ok).toBe(true);
    if (!updated.ok) {
      return;
    }
    project = replaceTask(project, updated.value);
    expect(project.tasks[0].title).toBe('Two');

    project = removeTask(project, t.value.id);
    expect(project.tasks).toHaveLength(0);
  });

  it('moveTaskToStatus updates status, updated, and closed', () => {
    let project = createEmptyProject();
    const t = buildNewTask({ title: 'Drag me', status: 'Todo' }, project.statuses, now);
    expect(t.ok).toBe(true);
    if (!t.ok) {
      return;
    }
    project = addTask(project, t.value);
    const later = '2026-06-04T00:00:00.000Z';
    const moved = moveTaskToStatus(project, t.value.id, 'Done', later);
    expect(moved.ok).toBe(true);
    if (moved.ok) {
      const task = moved.value.tasks[0];
      expect(task.status).toBe('Done');
      expect(task.updated).toBe(later);
      expect(task.closed).toBe(later);
    }
  });

  it('renameProject trims and rejects empty', () => {
    const project = createEmptyProject();
    const ok = renameProject(project, '  Alpha  ');
    expect(ok.ok).toBe(true);
    if (ok.ok) {
      expect(ok.value.name).toBe('Alpha');
    }
    expect(renameProject(project, '   ').ok).toBe(false);
  });
});
