import type { TwProject, TwTask } from './project.types';

/** One board column derived from project.statuses order. */
export interface BoardColumn {
  status: string;
  tasks: TwTask[];
  count: number;
}

/**
 * Pure domain view-model: columns in `statuses` order; tasks under matching status.
 * Tasks with no matching status are omitted (validation should prevent orphans on open).
 */
export function buildBoardColumns(project: TwProject): BoardColumn[] {
  return project.statuses.map((status) => {
    const tasks = project.tasks.filter((t) => t.status === status);
    return {
      status,
      tasks,
      count: tasks.length,
    };
  });
}
