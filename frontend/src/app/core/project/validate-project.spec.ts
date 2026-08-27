import { createEmptyProject } from './create-empty-project';
import { INVALID_FILE_MESSAGE, SCHEMA_VERSION, type TwProject } from './project.types';
import { parseAndValidateProject, validateProject } from './validate-project';

function validTask(overrides: Partial<TwProject['tasks'][number]> = {}) {
  const now = new Date().toISOString();
  return {
    id: 't1',
    title: 'Sample task',
    description: '',
    status: 'Todo',
    created: now,
    updated: now,
    closed: null as string | null,
    ...overrides,
  };
}

function projectWithTasks(tasks: ReturnType<typeof validTask>[]): TwProject {
  return {
    ...createEmptyProject(),
    tasks,
  };
}

describe('validateProject', () => {
  it('accepts a valid empty project', () => {
    const result = validateProject(createEmptyProject());
    expect(result.ok).toBe(true);
  });

  it('accepts a valid project with tasks', () => {
    const result = validateProject(
      projectWithTasks([
        validTask(),
        validTask({ id: 't2', status: 'In Progress' }),
        validTask({ id: 't3', status: 'Done', closed: new Date().toISOString() }),
      ]),
    );
    expect(result.ok).toBe(true);
  });

  it('rejects non-objects with Invalid Task Warden file', () => {
    for (const value of [null, undefined, [], 'x', 42, true]) {
      const result = validateProject(value);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.message).toBe(INVALID_FILE_MESSAGE);
      }
    }
  });

  it('rejects wrong version', () => {
    const project = { ...createEmptyProject(), version: '2.0.0' };
    const result = validateProject(project);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).toBe(INVALID_FILE_MESSAGE);
      expect(result.reason).toMatch(/version/i);
    }
  });

  it('rejects missing required top-level fields', () => {
    const { name: _name, ...rest } = createEmptyProject();
    const result = validateProject(rest);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).toBe(INVALID_FILE_MESSAGE);
      expect(result.reason).toMatch(/name/);
    }
  });

  it('rejects empty project id', () => {
    const project = { ...createEmptyProject(), id: '' };
    const result = validateProject(project);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toMatch(/id/i);
    }
  });

  it('rejects empty task id', () => {
    const project = projectWithTasks([validTask({ id: '' })]);
    const result = validateProject(project);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toMatch(/id/i);
    }
  });

  it('accepts legacy UUID ids', () => {
    const project = {
      ...createEmptyProject(),
      id: 'a1b2c3d4-e5f6-4789-a012-3456789abcde',
      tasks: [validTask({ id: 'b2c3d4e5-f6a7-4890-b123-456789abcdef' })],
    };
    expect(validateProject(project).ok).toBe(true);
  });

  it('ignores extra keys including unused owner/points/assigned', () => {
    const raw = {
      ...createEmptyProject(),
      owner: null,
      startDate: null,
      endDate: null,
      extra: 'nope',
      tasks: [
        {
          ...validTask(),
          points: 3,
          assigned: 'me',
          leftover: true,
        },
      ],
    };
    const result = validateProject(raw);
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect('owner' in result.project).toBe(false);
    expect('startDate' in result.project).toBe(false);
    expect('endDate' in result.project).toBe(false);
    expect('extra' in result.project).toBe(false);
    expect('points' in result.project.tasks[0]).toBe(false);
    expect('assigned' in result.project.tasks[0]).toBe(false);
    expect('leftover' in result.project.tasks[0]).toBe(false);
    expect(result.project.tasks[0].title).toBe('Sample task');
  });

  it('rejects empty statuses', () => {
    const project = { ...createEmptyProject(), statuses: [] as string[] };
    const result = validateProject(project);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toMatch(/statuses/i);
    }
  });

  it('rejects orphan task status', () => {
    const project = projectWithTasks([validTask({ status: 'Blocked' })]);
    const result = validateProject(project);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).toBe(INVALID_FILE_MESSAGE);
      expect(result.reason).toMatch(/orphan/i);
    }
  });

  it('rejects empty task title', () => {
    const project = projectWithTasks([validTask({ title: '   ' })]);
    const result = validateProject(project);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toMatch(/title/i);
    }
  });

  it('does not require aiInstructions to match the locked template (AI may edit)', () => {
    const project = {
      ...createEmptyProject(),
      aiInstructions: 'Custom AI notes',
    };
    expect(validateProject(project).ok).toBe(true);
  });
});

describe('parseAndValidateProject', () => {
  it('parses valid JSON project', () => {
    const json = JSON.stringify(createEmptyProject());
    const result = parseAndValidateProject(json);
    expect(result.ok).toBe(true);
  });

  it('rejects invalid JSON with Invalid Task Warden file', () => {
    const result = parseAndValidateProject('{ not json');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).toBe(INVALID_FILE_MESSAGE);
      expect(result.reason).toMatch(/JSON/i);
    }
  });

  it('round-trips createEmptyProject through JSON', () => {
    const original = createEmptyProject();
    const result = parseAndValidateProject(JSON.stringify(original));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.project.version).toBe(SCHEMA_VERSION);
      expect(result.project.id).toBe(original.id);
      expect(result.project.aiInstructions).toBe(original.aiInstructions);
    }
  });
});
