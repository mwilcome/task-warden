import {
  Component,
  ElementRef,
  effect,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ProjectSessionService } from '../core/project/project-session.service';
import type { TwTask } from '../core/project/project.types';

export type TaskPanelMode =
  | { kind: 'create'; status: string }
  | { kind: 'edit'; task: TwTask };

@Component({
  selector: 'app-task-panel',
  imports: [FormsModule],
  templateUrl: './task-panel.component.html',
})
export class TaskPanelComponent {
  private readonly session = inject(ProjectSessionService);

  readonly mode = input.required<TaskPanelMode>();
  readonly closed = output<void>();

  protected readonly title = signal('');
  protected readonly description = signal('');
  protected readonly pointsText = signal('');
  protected readonly assigned = signal('');
  protected readonly status = signal('');
  protected readonly formError = signal<string | null>(null);
  protected readonly saving = signal(false);
  protected readonly confirmDelete = signal(false);

  private readonly titleInput = viewChild<ElementRef<HTMLInputElement>>('titleInput');

  constructor() {
    effect(() => {
      const m = this.mode();
      this.formError.set(null);
      this.confirmDelete.set(false);
      if (m.kind === 'create') {
        this.title.set('');
        this.description.set('');
        this.pointsText.set('');
        this.assigned.set('');
        this.status.set(m.status);
      } else {
        this.title.set(m.task.title);
        this.description.set(m.task.description);
        this.pointsText.set(m.task.points === null ? '' : String(m.task.points));
        this.assigned.set(m.task.assigned ?? '');
        this.status.set(m.task.status);
      }
      queueMicrotask(() => {
        this.titleInput()?.nativeElement.focus();
        if (m.kind === 'create') {
          this.titleInput()?.nativeElement.select();
        }
      });
    });
  }

  protected get panelTitle(): string {
    return this.mode().kind === 'create' ? 'New task' : 'Edit task';
  }

  protected get statuses(): string[] {
    return this.session.project()?.statuses ?? [];
  }

  protected onBackdropClick(): void {
    this.close();
  }

  protected onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.preventDefault();
      if (this.confirmDelete()) {
        this.confirmDelete.set(false);
        return;
      }
      this.close();
    }
  }

  protected close(): void {
    if (this.saving()) {
      return;
    }
    this.closed.emit();
  }

  protected async onSubmit(): Promise<void> {
    this.formError.set(null);
    const points = this.parsePoints(this.pointsText());
    if (points === 'invalid') {
      this.formError.set('Points must be an integer ≥ 0 or empty.');
      return;
    }

    this.saving.set(true);
    try {
      const m = this.mode();
      if (m.kind === 'create') {
        const result = await this.session.createTask({
          title: this.title(),
          description: this.description(),
          points,
          assigned: this.assigned() || null,
          status: this.status(),
        });
        if (!result.ok) {
          this.formError.set(result.message);
          return;
        }
      } else {
        const result = await this.session.saveTask(m.task.id, {
          title: this.title(),
          description: this.description(),
          points,
          assigned: this.assigned() || null,
          status: this.status(),
        });
        if (!result.ok) {
          this.formError.set(result.message);
          return;
        }
      }
      this.closed.emit();
    } finally {
      this.saving.set(false);
    }
  }

  protected onRequestDelete(): void {
    this.confirmDelete.set(true);
  }

  protected onCancelDelete(): void {
    this.confirmDelete.set(false);
  }

  protected async onConfirmDelete(): Promise<void> {
    const m = this.mode();
    if (m.kind !== 'edit') {
      return;
    }
    this.saving.set(true);
    this.formError.set(null);
    try {
      const result = await this.session.deleteTask(m.task.id);
      if (!result.ok) {
        this.formError.set(result.message);
        return;
      }
      this.closed.emit();
    } finally {
      this.saving.set(false);
    }
  }

  private parsePoints(raw: string): number | null | 'invalid' {
    const t = raw.trim();
    if (t === '') {
      return null;
    }
    if (!/^\d+$/.test(t)) {
      return 'invalid';
    }
    return Number(t);
  }
}
