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
import { form, FormField, disabled, required } from '@angular/forms/signals';
import { ProjectSessionService } from '../core/project/project-session.service';
import type { TwTask } from '../core/project/project.types';

export type TaskPanelMode =
  | { kind: 'create'; status: string }
  | { kind: 'edit'; task: TwTask };

type TaskPanelModel = {
  title: string;
  description: string;
};

/**
 * Side panel: title + body + confirm-delete. Signal Forms.
 * Styles: global classes only (src/styles.scss).
 */
@Component({
  selector: 'app-task-panel',
  imports: [FormField],
  templateUrl: './task-panel.component.html',
})
export class TaskPanelComponent {
  private readonly session = inject(ProjectSessionService);

  readonly mode = input.required<TaskPanelMode>();
  readonly closed = output<void>();

  protected readonly model = signal<TaskPanelModel>({ title: '', description: '' });
  protected readonly taskForm = form(this.model, (schemaPath) => {
    required(schemaPath.title, { message: 'Title is required.' });
    disabled(schemaPath.title, { when: () => this.saving() });
    disabled(schemaPath.description, { when: () => this.saving() });
  });

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
        this.model.set({ title: '', description: '' });
      } else {
        this.model.set({ title: m.task.title, description: m.task.description });
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

  protected async onSubmit(event: Event): Promise<void> {
    event.preventDefault();
    this.formError.set(null);
    if (this.taskForm().invalid()) {
      const first = this.taskForm.title().errors()[0];
      this.formError.set(first?.message ?? 'Title is required.');
      return;
    }

    this.saving.set(true);
    try {
      const { title, description } = this.model();
      const m = this.mode();
      if (m.kind === 'create') {
        const result = await this.session.createTask({
          title,
          description,
          status: m.status,
        });
        if (!result.ok) {
          this.formError.set(result.message);
          return;
        }
      } else {
        const result = await this.session.saveTask(m.task.id, { title, description });
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
}
