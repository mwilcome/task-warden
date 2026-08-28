import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ProjectSessionService } from '../core/project/project-session.service';
import { createEmptyProject } from '../core/project/create-empty-project';
import { buildNewTask, addTask } from '../core/project/task-ops';
import { BoardComponent } from './board.component';

describe('BoardComponent', () => {
  it('renders columns and cards', async () => {
    let project = createEmptyProject();
    const built = buildNewTask(
      { title: 'Ship board', description: 'body', status: 'Todo' },
      project.statuses,
    );
    expect(built.ok).toBe(true);
    if (!built.ok) {
      return;
    }
    project = addTask(project, built.value);

    await TestBed.configureTestingModule({
      imports: [BoardComponent],
      providers: [
        {
          provide: ProjectSessionService,
          useValue: {
            project: signal(project).asReadonly(),
            moveTask: vi.fn(),
            openTaskPanel: vi.fn(),
            renameStatus: vi.fn(),
            addStatus: vi.fn(),
            deleteStatus: vi.fn(),
            reorderStatuses: vi.fn(),
          },
        },
      ],
    }).compileComponents();

    const fixture = TestBed.createComponent(BoardComponent);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;

    expect(el.querySelectorAll('.board-column').length).toBeGreaterThan(0);
    expect(el.textContent).toContain('Todo');
    expect(el.textContent).toContain('Ship board');
  });
});
