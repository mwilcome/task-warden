import {
  Component,
  ElementRef,
  computed,
  effect,
  inject,
  signal,
  viewChild,
  DestroyRef,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { buildBoardColumns } from '../core/project/board-model';
import {
  ProjectSessionService,
  type SessionActionResult,
} from '../core/project/project-session.service';
import type { TwTask } from '../core/project/project.types';
import { OneAtATime, focusInput, onEnterOrEscape } from '../core/ui';
import {
  TaskPanelComponent,
  type TaskPanelMode,
} from '../task-panel/task-panel.component';

const COLUMN_DRAG_TYPE = 'application/x-task-warden-status';
/** Movement past this (px) is a drag; below it, the press opens the task. */
const TASK_DRAG_THRESHOLD_PX = 8;
const DRAG_SCROLL_EDGE_PX = 56;
const DRAG_SCROLL_MAX_STEP_PX = 22;

type TaskDrag = {
  taskId: string;
  title: string;
  fromStatus: string;
  pointerId: number;
  startX: number;
  startY: number;
  active: boolean;
  target: HTMLElement;
};

type DragPreview = {
  title: string;
  x: number;
  y: number;
  width: number;
};

@Component({
  selector: 'app-board',
  imports: [TaskPanelComponent, FormsModule],
  templateUrl: './board.component.html',
})
export class BoardComponent {
  private readonly session = inject(ProjectSessionService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly panel = signal<TaskPanelMode | null>(null);
  protected readonly dropColumn = signal<string | null>(null);
  protected readonly dropBeforeTaskId = signal<string | null>(null);
  protected readonly draggingTaskId = signal<string | null>(null);
  protected readonly draggingColumn = signal<string | null>(null);
  protected readonly dragPreview = signal<DragPreview | null>(null);

  protected readonly renamingStatus = signal<string | null>(null);
  protected readonly renameDraft = signal('');
  protected readonly statusError = signal<string | null>(null);
  private readonly renameLock = new OneAtATime();
  protected readonly addingStatus = signal(false);
  protected readonly newStatusName = signal('');
  private readonly addStatusLock = new OneAtATime();

  private readonly statusRenameInput =
    viewChild<ElementRef<HTMLInputElement>>('statusRenameInput');
  private readonly newStatusInput = viewChild<ElementRef<HTMLInputElement>>('newStatusInput');

  private taskDrag: TaskDrag | null = null;
  private dragPointerPos: { x: number; y: number } | null = null;
  private dragScrollRaf: number | null = null;
  private readonly onWinPointerMove = (e: PointerEvent) => this.handleTaskPointerMove(e);
  private readonly onWinPointerUp = (e: PointerEvent) => void this.handleTaskPointerUp(e);
  private readonly onWinPointerCancel = (e: PointerEvent) => void this.handleTaskPointerUp(e);

  protected readonly columns = computed(() => {
    const project = this.session.project();
    return project ? buildBoardColumns(project) : [];
  });

  constructor() {
    effect(() => {
      if (this.renamingStatus()) {
        queueMicrotask(() => focusInput(this.statusRenameInput()));
      }
    });
    effect(() => {
      if (this.addingStatus()) {
        queueMicrotask(() => focusInput(this.newStatusInput(), false));
      }
    });

    this.destroyRef.onDestroy(() => {
      this.removeTaskDragListeners();
      this.stopDragScrollLoop();
    });
  }

  protected onAddTask(status: string): void {
    this.panel.set({ kind: 'create', status });
  }

  protected onCardKeydown(event: KeyboardEvent, task: TwTask): void {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      this.panel.set({ kind: 'edit', task: { ...task } });
    }
  }

  protected onPanelClosed(): void {
    this.panel.set(null);
  }

  protected onTaskPointerDown(event: PointerEvent, task: TwTask): void {
    if (event.button !== 0 && event.pointerType === 'mouse') {
      return;
    }
    if (this.taskDrag) {
      return;
    }

    const target = event.currentTarget as HTMLElement;
    this.taskDrag = {
      taskId: task.id,
      title: task.title,
      fromStatus: task.status,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      active: false,
      target,
    };

    window.addEventListener('pointermove', this.onWinPointerMove, { passive: false });
    window.addEventListener('pointerup', this.onWinPointerUp);
    window.addEventListener('pointercancel', this.onWinPointerCancel);
  }

  private handleTaskPointerMove(event: PointerEvent): void {
    const drag = this.taskDrag;
    if (!drag || event.pointerId !== drag.pointerId) {
      return;
    }

    const dx = event.clientX - drag.startX;
    const dy = event.clientY - drag.startY;

    if (!drag.active) {
      if (Math.hypot(dx, dy) < TASK_DRAG_THRESHOLD_PX) {
        return;
      }
      drag.active = true;
      this.draggingTaskId.set(drag.taskId);
      this.draggingColumn.set(null);
      try {
        drag.target.setPointerCapture(event.pointerId);
      } catch {
        /* setPointerCapture can throw; window listeners still receive moves */
      }
      document.body.classList.add('is-dragging-task');
      const rect = drag.target.getBoundingClientRect();
      this.dragPreview.set({
        title: drag.title,
        x: event.clientX - rect.width / 2,
        y: event.clientY - rect.height / 2,
        width: rect.width,
      });
      this.dragPointerPos = { x: event.clientX, y: event.clientY };
      this.startDragScrollLoop();
    }

    event.preventDefault();
    this.dragPointerPos = { x: event.clientX, y: event.clientY };
    this.applyDragAutoScroll(event.clientX, event.clientY);
    this.updateDragVisuals(event.clientX, event.clientY);
  }

  private async handleTaskPointerUp(event: PointerEvent): Promise<void> {
    const drag = this.taskDrag;
    if (!drag || event.pointerId !== drag.pointerId) {
      return;
    }

    const wasActive = drag.active;
    const taskId = drag.taskId;
    const insert = wasActive
      ? this.taskInsertPoint(event.clientX, event.clientY, taskId)
      : null;

    this.stopDragScrollLoop();
    this.removeTaskDragListeners();
    try {
      drag.target.releasePointerCapture(event.pointerId);
    } catch {
      /* already released */
    }
    this.taskDrag = null;
    this.draggingTaskId.set(null);
    this.dropColumn.set(null);
    this.dropBeforeTaskId.set(null);
    this.dragPreview.set(null);
    document.body.classList.remove('is-dragging-task');

    if (!wasActive) {
      const task = this.session.project()?.tasks.find((t) => t.id === taskId);
      if (task) {
        this.panel.set({ kind: 'edit', task: { ...task } });
      }
      return;
    }

    if (insert) {
      await this.session.moveTask(taskId, insert.status, insert.beforeTaskId);
    }
  }

  private updateDragVisuals(clientX: number, clientY: number): void {
    const preview = this.dragPreview();
    if (preview) {
      this.dragPreview.set({
        ...preview,
        x: clientX - preview.width / 2,
        y: clientY - 20,
      });
    }
    const insert = this.taskInsertPoint(clientX, clientY, this.draggingTaskId() ?? '');
    const column = insert?.status ?? null;
    const beforeId = insert?.beforeTaskId ?? null;
    if (column !== this.dropColumn()) {
      this.dropColumn.set(column);
    }
    if (beforeId !== this.dropBeforeTaskId()) {
      this.dropBeforeTaskId.set(beforeId);
    }
  }

  private edgeScrollDelta(pos: number, start: number, end: number): number {
    const edge = DRAG_SCROLL_EDGE_PX;
    const maxStep = DRAG_SCROLL_MAX_STEP_PX;
    if (pos < start + edge) {
      return -Math.ceil(maxStep * Math.min(1, (start + edge - pos) / edge));
    }
    if (pos > end - edge) {
      return Math.ceil(maxStep * Math.min(1, (pos - (end - edge)) / edge));
    }
    return 0;
  }

  private applyDragAutoScroll(clientX: number, clientY: number): void {
    const board = document.querySelector('.app-main--board') as HTMLElement | null;
    if (board) {
      const rect = board.getBoundingClientRect();
      const stepX = this.edgeScrollDelta(clientX, rect.left, rect.right);
      if (stepX !== 0) {
        board.scrollLeft += stepX;
      }
    }

    const cards = this.cardsListUnderPoint(clientX, clientY);
    if (cards) {
      const rect = cards.getBoundingClientRect();
      const stepY = this.edgeScrollDelta(clientY, rect.top, rect.bottom);
      if (stepY !== 0) {
        cards.scrollTop += stepY;
      }
    }
  }

  /** Continues edge-scroll when the pointer is held still in the band. */
  private startDragScrollLoop(): void {
    if (this.dragScrollRaf !== null) {
      return;
    }
    const tick = (): void => {
      this.dragScrollRaf = null;
      if (!this.taskDrag?.active || !this.dragPointerPos) {
        return;
      }
      this.applyDragAutoScroll(this.dragPointerPos.x, this.dragPointerPos.y);
      this.updateDragVisuals(this.dragPointerPos.x, this.dragPointerPos.y);
      this.dragScrollRaf = requestAnimationFrame(tick);
    };
    this.dragScrollRaf = requestAnimationFrame(tick);
  }

  private stopDragScrollLoop(): void {
    if (this.dragScrollRaf !== null) {
      cancelAnimationFrame(this.dragScrollRaf);
      this.dragScrollRaf = null;
    }
    this.dragPointerPos = null;
  }

  private closestFromPoint(x: number, y: number, selector: string): Element | null {
    for (const el of document.elementsFromPoint(x, y)) {
      if (!(el instanceof Element)) {
        continue;
      }
      const match = el.closest(selector);
      if (match) {
        return match;
      }
    }
    return null;
  }

  private cardsListUnderPoint(x: number, y: number): HTMLElement | null {
    const el = this.closestFromPoint(x, y, '.board-column__cards');
    return el instanceof HTMLElement ? el : null;
  }

  private columnUnderPoint(x: number, y: number): string | null {
    return (
      this.closestFromPoint(x, y, '[data-board-status]')?.getAttribute('data-board-status') ??
      null
    );
  }

  private taskInsertPoint(
    x: number,
    y: number,
    draggingId: string,
  ): { status: string; beforeTaskId: string | null } | null {
    const status = this.columnUnderPoint(x, y);
    if (!status) {
      return null;
    }

    let hoverCard: HTMLElement | null = null;
    for (const el of document.elementsFromPoint(x, y)) {
      if (!(el instanceof Element)) {
        continue;
      }
      const card = el.closest('.task-card');
      if (card instanceof HTMLElement && card.dataset['taskId'] !== draggingId) {
        hoverCard = card;
        break;
      }
    }

    if (!hoverCard) {
      const columnTasks = this.columns().find((c) => c.status === status)?.tasks ?? [];
      const i = columnTasks.findIndex((t) => t.id === draggingId);
      return { status, beforeTaskId: i >= 0 ? (columnTasks[i + 1]?.id ?? null) : null };
    }

    const hoverId = hoverCard.dataset['taskId'] ?? null;
    if (!hoverId) {
      return { status, beforeTaskId: null };
    }

    const rect = hoverCard.getBoundingClientRect();
    if (y < rect.top + rect.height / 2) {
      return { status, beforeTaskId: hoverId };
    }

    const columnTasks = this.columns().find((c) => c.status === status)?.tasks ?? [];
    let next = columnTasks.findIndex((t) => t.id === hoverId) + 1;
    if (columnTasks[next]?.id === draggingId) {
      next += 1;
    }
    return { status, beforeTaskId: columnTasks[next]?.id ?? null };
  }

  private removeTaskDragListeners(): void {
    window.removeEventListener('pointermove', this.onWinPointerMove);
    window.removeEventListener('pointerup', this.onWinPointerUp);
    window.removeEventListener('pointercancel', this.onWinPointerCancel);
  }

  protected onColumnDragOver(event: DragEvent, status: string): void {
    if (!this.draggingColumn()) {
      return;
    }
    event.preventDefault();
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = 'move';
    }
    if (this.dropColumn() !== status) {
      this.dropColumn.set(status);
    }
  }

  protected onColumnDragLeave(event: DragEvent, status: string): void {
    const related = event.relatedTarget as Node | null;
    const current = event.currentTarget as HTMLElement;
    if (related && current.contains(related)) {
      return;
    }
    if (this.dropColumn() === status) {
      this.dropColumn.set(null);
    }
  }

  protected async onColumnDrop(event: DragEvent, status: string): Promise<void> {
    event.preventDefault();
    this.dropColumn.set(null);

    const from = event.dataTransfer?.getData(COLUMN_DRAG_TYPE) || this.draggingColumn();
    this.draggingColumn.set(null);
    if (!from) {
      return;
    }
    await this.reorderColumns(from, status);
  }

  protected onStatusDragStart(event: DragEvent, status: string): void {
    if (!event.dataTransfer || this.renamingStatus() === status) {
      event.preventDefault();
      return;
    }
    event.stopPropagation();
    event.dataTransfer.setData(COLUMN_DRAG_TYPE, status);
    event.dataTransfer.setData('text/plain', status);
    event.dataTransfer.effectAllowed = 'move';
    this.draggingColumn.set(status);
    this.draggingTaskId.set(null);
  }

  protected onStatusDragEnd(): void {
    this.draggingColumn.set(null);
    this.dropColumn.set(null);
  }

  protected async moveStatus(status: string, direction: -1 | 1): Promise<void> {
    const from = this.columnIndex(status);
    await this.reorderByIndex(from, from + direction);
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
    onEnterOrEscape(
      event,
      () => void this.commitRename(oldName),
      () => this.cancelRename(),
    );
  }

  protected async commitRename(oldName: string): Promise<void> {
    if (this.renamingStatus() !== oldName) {
      return;
    }
    await this.renameLock.run(async () => {
      if (await this.runBoardAction(() => this.session.renameStatus(oldName, this.renameDraft()))) {
        this.cancelRename();
      }
    });
  }

  protected async onDeleteStatus(status: string): Promise<void> {
    await this.runBoardAction(() => this.session.deleteStatus(status));
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
    onEnterOrEscape(
      event,
      () => void this.commitAddStatus(),
      () => this.cancelAddStatus(),
    );
  }

  protected async commitAddStatus(): Promise<void> {
    if (!this.addingStatus()) {
      return;
    }
    await this.addStatusLock.run(async () => {
      if (await this.runBoardAction(() => this.session.addStatus(this.newStatusName()))) {
        this.cancelAddStatus();
      }
    });
  }

  protected canMoveLeft(status: string): boolean {
    return this.columnIndex(status) > 0;
  }

  protected canMoveRight(status: string): boolean {
    const i = this.columnIndex(status);
    return i >= 0 && i < this.columnNames().length - 1;
  }

  protected canDelete(column: { status: string; count: number }): boolean {
    return column.count === 0 && this.columnNames().length > 1;
  }

  private columnNames(): string[] {
    return this.session.project()?.statuses ?? [];
  }

  private columnIndex(status: string): number {
    return this.columnNames().indexOf(status);
  }

  private async reorderColumns(fromStatus: string, toStatus: string): Promise<void> {
    await this.reorderByIndex(this.columnIndex(fromStatus), this.columnIndex(toStatus));
  }

  private async reorderByIndex(from: number, to: number): Promise<void> {
    const names = this.columnNames();
    if (from < 0 || to < 0 || from === to || to >= names.length) {
      return;
    }
    await this.runBoardAction(() => this.session.reorderStatuses(from, to));
  }

  private async runBoardAction(
    action: () => Promise<SessionActionResult>,
  ): Promise<boolean> {
    this.statusError.set(null);
    const result = await action();
    if (!result.ok) {
      this.statusError.set(result.message);
      return false;
    }
    return true;
  }
}
