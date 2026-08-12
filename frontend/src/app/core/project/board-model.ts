import type { TwProject, TwTask } from './project.types';

export interface BoardColumn {
  status: string;
  tasks: TwTask[];
  count: number;
}

/** Tasks whose status is not in `statuses` are omitted. */
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
