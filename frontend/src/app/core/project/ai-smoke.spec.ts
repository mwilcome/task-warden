/**
 * Story N — local-AI smoke test.
 * Simulates an external agent: read .tw.json, follow aiInstructions, add + edit a task.
 * Does not use the Angular UI; only the same domain rules the file format encodes.
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

describe('Story N — local AI file smoke test', () => {
  it('new project embeds locked aiInstructions and validates', () => {
    const project = createEmptyProject();
    expect(project.version).toBe(SCHEMA_VERSION);
    expect(project.aiInstructions).toBe(AI_INSTRUCTIONS);
    expect(project.aiInstructions).toContain('local-first');
    expect(project.aiInstructions).toContain('last status');
    expect(validateProject(project).ok).toBe(true);
  });

  it('AI can read aiInstructions and add a task on disk-shaped JSON', () => {
    // 1. App (or user) created a file
    const onDisk = createEmptyProject();
    const raw = JSON.stringify(onDisk, null, 2);

    // 2. AI opens the file
    const opened = parseAndValidateProject(raw);
    expect(opened.ok).toBe(true);
    if (!opened.ok) {
      return;
    }
    expect(opened.project.aiInstructions).toBe(AI_INSTRUCTIONS);

    // 3. AI follows instructions: new uuid, status in list, timestamps, closed if last
    const built = buildNewTask(
      {
        title: 'AI-added task',
        description: 'Created by local AI smoke test',
        points: 1,
        assigned: null,
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
    expect(roundTrip.project.tasks[0].title).toBe('AI-added task');
    expect(roundTrip.project.tasks[0].closed).toBeNull();
  });

  it('AI can edit a task (status → last, set closed, bump updated)', () => {
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

    // AI moves task to last status per aiInstructions
    const later = '2026-08-01T12:00:00.000Z';
    const edited = applyTaskUpdate(
      created.value,
      {
        title: 'Polish release',
        description: 'Ship MVP',
        points: 3,
        assigned: 'local-ai',
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
    expect(task?.points).toBe(3);
  });
});
