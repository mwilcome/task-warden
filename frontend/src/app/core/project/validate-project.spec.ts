import { createEmptyProject } from './create-empty-project';
import { INVALID_FILE_MESSAGE, SCHEMA_VERSION, type TwProject } from './project.types';
import { createUuidV4 } from './uuid';
import { parseAndValidateProject, validateProject } from './validate-project';

function validTask(overrides: Partial<TwProject['tasks'][number]> = {}) {
  const now = new Date().toISOString();
  return {
    id: createUuidV4(),
    title: 'Sample task',
    description: '',
    points: null as number | null,
    status: 'Todo',
    assigned: null as string | null,
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
        validTask({ status: 'In Progress', points: 3 }),
        validTask({ status: 'Done', closed: new Date().toISOString(), points: 0 }),
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

  it('rejects invalid project UUID', () => {
    const project = { ...createEmptyProject(), id: 'not-a-uuid' };
    const result = validateProject(project);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toMatch(/UUID/i);
    }
  });

  it('rejects invalid task UUID', () => {
    const project = projectWithTasks([validTask({ id: 'bad-id' })]);
    const result = validateProject(project);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toMatch(/UUID/i);
    }
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

  it('rejects negative points', () => {
    const project = projectWithTasks([validTask({ points: -1 })]);
    const result = validateProject(project);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toMatch(/points/i);
    }
  });

  it('rejects non-integer points', () => {
    const project = projectWithTasks([validTask({ points: 1.5 })]);
    const result = validateProject(project);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toMatch(/points/i);
    }
  });

  it('accepts points null and integer ≥ 0', () => {
    expect(validateProject(projectWithTasks([validTask({ points: null })])).ok).toBe(true);
    expect(validateProject(projectWithTasks([validTask({ points: 0 })])).ok).toBe(true);
    expect(validateProject(projectWithTasks([validTask({ points: 99 })])).ok).toBe(true);
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
