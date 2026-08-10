import { Component, ElementRef, computed, effect, inject, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { buildBoardColumns } from '../core/project/board-model';
import { ProjectSessionService } from '../core/project/project-session.service';
import type { TwTask } from '../core/project/project.types';
import {
  TaskPanelComponent,
  type TaskPanelMode,
} from '../task-panel/task-panel.component';

const DND_TASK_MIME = 'application/x-task-warden-task-id';
const DND_STATUS_MIME = 'application/x-task-warden-status';

/**
 * Kanban board: columns, cards, panels, task DnD, status management (Story K).
 * Styles: global classes only (src/styles.scss).
 */
@Component({
  selector: 'app-board',
  imports: [TaskPanelComponent, FormsModule],
  templateUrl: './board.component.html',
})
export class BoardComponent {
  private readonly session = inject(ProjectSessionService);

  protected readonly panel = signal<TaskPanelMode | null>(null);
  protected readonly dragOverStatus = signal<string | null>(null);
  protected readonly draggingTaskId = signal<string | null>(null);
  protected readonly draggingStatus = signal<string | null>(null);

  protected readonly renamingStatus = signal<string | null>(null);
  protected readonly renameDraft = signal('');
  protected readonly statusError = signal<string | null>(null);
  protected readonly addingStatus = signal(false);
  protected readonly newStatusName = signal('');

  private readonly statusRenameInput =
    viewChild<ElementRef<HTMLInputElement>>('statusRenameInput');
  private readonly newStatusInput = viewChild<ElementRef<HTMLInputElement>>('newStatusInput');

  /** Suppress card click after a successful task drag. */
  private suppressClick = false;

  protected readonly columns = computed(() => {
    const project = this.session.project();
    return project ? buildBoardColumns(project) : [];
  });

  constructor() {
    effect(() => {
      if (this.renamingStatus()) {
        queueMicrotask(() => {
          this.statusRenameInput()?.nativeElement.focus();
          this.statusRenameInput()?.nativeElement.select();
        });
      }
    });
    effect(() => {
      if (this.addingStatus()) {
        queueMicrotask(() => this.newStatusInput()?.nativeElement.focus());
      }
    });
  }

  protected onAddTask(status: string): void {
    this.panel.set({ kind: 'create', status });
  }

  protected onCardClick(task: TwTask): void {
    if (this.suppressClick) {
      this.suppressClick = false;
      return;
    }
    this.panel.set({ kind: 'edit', task: { ...task } });
  }

  protected onPanelClosed(): void {
    this.panel.set(null);
  }

  // --- Task drag (Story I) -------------------------------------------------

  protected onTaskDragStart(event: DragEvent, task: TwTask): void {
    if (!event.dataTransfer) {
      return;
    }
    event.dataTransfer.setData(DND_TASK_MIME, task.id);
    event.dataTransfer.setData('text/plain', task.id);
    event.dataTransfer.effectAllowed = 'move';
    this.draggingTaskId.set(task.id);
    this.draggingStatus.set(null);
    this.suppressClick = false;
  }

  protected onTaskDragEnd(): void {
    this.draggingTaskId.set(null);
    this.dragOverStatus.set(null);
  }

  // --- Column drop target (tasks + status reorder) -------------------------

  protected onColumnDragOver(event: DragEvent, status: string): void {
    event.preventDefault();
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = 'move';
    }
    this.dragOverStatus.set(status);
  }

  protected onColumnDragLeave(event: DragEvent, status: string): void {
    const related = event.relatedTarget as Node | null;
    const current = event.currentTarget as HTMLElement;
    if (related && current.contains(related)) {
      return;
    }
    if (this.dragOverStatus() === status) {
      this.dragOverStatus.set(null);
    }
  }

  protected async onColumnDrop(event: DragEvent, status: string): Promise<void> {
    event.preventDefault();
    this.dragOverStatus.set(null);

    const statusFrom =
      event.dataTransfer?.getData(DND_STATUS_MIME) || this.draggingStatus();
    if (statusFrom) {
      this.draggingStatus.set(null);
      await this.dropStatusOn(statusFrom, status);
      return;
    }

    const taskId =
      event.dataTransfer?.getData(DND_TASK_MIME) ||
      event.dataTransfer?.getData('text/plain') ||
      this.draggingTaskId();
    this.draggingTaskId.set(null);
    if (!taskId) {
      return;
    }
    this.suppressClick = true;
    await this.session.moveTask(taskId, status);
  }

  // --- Status management (Story K) -----------------------------------------

  protected onStatusDragStart(event: DragEvent, status: string): void {
    if (!event.dataTransfer) {
      return;
    }
    event.stopPropagation();
    event.dataTransfer.setData(DND_STATUS_MIME, status);
    event.dataTransfer.setData('text/plain', status);
    event.dataTransfer.effectAllowed = 'move';
    this.draggingStatus.set(status);
    this.draggingTaskId.set(null);
  }

  protected onStatusDragEnd(): void {
    this.draggingStatus.set(null);
    this.dragOverStatus.set(null);
  }

  protected async moveStatus(status: string, direction: -1 | 1): Promise<void> {
    this.statusError.set(null);
    const statuses = this.session.project()?.statuses ?? [];
    const from = statuses.indexOf(status);
    if (from < 0) {
      return;
    }
    const to = from + direction;
    if (to < 0 || to >= statuses.length) {
      return;
    }
    const result = await this.session.reorderStatuses(from, to);
    if (!result.ok) {
      this.statusError.set(result.message);
    }
  }

  protected startRename(status: string): void {
    this.statusError.set(null);
    this.renamingStatus.set(status);
    this.renameDraft.set(status);
  }

  protected cancelRename(): void {
    this.renamingStatus.set(null);
    this.renameDraft.set('');
  }

  protected onRenameKeydown(event: KeyboardEvent, oldName: string): void {
    if (event.key === 'Enter') {
      event.preventDefault();
      void this.commitRename(oldName);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      this.cancelRename();
    }
  }

  protected async commitRename(oldName: string): Promise<void> {
    if (this.renamingStatus() !== oldName) {
      return;
    }
    this.statusError.set(null);
    const result = await this.session.renameStatus(oldName, this.renameDraft());
    if (!result.ok) {
      this.statusError.set(result.message);
      return;
    }
    this.cancelRename();
  }

  protected async onDeleteStatus(status: string): Promise<void> {
    this.statusError.set(null);
    const result = await this.session.deleteStatus(status);
    if (!result.ok) {
      this.statusError.set(result.message);
    }
  }

  protected startAddStatus(): void {
    this.statusError.set(null);
    this.addingStatus.set(true);
    this.newStatusName.set('');
  }

  protected cancelAddStatus(): void {
    this.addingStatus.set(false);
    this.newStatusName.set('');
  }

  protected onAddStatusKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter') {
      event.preventDefault();
      void this.commitAddStatus();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      this.cancelAddStatus();
    }
  }

  protected async commitAddStatus(): Promise<void> {
    this.statusError.set(null);
    const result = await this.session.addStatus(this.newStatusName());
    if (!result.ok) {
      this.statusError.set(result.message);
      return;
    }
    this.cancelAddStatus();
  }

  private async dropStatusOn(fromStatus: string, toStatus: string): Promise<void> {
    this.statusError.set(null);
    const statuses = this.session.project()?.statuses ?? [];
    const from = statuses.indexOf(fromStatus);
    const to = statuses.indexOf(toStatus);
    if (from < 0 || to < 0 || from === to) {
      return;
    }
    const result = await this.session.reorderStatuses(from, to);
    if (!result.ok) {
      this.statusError.set(result.message);
    }
  }

  protected trackStatus(_index: number, column: { status: string }): string {
    return column.status;
  }

  protected trackTask(_index: number, task: TwTask): string {
    return task.id;
  }

  protected canMoveLeft(status: string): boolean {
    const statuses = this.session.project()?.statuses ?? [];
    return statuses.indexOf(status) > 0;
  }

  protected canMoveRight(status: string): boolean {
    const statuses = this.session.project()?.statuses ?? [];
    const i = statuses.indexOf(status);
    return i >= 0 && i < statuses.length - 1;
  }

  protected canDelete(column: { status: string; count: number }): boolean {
    const statuses = this.session.project()?.statuses ?? [];
    return column.count === 0 && statuses.length > 1;
  }
}
