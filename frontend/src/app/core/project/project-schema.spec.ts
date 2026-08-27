import { PROJECT_FILE_SCHEMA_FILENAME, buildProjectSchema } from './project-schema';
import { AI_INSTRUCTIONS, SCHEMA_VERSION } from './project.types';

describe('project file schema', () => {
  it('uses a markdown filename that matches the Download schema button', () => {
    expect(PROJECT_FILE_SCHEMA_FILENAME).toBe('task-warden-schema.md');
    expect(PROJECT_FILE_SCHEMA_FILENAME.endsWith('.md')).toBe(true);
  });

  it('includes schema version, unused keys as null, core rules, and embedded instructions', () => {
    const schema = buildProjectSchema();
    expect(schema).toContain(SCHEMA_VERSION);
    expect(schema).toContain('.tw.json');
    expect(schema).toContain('UUID v4');
    expect(schema).toContain('"owner": null');
    expect(schema).toContain('"startDate": null');
    expect(schema).toContain('"endDate": null');
    expect(schema).toContain('"points": null');
    expect(schema).toContain('"assigned": null');
    expect(schema).toContain('last');
    expect(schema).toContain('closed');
    expect(schema).toContain(AI_INSTRUCTIONS);
    expect(schema).toContain('Leave them unchanged');
  });
});
