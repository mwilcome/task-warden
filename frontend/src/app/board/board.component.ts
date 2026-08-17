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
import {
  TaskPanelComponent,
  type TaskPanelMode,
} from '../task-panel/task-panel.component';

const DND_STATUS_MIME = 'application/x-task-warden-status';
/** Movement past this (px) is a drag; below it, the press opens the task. */
const TASK_DRAG_THRESHOLD_PX = 8;
const DRAG_SCROLL_EDGE_PX = 56;
const DRAG_SCROLL_MAX_STEP_PX = 22;

type TaskPointerSession = {
  taskId: string;
  title: string;
  fromStatus: string;
  pointerId: number;
  startX: number;
  startY: number;
  active: boolean;
  target: HTMLElement;
};

type TaskGhost = {
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
  protected readonly dragOverStatus = signal<string | null>(null);
  protected readonly draggingTaskId = signal<string | null>(null);
  protected readonly draggingStatus = signal<string | null>(null);
  protected readonly taskGhost = signal<TaskGhost | null>(null);

  protected readonly renamingStatus = signal<string | null>(null);
  protected readonly renameDraft = signal('');
  protected readonly statusError = signal<string | null>(null);
  /** Enter and blur both commit; drop the second call while the first await is open. */
  private renameCommitInFlight = false;
  protected readonly addingStatus = signal(false);
  protected readonly newStatusName = signal('');
  private addStatusCommitInFlight = false;

  private readonly statusRenameInput =
    viewChild<ElementRef<HTMLInputElement>>('statusRenameInput');
  private readonly newStatusInput = viewChild<ElementRef<HTMLInputElement>>('newStatusInput');

  private taskPointer: TaskPointerSession | null = null;
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
      session.active = true;
      this.draggingTaskId.set(session.taskId);
      this.draggingStatus.set(null);
      try {
        session.target.setPointerCapture(event.pointerId);
      } catch {
        /* setPointerCapture can throw; window listeners still receive moves */
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
      /* already released */
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
        this.panel.set({ kind: 'edit', task: { ...task } });
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

  private statusUnderPoint(x: number, y: number): string | null {
    return (
      this.closestFromPoint(x, y, '[data-board-status]')?.getAttribute('data-board-status') ??
      null
    );
  }

  private teardownTaskPointerListeners(): void {
    window.removeEventListener('pointermove', this.onWinPointerMove);
    window.removeEventListener('pointerup', this.onWinPointerUp);
    window.removeEventListener('pointercancel', this.onWinPointerCancel);
  }

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

  protected onStatusDragStart(event: DragEvent, status: string): void {
    if (!event.dataTransfer || this.renamingStatus() === status) {
      event.preventDefault();
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
    if (!this.addingStatus() || this.addStatusCommitInFlight) {
      return;
    }
    this.addStatusCommitInFlight = true;
    this.statusError.set(null);
    try {
      const result = await this.session.addStatus(this.newStatusName());
      if (!result.ok) {
        this.statusError.set(result.message);
        return;
      }
      this.cancelAddStatus();
    } finally {
      this.addStatusCommitInFlight = false;
    }
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
