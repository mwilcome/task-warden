import {
  PROJECT_FILE_GUIDE_FILENAME,
  buildProjectFileGuide,
} from './project-file-guide';
import { AI_INSTRUCTIONS, SCHEMA_VERSION } from './project.types';

describe('project file guide', () => {
  it('uses a clear markdown filename', () => {
    expect(PROJECT_FILE_GUIDE_FILENAME).toBe('task-warden-project-file-guide.md');
    expect(PROJECT_FILE_GUIDE_FILENAME.endsWith('.md')).toBe(true);
  });

  it('includes schema version, core rules, and embedded instructions', () => {
    const guide = buildProjectFileGuide();
    expect(guide).toContain(SCHEMA_VERSION);
    expect(guide).toContain('.tw.json');
    expect(guide).toContain('UUID v4');
    expect(guide).toContain('last');
    expect(guide).toContain('closed');
    expect(guide).toContain(AI_INSTRUCTIONS);
    expect(guide).toContain('Leave unused keys unchanged');
  });
});
