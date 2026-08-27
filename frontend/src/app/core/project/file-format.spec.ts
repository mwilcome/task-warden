/**
 * File-format round-trip: parse, add/edit a task, validate.
 * Domain only — not a UI or in-app agent test.
 */
import { createEmptyProject } from './create-empty-project';
import { AI_INSTRUCTIONS, SCHEMA_VERSION } from './project.types';
import {
  addTask,
  applyTaskUpdate,
  buildNewTask,
  findTask,
} from './task-ops';
import { parseAndValidateProject, validateProject } from './validate-project';

describe('project file format', () => {
  it('new project embeds aiInstructions and validates', () => {
    const project = createEmptyProject();
    expect(project.version).toBe(SCHEMA_VERSION);
    expect(project.aiInstructions).toBe(AI_INSTRUCTIONS);
    expect(project.aiInstructions).toContain('last status');
    expect(validateProject(project).ok).toBe(true);
  });

  it('round-trips JSON after adding a task', () => {
    const onDisk = createEmptyProject();
    const opened = parseAndValidateProject(JSON.stringify(onDisk, null, 2));
    expect(opened.ok).toBe(true);
    if (!opened.ok) {
      return;
    }

    const built = buildNewTask(
      {
        title: 'Write the schema note',
        description: 'Keep the file valid JSON.',
        status: 'Todo',
      },
      opened.project.statuses,
    );
    expect(built.ok).toBe(true);
    if (!built.ok) {
      return;
    }

    const afterAdd = addTask(opened.project, built.value);
    const roundTrip = parseAndValidateProject(JSON.stringify(afterAdd, null, 2));
    expect(roundTrip.ok).toBe(true);
    if (!roundTrip.ok) {
      return;
    }
    expect(roundTrip.project.tasks).toHaveLength(1);
    expect(roundTrip.project.tasks[0].title).toBe('Write the schema note');
    expect(roundTrip.project.tasks[0].closed).toBeNull();
  });

  it('sets closed and updated when a task moves to the last status', () => {
    let project = createEmptyProject();
    const created = buildNewTask(
      { title: 'Polish release', status: 'In Progress' },
      project.statuses,
      '2026-08-01T10:00:00.000Z',
    );
    expect(created.ok).toBe(true);
    if (!created.ok) {
      return;
    }
    project = addTask(project, created.value);

    const later = '2026-08-01T12:00:00.000Z';
    const edited = applyTaskUpdate(
      created.value,
      {
        title: 'Polish release',
        description: 'Ship MVP',
        points: created.value.points,
        assigned: created.value.assigned,
        status: 'Done',
      },
      project.statuses,
      later,
    );
    expect(edited.ok).toBe(true);
    if (!edited.ok) {
      return;
    }
    project = {
      ...project,
      tasks: project.tasks.map((t) => (t.id === edited.value.id ? edited.value : t)),
    };

    const validation = validateProject(project);
    expect(validation.ok).toBe(true);
    const task = findTask(project, created.value.id);
    expect(task?.status).toBe('Done');
    expect(task?.closed).toBe(later);
    expect(task?.updated).toBe(later);
    expect(task?.description).toBe('Ship MVP');
  });
});
