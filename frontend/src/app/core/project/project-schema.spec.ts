import { PROJECT_FILE_SCHEMA_FILENAME, buildProjectSchema } from './project-schema';
import { AI_INSTRUCTIONS, SCHEMA_VERSION } from './project.types';

describe('project file schema', () => {
  it('uses a markdown filename that matches the Download schema button', () => {
    expect(PROJECT_FILE_SCHEMA_FILENAME).toBe('task-warden-schema.md');
    expect(PROJECT_FILE_SCHEMA_FILENAME.endsWith('.md')).toBe(true);
  });

  it('includes schema version, short ids, core rules, and embedded instructions', () => {
    const schema = buildProjectSchema();
    expect(schema).toContain(SCHEMA_VERSION);
    expect(schema).toContain('.tw.json');
    expect(schema).toContain('k7xm2p9q');
    expect(schema).toContain('t1');
    expect(schema).toContain('Copy an existing id pattern');
    expect(schema).not.toContain('UUID v4');
    expect(schema).not.toContain('Leave unused keys unchanged');
    expect(schema).not.toContain('"owner"');
    expect(schema).not.toContain('"points"');
    expect(schema).not.toContain('"assigned"');
    expect(schema).toContain('last');
    expect(schema).toContain('closed');
    expect(schema).toContain(AI_INSTRUCTIONS);
  });
});
