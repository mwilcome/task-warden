import { Injectable, computed, inject, signal } from '@angular/core';
import {
  FileSystemUnsupportedError,
  ProjectFileRepository,
  UserCancelledFilePickerError,
} from '../fs/project-file.repository';
import { RecentProjectsService } from '../fs/recent-projects.service';
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
} from './task-ops';
import { parseAndValidateProject } from './validate-project';

/** Exact auto-save failure copy. */
export const SAVE_FAILED_MESSAGE =
  'Save failed – changes are only in memory. Try again or refresh.';

export type SessionActionResult =
  | { ok: true }
  | { ok: false; message: string; cancelled?: boolean };

/** Recoverable failure when opening a recent path. */
export type RecentOpenFailure = {
  projectId: string;
  name: string;
  fileName: string;
  kind: 'missing' | 'permission' | 'other';
  message: string;
};

/** Disk changed under the open handle — reload or overwrite, no merge. */
export type DirtyFile = {
  fileName: string;
};

export type TaskPanelFields = {
  title: string;
  description: string;
};

/**
 * Application service: open project session for the current browser tab.
 * Chrome/Edge: disk `.tw.json` via File System Access (auto-save).
 * Safari: in-memory after upload or create; persist with download only.
 * No IndexedDB project store.
 */
@Injectable({ providedIn: 'root' })
export class ProjectSessionService {
  private readonly files = inject(ProjectFileRepository);
  private readonly recents = inject(RecentProjectsService);

  private readonly projectSignal = signal<TwProject | null>(null);
  private readonly fileNameSignal = signal<string | null>(null);
  private readonly saveErrorSignal = signal<string | null>(null);
  private readonly uiErrorSignal = signal<string | null>(null);
  private readonly busySignal = signal(false);
  private readonly fileHandleSignal = signal<FileSystemFileHandle | null>(null);
  private readonly recentFailureSignal = signal<RecentOpenFailure | null>(null);
  private readonly dirtyFileSignal = signal<DirtyFile | null>(null);
  /** lastModified of the open disk file after last successful read/write. */
  private diskStamp: number | null = null;
  private bootstrapStarted = false;

  readonly project = this.projectSignal.asReadonly();
  readonly fileName = this.fileNameSignal.asReadonly();
  readonly saveError = this.saveErrorSignal.asReadonly();
  readonly uiError = this.uiErrorSignal.asReadonly();
  readonly busy = this.busySignal.asReadonly();
  readonly hasFile = computed(() => this.fileHandleSignal() !== null);
  readonly hasWorkspace = computed(() => this.projectSignal() !== null);
  /** Safari/memory session: persist by downloading the file. */
  readonly needsDownload = computed(
    () => this.projectSignal() !== null && this.fileHandleSignal() === null,
  );
  readonly fileSystemSupported = this.files.isSupported();
  readonly recentProjects = this.recents.list;
  readonly recentFailure = this.recentFailureSignal.asReadonly();
  readonly dirtyFile = this.dirtyFileSignal.asReadonly();

  /**
   * On app load: refresh recents. Does not auto-open a workspace.
   */
  async bootstrap(): Promise<void> {
    if (this.bootstrapStarted) {
      return;
    }
    this.bootstrapStarted = true;
    await this.recents.refresh();
  }

  /**
   * New Project: Chrome writes `.tw.json` and keeps the handle.
   * Safari: empty project in memory only — download to save. Cancelled picker opens nothing.
   */
  async newProject(): Promise<SessionActionResult> {
    this.uiErrorSignal.set(null);
    this.dirtyFileSignal.set(null);

    if (!this.files.isSupported()) {
      this.busySignal.set(true);
      try {
        const project = createEmptyProject();
        this.activateMemory(project, `${this.slugFileName(project.name)}.tw.json`);
        return { ok: true };
      } finally {
        this.busySignal.set(false);
      }
    }

    this.busySignal.set(true);
    try {
      const project = createEmptyProject();
      const suggested = `${this.slugFileName(project.name)}.tw.json`;
      const { handle, fileName, lastModified } = await this.files.pickLocationAndWrite(
        project,
        suggested,
      );
      await this.attachFile(handle, project, fileName, lastModified);
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
   * Open Project (Chrome/Edge picker). Invalid files fail closed — no repair.
   */
  async openProject(): Promise<SessionActionResult> {
    this.uiErrorSignal.set(null);
    this.dirtyFileSignal.set(null);
    if (!this.files.isSupported()) {
      const message = new FileSystemUnsupportedError().message;
      this.uiErrorSignal.set(message);
      return { ok: false, message };
    }

    this.busySignal.set(true);
    try {
      const opened = await this.files.pickAndRead();
      return await this.loadValidatedText(opened.text, {
        handle: opened.handle,
        fileName: opened.fileName,
        lastModified: opened.lastModified,
      });
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

  /** Safari: open from an uploaded File. Invalid files fail closed. */
  async openUploadedFile(file: File): Promise<SessionActionResult> {
    this.uiErrorSignal.set(null);
    this.dirtyFileSignal.set(null);
    this.busySignal.set(true);
    try {
      const text = await file.text();
      return await this.loadValidatedText(text, { fileName: file.name || 'project.tw.json' });
    } catch (error) {
      const message = this.messageFrom(error);
      this.uiErrorSignal.set(message);
      return { ok: false, message };
    } finally {
      this.busySignal.set(false);
    }
  }

  /** Safari: download the in-memory project. Not a filesystem. */
  downloadProject(): SessionActionResult {
    const project = this.projectSignal();
    if (!project) {
      const message = 'No project is open.';
      this.uiErrorSignal.set(message);
      return { ok: false, message };
    }
    const fileName = this.fileNameSignal() ?? `${this.slugFileName(project.name)}.tw.json`;
    this.files.download(project, fileName);
    this.fileNameSignal.set(fileName);
    return { ok: true };
  }

  /**
   * Open a recent disk path (Chrome File System Access handle).
   */
  async openRecent(projectId: string): Promise<SessionActionResult> {
    this.uiErrorSignal.set(null);
    this.recentFailureSignal.set(null);
    this.dirtyFileSignal.set(null);

    const meta = await this.recents.getMeta(projectId);
    const handle = await this.recents.getHandle(projectId);

    if (!handle) {
      await this.setRecentFailure({
        projectId,
        name: meta?.name ?? 'Project',
        fileName: meta?.fileName ?? '',
        kind: 'missing',
        message: 'The file may have been moved or deleted.',
      });
      return { ok: false, message: 'The file may have been moved or deleted.' };
    }

    this.busySignal.set(true);
    try {
      const permitted = await this.ensureReadPermission(handle);
      if (!permitted) {
        await this.setRecentFailure({
          projectId,
          name: meta?.name ?? 'Project',
          fileName: meta?.fileName ?? '',
          kind: 'permission',
          message: 'Permission to read that file was denied.',
        });
        return { ok: false, message: 'Permission to read that file was denied.' };
      }
      const opened = await this.files.readHandle(handle);
      const result = await this.loadValidatedText(opened.text, {
        handle,
        fileName: opened.fileName,
        lastModified: opened.lastModified,
      });
      if (!result.ok) {
        await this.setRecentFailure({
          projectId,
          name: meta?.name ?? 'Project',
          fileName: meta?.fileName ?? opened.fileName,
          kind: 'other',
          message: result.message,
        });
      }
      return result;
    } catch (error) {
      const kind = this.isMissingFileError(error) ? 'missing' : 'other';
      const message =
        kind === 'missing'
          ? 'The file may have been moved or deleted.'
          : this.messageFrom(error);
      await this.setRecentFailure({
        projectId,
        name: meta?.name ?? 'Project',
        fileName: meta?.fileName ?? '',
        kind,
        message,
      });
      return { ok: false, message };
    } finally {
      this.busySignal.set(false);
    }
  }

  dismissRecentFailure(): void {
    this.recentFailureSignal.set(null);
  }

  async removeFailedRecent(): Promise<void> {
    const failure = this.recentFailureSignal();
    if (!failure) {
      return;
    }
    await this.recents.remove(failure.projectId);
    this.recentFailureSignal.set(null);
  }

  async openFileForFailedRecent(): Promise<SessionActionResult> {
    const failure = this.recentFailureSignal();
    this.recentFailureSignal.set(null);
    const result = await this.openProject();
    if (result.ok) {
      if (failure && this.projectSignal()?.id !== failure.projectId) {
        await this.recents.remove(failure.projectId);
      }
      return result;
    }
    if (failure && !this.dirtyFileSignal()) {
      this.recentFailureSignal.set(failure);
    }
    return result;
  }

  /** Reload the open disk file into memory (disk wins). */
  async resolveDirtyReload(): Promise<SessionActionResult> {
    this.dirtyFileSignal.set(null);
    return this.reloadFromDisk();
  }

  /** Overwrite the open disk file with in-memory board. */
  async resolveDirtyOverwrite(): Promise<SessionActionResult> {
    const handle = this.fileHandleSignal();
    const project = this.projectSignal();
    if (!handle || !project) {
      return { ok: false, message: 'No project file is open.' };
    }
    this.busySignal.set(true);
    try {
      await this.files.write(handle, project);
      this.diskStamp = await this.files.getLastModified(handle);
      this.dirtyFileSignal.set(null);
      this.saveErrorSignal.set(null);
      await this.recents.record(handle, project, this.fileNameSignal() ?? handle.name);
      return { ok: true };
    } catch {
      this.saveErrorSignal.set(SAVE_FAILED_MESSAGE);
      return { ok: false, message: SAVE_FAILED_MESSAGE };
    } finally {
      this.busySignal.set(false);
    }
  }

  dismissDirtyFile(): void {
    this.dirtyFileSignal.set(null);
  }

  async updateProject(
    mutator: (current: TwProject) => TwProject,
  ): Promise<SessionActionResult> {
    const current = this.projectSignal();
    if (!current) {
      return { ok: false, message: 'No project is open.' };
    }
    const next = mutator(structuredClone(current));
    this.projectSignal.set(next);

    const handle = this.fileHandleSignal();
    if (!handle) {
      this.saveErrorSignal.set(null);
      return { ok: true };
    }

    try {
      const dirty = await this.diskChanged(handle);
      if (dirty) {
        this.dirtyFileSignal.set({
          fileName: this.fileNameSignal() ?? handle.name,
        });
        return { ok: false, message: 'This file changed on disk.' };
      }
      await this.files.write(handle, next);
      this.diskStamp = await this.files.getLastModified(handle);
      this.saveErrorSignal.set(null);
      await this.recents.record(handle, next, this.fileNameSignal() ?? handle.name);
      return { ok: true };
    } catch {
      this.saveErrorSignal.set(SAVE_FAILED_MESSAGE);
      return { ok: false, message: SAVE_FAILED_MESSAGE };
    }
  }

  async createTask(input: {
    title: string;
    description?: string;
    status: string;
  }): Promise<SessionActionResult> {
    const current = this.projectSignal();
    if (!current) {
      return { ok: false, message: 'No project is open.' };
    }
    const built = buildNewTask(
      {
        title: input.title,
        description: input.description,
        points: null,
        assigned: null,
        status: input.status,
      },
      current.statuses,
    );
    if (!built.ok) {
      return { ok: false, message: built.reason };
    }
    return this.updateProject((p) => addTask(p, built.value));
  }

  async saveTask(taskId: string, input: TaskPanelFields): Promise<SessionActionResult> {
    const current = this.projectSignal();
    if (!current) {
      return { ok: false, message: 'No project is open.' };
    }
    const existing = findTask(current, taskId);
    if (!existing) {
      return { ok: false, message: 'Task not found.' };
    }
    const updated = applyTaskUpdate(
      existing,
      {
        title: input.title,
        description: input.description,
        points: existing.points,
        assigned: existing.assigned,
        status: existing.status,
      },
      current.statuses,
    );
    if (!updated.ok) {
      return { ok: false, message: updated.reason };
    }
    return this.updateProject((p) => replaceTask(p, updated.value));
  }

  async deleteTask(taskId: string): Promise<SessionActionResult> {
    const current = this.projectSignal();
    if (!current || !findTask(current, taskId)) {
      return { ok: false, message: 'Task not found.' };
    }
    return this.updateProject((p) => removeTask(p, taskId));
  }

  async moveTask(taskId: string, newStatus: string): Promise<SessionActionResult> {
    const current = this.projectSignal();
    if (!current) {
      return { ok: false, message: 'No project is open.' };
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

  async setProjectName(name: string): Promise<SessionActionResult> {
    const current = this.projectSignal();
    if (!current) {
      return { ok: false, message: 'No project is open.' };
    }
    const renamed = renameProject(current, name);
    if (!renamed.ok) {
      return { ok: false, message: renamed.reason };
    }
    if (renamed.value === current) {
      return { ok: true };
    }
    return this.updateProject(() => renamed.value);
  }

  async addStatus(name: string): Promise<SessionActionResult> {
    const current = this.projectSignal();
    if (!current) {
      return { ok: false, message: 'No project is open.' };
    }
    const result = addStatus(current, name);
    if (!result.ok) {
      return { ok: false, message: result.reason };
    }
    return this.updateProject(() => result.value);
  }

  async renameStatus(oldName: string, newName: string): Promise<SessionActionResult> {
    const current = this.projectSignal();
    if (!current) {
      return { ok: false, message: 'No project is open.' };
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

  async reorderStatuses(fromIndex: number, toIndex: number): Promise<SessionActionResult> {
    const current = this.projectSignal();
    if (!current) {
      return { ok: false, message: 'No project is open.' };
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

  async deleteStatus(name: string): Promise<SessionActionResult> {
    const current = this.projectSignal();
    if (!current) {
      return { ok: false, message: 'No project is open.' };
    }
    const result = deleteStatus(current, name);
    if (!result.ok) {
      return { ok: false, message: result.reason };
    }
    return this.updateProject(() => result.value);
  }

  async retrySave(): Promise<SessionActionResult> {
    const current = this.projectSignal();
    const handle = this.fileHandleSignal();
    if (!handle || !current) {
      return { ok: false, message: 'No project file is open.' };
    }
    try {
      const dirty = await this.diskChanged(handle);
      if (dirty) {
        this.dirtyFileSignal.set({
          fileName: this.fileNameSignal() ?? handle.name,
        });
        return { ok: false, message: 'This file changed on disk.' };
      }
      await this.files.write(handle, current);
      this.diskStamp = await this.files.getLastModified(handle);
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
    const handle = this.fileHandleSignal();
    if (!handle) {
      const message = 'No project file is open.';
      this.uiErrorSignal.set(message);
      return { ok: false, message };
    }

    this.busySignal.set(true);
    this.uiErrorSignal.set(null);
    this.dirtyFileSignal.set(null);
    try {
      const opened = await this.files.readHandle(handle);
      const validation = parseAndValidateProject(opened.text);
      if (!validation.ok) {
        const message = validation.reason
          ? `${validation.message}: ${validation.reason}`
          : validation.message;
        this.uiErrorSignal.set(message);
        return { ok: false, message };
      }

      await this.attachFile(
        this.fileHandleSignal()!,
        validation.project,
        opened.fileName,
        opened.lastModified,
      );
      return { ok: true };
    } catch (error) {
      const message = this.messageFrom(error);
      this.uiErrorSignal.set(message);
      return { ok: false, message };
    } finally {
      this.busySignal.set(false);
    }
  }

  closeProject(): void {
    this.fileHandleSignal.set(null);
    this.projectSignal.set(null);
    this.fileNameSignal.set(null);
    this.saveErrorSignal.set(null);
    this.uiErrorSignal.set(null);
    this.dirtyFileSignal.set(null);
    this.diskStamp = null;
  }

  clearUiError(): void {
    this.uiErrorSignal.set(null);
  }

  private async loadValidatedText(
    text: string,
    dest:
      | { handle: FileSystemFileHandle; fileName: string; lastModified: number }
      | { fileName: string },
  ): Promise<SessionActionResult> {
    const validation = parseAndValidateProject(text);
    if (!validation.ok) {
      const message = validation.reason
        ? `${validation.message}: ${validation.reason}`
        : validation.message;
      this.uiErrorSignal.set(message);
      return { ok: false, message };
    }
    if ('handle' in dest) {
      await this.attachFile(dest.handle, validation.project, dest.fileName, dest.lastModified);
    } else {
      this.activateMemory(validation.project, dest.fileName);
    }
    return { ok: true };
  }

  private activateMemory(project: TwProject, fileName: string): void {
    this.fileHandleSignal.set(null);
    this.diskStamp = null;
    this.projectSignal.set(project);
    this.fileNameSignal.set(fileName);
    this.saveErrorSignal.set(null);
    this.uiErrorSignal.set(null);
    this.dirtyFileSignal.set(null);
  }

  private async attachFile(
    handle: FileSystemFileHandle,
    project: TwProject,
    fileName: string,
    lastModified: number,
  ): Promise<void> {
    this.fileHandleSignal.set(handle);
    this.diskStamp = lastModified;
    this.projectSignal.set(project);
    this.fileNameSignal.set(fileName);
    this.saveErrorSignal.set(null);
    this.uiErrorSignal.set(null);
    this.dirtyFileSignal.set(null);
    await this.recents.record(handle, project, fileName);
  }

  private async diskChanged(handle: FileSystemFileHandle): Promise<boolean> {
    if (this.diskStamp === null) {
      return false;
    }
    try {
      const stamp = await this.files.getLastModified(handle);
      return stamp !== this.diskStamp;
    } catch {
      return false;
    }
  }

  private async setRecentFailure(failure: RecentOpenFailure): Promise<void> {
    this.recentFailureSignal.set(failure);
    this.uiErrorSignal.set(null);
  }

  private isMissingFileError(error: unknown): boolean {
    if (typeof error !== 'object' || error === null) {
      return false;
    }
    const name = 'name' in error ? String((error as { name: string }).name) : '';
    const message = 'message' in error ? String((error as { message: string }).message) : '';
    return (
      name === 'NotFoundError' ||
      /could not be found/i.test(message) ||
      /not found/i.test(message) ||
      /no longer exists/i.test(message)
    );
  }

  private async ensureReadPermission(handle: FileSystemFileHandle): Promise<boolean> {
    const withPerm = handle as FileSystemFileHandle & {
      queryPermission?: (opts: { mode: string }) => Promise<PermissionState>;
      requestPermission?: (opts: { mode: string }) => Promise<PermissionState>;
    };
    if (typeof withPerm.queryPermission !== 'function') {
      return true;
    }
    let state = await withPerm.queryPermission({ mode: 'readwrite' });
    if (state === 'granted') {
      return true;
    }
    if (typeof withPerm.requestPermission === 'function') {
      state = await withPerm.requestPermission({ mode: 'readwrite' });
    }
    return state === 'granted';
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
