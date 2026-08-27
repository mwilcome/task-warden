import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ProjectSessionService } from '../core/project/project-session.service';
import { createEmptyProject } from '../core/project/create-empty-project';
import { buildNewTask } from '../core/project/task-ops';
import { TaskPanelComponent } from './task-panel.component';

describe('TaskPanelComponent', () => {
  it('shows title, body, and confirm-delete', async () => {
    const project = createEmptyProject();
    const built = buildNewTask({ title: 'Edit me', description: 'notes', status: 'Todo' }, project.statuses);
    expect(built.ok).toBe(true);
    if (!built.ok) {
      return;
    }

    await TestBed.configureTestingModule({
      imports: [TaskPanelComponent],
      providers: [
        {
          provide: ProjectSessionService,
          useValue: {
            project: signal(project).asReadonly(),
            createTask: vi.fn(),
            saveTask: vi.fn(),
            deleteTask: vi.fn(),
          },
        },
      ],
    }).compileComponents();

    const fixture = TestBed.createComponent(TaskPanelComponent);
    fixture.componentRef.setInput('mode', { kind: 'edit', task: built.value });
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;

    expect(el.querySelector('#task-title')).toBeTruthy();
    expect(el.querySelector('#task-description')).toBeTruthy();
    expect(el.textContent).toContain('Body');

    const deleteBtn = Array.from(el.querySelectorAll('button')).find((b) => b.textContent?.trim() === 'Delete');
    expect(deleteBtn).toBeTruthy();
    deleteBtn?.click();
    fixture.detectChanges();
    expect(el.textContent).toContain('Delete this task?');
  });
});
