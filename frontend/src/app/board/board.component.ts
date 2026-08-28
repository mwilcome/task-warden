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
import { ProjectSessionService } from '../core/project/project-session.service';
import type { TwTask } from '../core/project/project.types';

const DND_STATUS_MIME = 'application/x-task-warden-status';
/** Pixels of movement before a press becomes a task drag (keeps click-to-edit). */
const TASK_DRAG_THRESHOLD_PX = 8;
/** Edge band (px) that triggers board/column auto-scroll while dragging a task. */
const DRAG_SCROLL_EDGE_PX = 56;
/** Max px per animation frame for auto-scroll (scales up near the edge). */
const DRAG_SCROLL_MAX_STEP_PX = 22;

type TaskPointerSession = {
  taskId: string;
  title: string;
  fromStatus: string;
  pointerId: number;
  startX: number;
  startY: number;
  /** True after movement exceeds threshold */
  active: boolean;
  /** Element that received pointerdown (for release capture) */
  target: HTMLElement;
};

type TaskGhost = {
  title: string;
  x: number;
  y: number;
  width: number;
};

/**
 * Kanban board: columns, cards, panels, pointer task drag, status management.
 * Task move uses pointer events (desktop + mobile). Column reorder still supports
 * HTML5 drag on the title row plus ← → buttons.
 * Styles: global classes only (src/styles.scss).
 */
@Component({
  selector: 'app-board',
  imports: [FormsModule],
  templateUrl: './board.component.html',
})
export class BoardComponent {
  private readonly session = inject(ProjectSessionService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly dragOverStatus = signal<string | null>(null);
  protected readonly draggingTaskId = signal<string | null>(null);
  protected readonly draggingStatus = signal<string | null>(null);
  protected readonly taskGhost = signal<TaskGhost | null>(null);

  protected readonly renamingStatus = signal<string | null>(null);
  protected readonly renameDraft = signal('');
  protected readonly statusError = signal<string | null>(null);
  /** Enter and blur both call commitRename; ignore the second while the first await is open. */
  private renameCommitInFlight = false;
  protected readonly addingStatus = signal(false);
  protected readonly newStatusName = signal('');

  private readonly statusRenameInput =
    viewChild<ElementRef<HTMLInputElement>>('statusRenameInput');
  private readonly newStatusInput = viewChild<ElementRef<HTMLInputElement>>('newStatusInput');

  private taskPointer: TaskPointerSession | null = null;
  /** Last pointer position while dragging (for continuous edge auto-scroll). */
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

    this.destroyRef.onDestroy(() => {
      this.teardownTaskPointerListeners();
      this.stopDragScrollLoop();
    });
  }

  protected onAddTask(status: string): void {
    this.session.openTaskPanel({ kind: 'create', status });
  }

  protected onCardKeydown(event: KeyboardEvent, task: TwTask): void {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      this.session.openTaskPanel({ kind: 'edit', task: { ...task } });
    }
  }

  // --- Task pointer drag (desktop + mobile) --------------------------------

  protected onTaskPointerDown(event: PointerEvent, task: TwTask): void {
    if (event.button !== 0 && event.pointerType === 'mouse') {
      return;
    }
    if (this.taskPointer) {
      return;
    }

    const target = event.currentTarget as HTMLElement;
    this.taskPointer = {
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
    const session = this.taskPointer;
    if (!session || event.pointerId !== session.pointerId) {
      return;
    }

    const dx = event.clientX - session.startX;
    const dy = event.clientY - session.startY;

    if (!session.active) {
      if (Math.hypot(dx, dy) < TASK_DRAG_THRESHOLD_PX) {
        return;
      }
      /* Any direction past threshold: real task drag (not scroll). */
      session.active = true;
      this.draggingTaskId.set(session.taskId);
      this.draggingStatus.set(null);
      try {
        session.target.setPointerCapture(event.pointerId);
      } catch {
        /* some browsers may reject capture; window listeners still work */
      }
      document.body.classList.add('is-task-dragging');
      const rect = session.target.getBoundingClientRect();
      this.taskGhost.set({
        title: session.title,
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
    const session = this.taskPointer;
    if (!session || event.pointerId !== session.pointerId) {
      return;
    }

    const wasActive = session.active;
    const taskId = session.taskId;
    const dropStatus = wasActive
      ? this.statusUnderPoint(event.clientX, event.clientY)
      : null;

    this.stopDragScrollLoop();
    this.teardownTaskPointerListeners();
    try {
      session.target.releasePointerCapture(event.pointerId);
    } catch {
      /* ignore */
    }
    this.taskPointer = null;
    this.draggingTaskId.set(null);
    this.dragOverStatus.set(null);
    this.taskGhost.set(null);
    document.body.classList.remove('is-task-dragging');

    if (!wasActive) {
      const project = this.session.project();
      const task = project?.tasks.find((t) => t.id === taskId);
      if (task) {
        this.session.openTaskPanel({ kind: 'edit', task: { ...task } });
      }
      return;
    }

    if (dropStatus && dropStatus !== session.fromStatus) {
      await this.session.moveTask(taskId, dropStatus);
    }
  }

  private updateDragVisuals(clientX: number, clientY: number): void {
    const ghost = this.taskGhost();
    if (ghost) {
      this.taskGhost.set({
        ...ghost,
        x: clientX - ghost.width / 2,
        y: clientY - 20,
      });
    }
    const status = this.statusUnderPoint(clientX, clientY);
    if (status !== this.dragOverStatus()) {
      this.dragOverStatus.set(status);
    }
  }

  /**
   * While dragging near the left/right of the board scrollport, pan the board.
   * Near top/bottom of a column's card list, scroll that list.
   */
  private applyDragAutoScroll(clientX: number, clientY: number): void {
    const board = document.querySelector('.app-main--board') as HTMLElement | null;
    if (board) {
      const rect = board.getBoundingClientRect();
      const edge = DRAG_SCROLL_EDGE_PX;
      const maxStep = DRAG_SCROLL_MAX_STEP_PX;
      let stepX = 0;
      if (clientX < rect.left + edge) {
        const t = Math.min(1, (rect.left + edge - clientX) / edge);
        stepX = -Math.ceil(maxStep * t);
      } else if (clientX > rect.right - edge) {
        const t = Math.min(1, (clientX - (rect.right - edge)) / edge);
        stepX = Math.ceil(maxStep * t);
      }
      if (stepX !== 0) {
        board.scrollLeft += stepX;
      }
    }

    const cards = this.cardsListUnderPoint(clientX, clientY);
    if (cards) {
      const rect = cards.getBoundingClientRect();
      const edge = DRAG_SCROLL_EDGE_PX;
      const maxStep = DRAG_SCROLL_MAX_STEP_PX;
      let stepY = 0;
      if (clientY < rect.top + edge) {
        const t = Math.min(1, (rect.top + edge - clientY) / edge);
        stepY = -Math.ceil(maxStep * t);
      } else if (clientY > rect.bottom - edge) {
        const t = Math.min(1, (clientY - (rect.bottom - edge)) / edge);
        stepY = Math.ceil(maxStep * t);
      }
      if (stepY !== 0) {
        cards.scrollTop += stepY;
      }
    }
  }

  /** Keep scrolling if the pointer stays in the edge band without moving. */
  private startDragScrollLoop(): void {
    if (this.dragScrollRaf !== null) {
      return;
    }
    const tick = (): void => {
      this.dragScrollRaf = null;
      if (!this.taskPointer?.active || !this.dragPointerPos) {
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

  private cardsListUnderPoint(x: number, y: number): HTMLElement | null {
    const stack = document.elementsFromPoint(x, y);
    for (const el of stack) {
      if (!(el instanceof Element)) {
        continue;
      }
      const cards = el.closest('.board-column__cards');
      if (cards instanceof HTMLElement) {
        return cards;
      }
    }
    return null;
  }

  private statusUnderPoint(x: number, y: number): string | null {
    const stack = document.elementsFromPoint(x, y);
    for (const el of stack) {
      if (!(el instanceof Element)) {
        continue;
      }
      const col = el.closest('[data-board-status]');
      if (col) {
        return col.getAttribute('data-board-status');
      }
    }
    return null;
  }

  private teardownTaskPointerListeners(): void {
    window.removeEventListener('pointermove', this.onWinPointerMove);
    window.removeEventListener('pointerup', this.onWinPointerUp);
    window.removeEventListener('pointercancel', this.onWinPointerCancel);
  }

  // --- Column drop target (status reorder via HTML5 only) ------------------

  protected onColumnDragOver(event: DragEvent, status: string): void {
    if (!this.draggingStatus()) {
      return;
    }
    event.preventDefault();
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = 'move';
    }
    if (this.dragOverStatus() !== status) {
      this.dragOverStatus.set(status);
    }
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
    this.draggingStatus.set(null);
    if (!statusFrom) {
      return;
    }
    await this.dropStatusOn(statusFrom, status);
  }

  // --- Status management ---------------------------------------------------

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
    if (this.renamingStatus() !== oldName || this.renameCommitInFlight) {
      return;
    }
    this.renameCommitInFlight = true;
    this.statusError.set(null);
    try {
      const result = await this.session.renameStatus(oldName, this.renameDraft());
      if (!result.ok) {
        this.statusError.set(result.message);
        return;
      }
      this.cancelRename();
    } finally {
      this.renameCommitInFlight = false;
    }
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
