import { Injectable, computed, inject, signal } from '@angular/core';
import {
  FileSystemUnsupportedError,
  ProjectFileRepository,
  UserCancelledFilePickerError,
} from '../fs/project-file.repository';
import { createEmptyProject } from './create-empty-project';
import { INVALID_FILE_MESSAGE, type TwProject } from './project.types';
import {
  addStatus,
  deleteStatus,
  renameStatus,
  reorderStatuses,
} from './status-ops';
import {
  addTask,
  applyTaskUpdate,
  buildNewTask,
  findTask,
  moveTaskToStatus,
  removeTask,
  renameProject,
  replaceTask,
  type CreateTaskInput,
  type UpdateTaskInput,
} from './task-ops';
import { parseAndValidateProject } from './validate-project';

/** Exact auto-save failure copy (MVP global rules / Story C). */
export const SAVE_FAILED_MESSAGE =
  'Save failed – changes are only in memory. Try again or refresh.';

export type SessionActionResult =
  | { ok: true }
  | { ok: false; message: string; cancelled?: boolean };

/**
 * Application service: open project session for the current browser tab.
 * Holds in-memory project + file handle; auto-saves after mutations.
 * File handle is NOT restored across reloads (MVP).
 */
@Injectable({ providedIn: 'root' })
export class ProjectSessionService {
  private readonly files = inject(ProjectFileRepository);

  private readonly projectSignal = signal<TwProject | null>(null);
  private readonly fileNameSignal = signal<string | null>(null);
  private readonly saveErrorSignal = signal<string | null>(null);
  private readonly uiErrorSignal = signal<string | null>(null);
  private readonly busySignal = signal(false);

  private fileHandle: FileSystemFileHandle | null = null;

  readonly project = this.projectSignal.asReadonly();
  readonly fileName = this.fileNameSignal.asReadonly();
  readonly saveError = this.saveErrorSignal.asReadonly();
  readonly uiError = this.uiErrorSignal.asReadonly();
  readonly busy = this.busySignal.asReadonly();
  readonly hasProject = computed(() => this.projectSignal() !== null);
  readonly fileSystemSupported = this.files.isSupported();

  /**
   * New Project: create template in memory, prompt to save `.tw.json`, keep handle.
   * If the user cancels the save dialog, no session is opened.
   */
  async newProject(): Promise<SessionActionResult> {
    this.uiErrorSignal.set(null);
    if (!this.files.isSupported()) {
      const message = new FileSystemUnsupportedError().message;
      this.uiErrorSignal.set(message);
      return { ok: false, message };
    }

    this.busySignal.set(true);
    try {
      const project = createEmptyProject();
      const suggested = `${this.slugFileName(project.name)}.tw.json`;
      const { handle, fileName } = await this.files.pickLocationAndWrite(project, suggested);
      this.fileHandle = handle;
      this.projectSignal.set(project);
      this.fileNameSignal.set(fileName);
      this.saveErrorSignal.set(null);
      return { ok: true };
    } catch (error) {
      if (error instanceof UserCancelledFilePickerError) {
        return { ok: false, message: error.message, cancelled: true };
      }
      const message = this.messageFrom(error);
      this.uiErrorSignal.set(message);
      return { ok: false, message };
    } finally {
      this.busySignal.set(false);
    }
  }

  /**
   * Open Project: pick file, parse + validate, load into memory, keep handle.
   */
  async openProject(): Promise<SessionActionResult> {
    this.uiErrorSignal.set(null);
    if (!this.files.isSupported()) {
      const message = new FileSystemUnsupportedError().message;
      this.uiErrorSignal.set(message);
      return { ok: false, message };
    }

    this.busySignal.set(true);
    try {
      const opened = await this.files.pickAndRead();
      const validation = parseAndValidateProject(opened.text);
      if (!validation.ok) {
        const message = validation.reason
          ? `${validation.message}: ${validation.reason}`
          : validation.message;
        this.uiErrorSignal.set(message);
        return { ok: false, message };
      }

      this.fileHandle = opened.handle;
      this.projectSignal.set(validation.project);
      this.fileNameSignal.set(opened.fileName);
      this.saveErrorSignal.set(null);
      return { ok: true };
    } catch (error) {
      if (error instanceof UserCancelledFilePickerError) {
        return { ok: false, message: error.message, cancelled: true };
      }
      const message = this.messageFrom(error);
      this.uiErrorSignal.set(message);
      return { ok: false, message };
    } finally {
      this.busySignal.set(false);
    }
  }

  /**
   * Apply a pure mutation to the in-memory project, then auto-save the entire object.
   * On save failure: keep memory, set non-blocking save banner (MVP).
   */
  async updateProject(
    mutator: (current: TwProject) => TwProject,
  ): Promise<SessionActionResult> {
    const current = this.projectSignal();
    if (!current || !this.fileHandle) {
      return { ok: false, message: 'No project file is open.' };
    }

    const next = mutator(structuredClone(current));
    this.projectSignal.set(next);

    try {
      await this.files.write(this.fileHandle, next);
      this.saveErrorSignal.set(null);
      return { ok: true };
    } catch {
      this.saveErrorSignal.set(SAVE_FAILED_MESSAGE);
      return { ok: false, message: SAVE_FAILED_MESSAGE };
    }
  }

  /** Story F: create task in a column and auto-save. */
  async createTask(input: CreateTaskInput): Promise<SessionActionResult> {
    const current = this.projectSignal();
    if (!current) {
      return { ok: false, message: 'No project file is open.' };
    }
    const built = buildNewTask(input, current.statuses);
    if (!built.ok) {
      return { ok: false, message: built.reason };
    }
    return this.updateProject((p) => addTask(p, built.value));
  }

  /** Story G: update task fields and auto-save. */
  async saveTask(taskId: string, input: UpdateTaskInput): Promise<SessionActionResult> {
    const current = this.projectSignal();
    if (!current) {
      return { ok: false, message: 'No project file is open.' };
    }
    const existing = findTask(current, taskId);
    if (!existing) {
      return { ok: false, message: 'Task not found.' };
    }
    const updated = applyTaskUpdate(existing, input, current.statuses);
    if (!updated.ok) {
      return { ok: false, message: updated.reason };
    }
    return this.updateProject((p) => replaceTask(p, updated.value));
  }

  /** Story H: delete task and auto-save. */
  async deleteTask(taskId: string): Promise<SessionActionResult> {
    const current = this.projectSignal();
    if (!current) {
      return { ok: false, message: 'No project file is open.' };
    }
    if (!findTask(current, taskId)) {
      return { ok: false, message: 'Task not found.' };
    }
    return this.updateProject((p) => removeTask(p, taskId));
  }

  /** Story I: drag task to another column; auto-save. */
  async moveTask(taskId: string, newStatus: string): Promise<SessionActionResult> {
    const current = this.projectSignal();
    if (!current) {
      return { ok: false, message: 'No project file is open.' };
    }
    const moved = moveTaskToStatus(current, taskId, newStatus);
    if (!moved.ok) {
      return { ok: false, message: moved.reason };
    }
    if (moved.value === current) {
      return { ok: true };
    }
    return this.updateProject(() => moved.value);
  }

  /** Story J: rename project; auto-save. */
  async setProjectName(name: string): Promise<SessionActionResult> {
    const current = this.projectSignal();
    if (!current) {
      return { ok: false, message: 'No project file is open.' };
    }
    const renamed = renameProject(current, name);
    if (!renamed.ok) {
      return { ok: false, message: renamed.reason };
    }
    if (renamed.value === current || renamed.value.name === current.name) {
      // Still normalize display if only whitespace differed after trim of same name
      if (renamed.value.name !== current.name) {
        return this.updateProject(() => renamed.value);
      }
      return { ok: true };
    }
    return this.updateProject(() => renamed.value);
  }

  /** Story K: append status column. */
  async addStatus(name: string): Promise<SessionActionResult> {
    const current = this.projectSignal();
    if (!current) {
      return { ok: false, message: 'No project file is open.' };
    }
    const result = addStatus(current, name);
    if (!result.ok) {
      return { ok: false, message: result.reason };
    }
    return this.updateProject(() => result.value);
  }

  /** Story K: rename status + task status values. */
  async renameStatus(oldName: string, newName: string): Promise<SessionActionResult> {
    const current = this.projectSignal();
    if (!current) {
      return { ok: false, message: 'No project file is open.' };
    }
    const result = renameStatus(current, oldName, newName);
    if (!result.ok) {
      return { ok: false, message: result.reason };
    }
    if (result.value === current) {
      return { ok: true };
    }
    return this.updateProject(() => result.value);
  }

  /** Story K: reorder statuses by index. */
  async reorderStatuses(fromIndex: number, toIndex: number): Promise<SessionActionResult> {
    const current = this.projectSignal();
    if (!current) {
      return { ok: false, message: 'No project file is open.' };
    }
    const result = reorderStatuses(current, fromIndex, toIndex);
    if (!result.ok) {
      return { ok: false, message: result.reason };
    }
    if (result.value === current) {
      return { ok: true };
    }
    return this.updateProject(() => result.value);
  }

  /** Story K: delete empty status only. */
  async deleteStatus(name: string): Promise<SessionActionResult> {
    const current = this.projectSignal();
    if (!current) {
      return { ok: false, message: 'No project file is open.' };
    }
    const result = deleteStatus(current, name);
    if (!result.ok) {
      return { ok: false, message: result.reason };
    }
    return this.updateProject(() => result.value);
  }

  /** Retry writing the current in-memory project to the open handle. */
  async retrySave(): Promise<SessionActionResult> {
    const current = this.projectSignal();
    if (!current || !this.fileHandle) {
      return { ok: false, message: 'No project file is open.' };
    }
    try {
      await this.files.write(this.fileHandle, current);
      this.saveErrorSignal.set(null);
      return { ok: true };
    } catch {
      this.saveErrorSignal.set(SAVE_FAILED_MESSAGE);
      return { ok: false, message: SAVE_FAILED_MESSAGE };
    }
  }

  /**
   * Re-read the open file handle from disk, validate, replace memory.
   * On invalid file or I/O error: keep previous in-memory project, set uiError.
   */
  async reloadFromDisk(): Promise<SessionActionResult> {
    if (!this.fileHandle) {
      const message = 'No project file is open.';
      this.uiErrorSignal.set(message);
      return { ok: false, message };
    }

    this.busySignal.set(true);
    this.uiErrorSignal.set(null);
    try {
      const { text, fileName } = await this.files.readHandle(this.fileHandle);
      const validation = parseAndValidateProject(text);
      if (!validation.ok) {
        const message = validation.reason
          ? `${validation.message}: ${validation.reason}`
          : validation.message;
        this.uiErrorSignal.set(message);
        return { ok: false, message };
      }

      this.projectSignal.set(validation.project);
      this.fileNameSignal.set(fileName);
      this.saveErrorSignal.set(null);
      return { ok: true };
    } catch (error) {
      const message = this.messageFrom(error);
      this.uiErrorSignal.set(message);
      return { ok: false, message };
    } finally {
      this.busySignal.set(false);
    }
  }

  /** Close session in memory only (does not delete the file). Next visit must re-open. */
  closeProject(): void {
    this.fileHandle = null;
    this.projectSignal.set(null);
    this.fileNameSignal.set(null);
    this.saveErrorSignal.set(null);
    this.uiErrorSignal.set(null);
  }

  clearUiError(): void {
    this.uiErrorSignal.set(null);
  }

  private slugFileName(name: string): string {
    const slug = name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
    return slug || 'untitled';
  }

  private messageFrom(error: unknown): string {
    if (error instanceof FileSystemUnsupportedError) {
      return error.message;
    }
    if (error instanceof Error && error.message) {
      return error.message;
    }
    return INVALID_FILE_MESSAGE;
  }
}
