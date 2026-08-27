import { createEmptyProject } from './create-empty-project';
import {
  AI_INSTRUCTIONS,
  DEFAULT_PROJECT_NAME,
  DEFAULT_STATUSES,
  SCHEMA_VERSION,
} from './project.types';
import { validateProject } from './validate-project';

describe('createEmptyProject', () => {
  it('returns schema version 1.0.0', () => {
    const project = createEmptyProject();
    expect(project.version).toBe(SCHEMA_VERSION);
    expect(project.version).toBe('1.0.0');
  });

  it('generates an 8-character lowercase project id', () => {
    const project = createEmptyProject();
    expect(project.id).toMatch(/^[a-z0-9]{8}$/);
  });

  it('uses default name and empty tasks', () => {
    const project = createEmptyProject();
    expect(project.name).toBe(DEFAULT_PROJECT_NAME);
    expect(project.tasks).toEqual([]);
    expect('owner' in project).toBe(false);
    expect('startDate' in project).toBe(false);
    expect('endDate' in project).toBe(false);
  });

  it('uses default statuses (last status is done column)', () => {
    const project = createEmptyProject();
    expect(project.statuses).toEqual([...DEFAULT_STATUSES]);
    expect(project.statuses.at(-1)).toBe('Done');
  });

  it('embeds the locked aiInstructions string verbatim', () => {
    const project = createEmptyProject();
    expect(project.aiInstructions).toBe(AI_INSTRUCTIONS);
    expect(project.aiInstructions).toContain('Copy an existing id pattern');
    expect(project.aiInstructions).not.toContain('UUID v4');
    expect(project.aiInstructions).not.toContain('Leave unused keys unchanged');
  });

  it('always produces a valid, loadable project', () => {
    for (let i = 0; i < 5; i++) {
      const project = createEmptyProject();
      const result = validateProject(project);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.project.id).toBe(project.id);
      }
    }
  });

  it('gives a unique id each time', () => {
    const a = createEmptyProject();
    const b = createEmptyProject();
    expect(a.id).not.toBe(b.id);
  });
});
