import { buildBoardColumns } from './board-model';
import { createEmptyProject } from './create-empty-project';
import type { TwTask } from './project.types';

function task(partial: Partial<TwTask> & Pick<TwTask, 'title' | 'status'>): TwTask {
  const now = '2026-01-01T00:00:00.000Z';
  return {
    id: 't1',
    description: '',
    created: now,
    updated: now,
    closed: null,
    ...partial,
  };
}

describe('buildBoardColumns', () => {
  it('returns one column per status in order, empty when no tasks', () => {
    const project = createEmptyProject();
    const columns = buildBoardColumns(project);
    expect(columns.map((c) => c.status)).toEqual(['Todo', 'In Progress', 'Done']);
    expect(columns.every((c) => c.count === 0 && c.tasks.length === 0)).toBe(true);
  });

  it('places tasks under the matching status', () => {
    const project = createEmptyProject();
    project.tasks = [
      task({ id: 't1', title: 'A', status: 'Todo' }),
      task({ id: 't2', title: 'B', status: 'Done' }),
      task({ id: 't3', title: 'C', status: 'Todo' }),
      task({ id: 't4', title: 'D', status: 'In Progress' }),
    ];

    const columns = buildBoardColumns(project);
    expect(columns[0].count).toBe(2);
    expect(columns[0].tasks.map((t) => t.title)).toEqual(['A', 'C']);
    expect(columns[1].count).toBe(1);
    expect(columns[1].tasks[0].title).toBe('D');
    expect(columns[2].count).toBe(1);
    expect(columns[2].tasks[0].title).toBe('B');
  });

  it('respects custom status order', () => {
    const project = createEmptyProject();
    project.statuses = ['Backlog', 'Doing', 'Done'];
    project.tasks = [
      task({ id: 't1', title: 'X', status: 'Doing' }),
      task({ id: 't2', title: 'Y', status: 'Backlog' }),
    ];

    const columns = buildBoardColumns(project);
    expect(columns.map((c) => c.status)).toEqual(['Backlog', 'Doing', 'Done']);
    expect(columns[0].tasks[0].title).toBe('Y');
    expect(columns[1].tasks[0].title).toBe('X');
    expect(columns[2].count).toBe(0);
  });
});
