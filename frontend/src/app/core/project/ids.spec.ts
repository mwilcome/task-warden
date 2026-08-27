import { createProjectId, isNonEmptyId, nextTaskId } from './ids';

describe('ids', () => {
  it('createProjectId returns 8 lowercase characters', () => {
    const id = createProjectId();
    expect(id).toMatch(/^[a-z0-9]{8}$/);
    expect(createProjectId()).not.toBe(id);
  });

  it('nextTaskId starts at t1 and follows the highest tN', () => {
    expect(nextTaskId([])).toBe('t1');
    expect(nextTaskId([{ id: 't1' }])).toBe('t2');
    expect(nextTaskId([{ id: 't2' }, { id: 't10' }])).toBe('t11');
    expect(nextTaskId([{ id: 'legacy-uuid' }, { id: 't3' }])).toBe('t4');
  });

  it('isNonEmptyId accepts short ids and legacy UUIDs', () => {
    expect(isNonEmptyId('k7xm2p9q')).toBe(true);
    expect(isNonEmptyId('t1')).toBe(true);
    expect(isNonEmptyId('a1b2c3d4-e5f6-4789-a012-3456789abcde')).toBe(true);
    expect(isNonEmptyId('')).toBe(false);
    expect(isNonEmptyId('   ')).toBe(false);
    expect(isNonEmptyId(null)).toBe(false);
  });
});
