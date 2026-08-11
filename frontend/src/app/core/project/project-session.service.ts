import { Injectable, computed, inject, signal } from '@angular/core';
import {
  FileSystemUnsupportedError,
  ProjectFileRepository,
  UserCancelledFilePickerError,
} from '../fs/project-file.repository';
import {
  ProjectCacheService,
  projectsContentEqual,
} from '../fs/project-cache.service';
import {
  RecentProjectsService,
  type RecentProjectMeta,
} from '../fs/recent-projects.service';
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

/** Recoverable failure when opening a recent project (missing file, etc.). */
export type RecentOpenFailure = {
  projectId: string;
  name: string;
  fileName: string;
  kind: 'missing' | 'permission' | 'other';
  message: string;
};

/** Disk vs browser cache disagreement — user must choose. */
export type CacheConflict = {
  handle: FileSystemFileHandle;
  fileName: string;
  disk: TwProject;
  cache: TwProject;
};

/**
 * Application service: open project session for the current browser tab.
 * Always holds an in-memory project (draft board like Draw.io untitled page).
 * Auto-saves to disk when a file handle is attached; always updates browser cache.
 */
@Injectable({ providedIn: 'root' })
export class ProjectSessionService {
  private readonly files = inject(ProjectFileRepository);
  private readonly recents = inject(RecentProjectsService);
  private readonly cache = inject(ProjectCacheService);

  /** Always a real project so the board (empty swimlanes) can show. */
  private readonly projectSignal = signal<TwProject>(createEmptyProject());
  private readonly fileNameSignal = signal<string | null>(null);
  private readonly saveErrorSignal = signal<string | null>(null);
  private readonly uiErrorSignal = signal<string | null>(null);
  private readonly busySignal = signal(false);
  private readonly fileHandleSignal = signal<FileSystemFileHandle | null>(null);
  private readonly recentFailureSignal = signal<RecentOpenFailure | null>(null);
  private readonly cacheConflictSignal = signal<CacheConflict | null>(null);
  /** Opened from IndexedDB without a live file handle (e.g. mobile / no FS Access). */
  private readonly cacheOnlySignal = signal(false);
  /** Last project summary for the open prompt (never auto-opened). */
  private readonly lastProjectSignal = signal<RecentProjectMeta | null>(null);
  private bootstrapStarted = false;

  readonly project = this.projectSignal.asReadonly();
  readonly fileName = this.fileNameSignal.asReadonly();
  readonly saveError = this.saveErrorSignal.asReadonly();
  readonly uiError = this.uiErrorSignal.asReadonly();
  readonly busy = this.busySignal.asReadonly();
  /** True when a disk file handle is attached (saved/opened). */
  readonly hasFile = computed(() => this.fileHandleSignal() !== null);
  /**
   * True when the open-project overlay should stay hidden:
   * disk file attached, or user opened a browser-only session.
   */
  readonly hasWorkspace = computed(
    () => this.fileHandleSignal() !== null || this.cacheOnlySignal(),
  );
  /** @deprecated Prefer hasFile / hasWorkspace. */
  readonly hasProject = computed(() => this.hasFile());
  readonly fileSystemSupported = this.files.isSupported();
  readonly recentProjects = this.recents.list;
  readonly recentFailure = this.recentFailureSignal.asReadonly();
  readonly cacheConflict = this.cacheConflictSignal.asReadonly();
  readonly cacheOnly = this.cacheOnlySignal.asReadonly();
  readonly lastProject = this.lastProjectSignal.asReadonly();

  /**
   * On app load: refresh recents and resolve last-project label for the open prompt.
   * Does **not** auto-open a workspace — user chooses New / Open / last / recent.
   */
  async bootstrap(): Promise<void> {
    if (this.bootstrapStarted) {
      return;
    }
    this.bootstrapStarted = true;
    await this.recents.refresh();
    await this.refreshLastProjectHint();
  }

  /** Re-read last project id for the open-prompt button. */
  async refreshLastProjectHint(): Promise<void> {
    const lastId = this.cache.getLastProjectId();
    if (!lastId) {
      this.lastProjectSignal.set(null);
      return;
    }
    const meta = await this.recents.getMeta(lastId);
    if (meta) {
      this.lastProjectSignal.set(meta);
      return;
    }
    const cached = await this.cache.get(lastId);
    if (cached?.project) {
      this.lastProjectSignal.set({
        id: cached.project.id,
        name: cached.project.name,
        fileName: cached.fileName ?? '',
        openedAt: cached.cachedAt,
      });
      return;
    }
    this.lastProjectSignal.set(null);
  }

  /**
   * Open the remembered last project (file handle if available, else browser cache).
   * Used from the open prompt — never runs automatically on load.
   */
  async openLastProject(): Promise<SessionActionResult> {
    this.uiErrorSignal.set(null);
    const lastId = this.cache.getLastProjectId() ?? this.lastProjectSignal()?.id;
    if (!lastId) {
      const message = 'No recent project to open.';
      this.uiErrorSignal.set(message);
      return { ok: false, message };
    }

    const handle = await this.recents.getHandle(lastId);
    if (handle) {
      return this.openRecent(lastId);
    }

    this.busySignal.set(true);
    try {
      return await this.openFromCache(lastId);
    } finally {
      this.busySignal.set(false);
    }
  }

  /** Load a project from browser cache only (no disk handle). Caller manages busy. */
  async openFromCache(projectId: string): Promise<SessionActionResult> {
    this.uiErrorSignal.set(null);
    this.cacheConflictSignal.set(null);
    const cached = await this.cache.get(projectId);
    if (!cached?.project) {
      const message = 'No browser copy of that project was found.';
      this.uiErrorSignal.set(message);
      return { ok: false, message };
    }
    this.fileHandleSignal.set(null);
    this.cacheOnlySignal.set(true);
    this.projectSignal.set(cached.project);
    this.fileNameSignal.set(cached.fileName);
    this.saveErrorSignal.set(null);
    this.uiErrorSignal.set(null);
    this.cache.setLastProjectId(cached.project.id);
    await this.refreshLastProjectHint();
    return { ok: true };
  }

  /**
   * New Project: create template in memory, prompt to save `.tw.json`, keep handle.
   * If the user cancels the save dialog, no session is opened.
   */
  async newProject(): Promise<SessionActionResult> {
    this.uiErrorSignal.set(null);
    this.cacheConflictSignal.set(null);
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
      await this.attachFile(handle, project, fileName);
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
    this.cacheConflictSignal.set(null);
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

      const pending = await this.maybeConflict(
        opened.handle,
        validation.project,
        opened.fileName,
      );
      if (pending) {
        return { ok: false, message: 'This file differs from the browser copy.' };
      }

      await this.attachFile(opened.handle, validation.project, opened.fileName);
      await this.refreshLastProjectHint();
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

  /** Open a recent project via stored file handle (Projects menu / open prompt). */
  async openRecent(projectId: string): Promise<SessionActionResult> {
    this.uiErrorSignal.set(null);
    this.recentFailureSignal.set(null);
    this.cacheConflictSignal.set(null);

    const meta = await this.recents.getMeta(projectId);
    const handle = await this.recents.getHandle(projectId);
    if (!handle || !meta) {
      this.busySignal.set(true);
      try {
        const fromCache = await this.openFromCache(projectId);
        if (fromCache.ok) {
          return fromCache;
        }
      } finally {
        this.busySignal.set(false);
      }
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
        const fromCache = await this.openFromCache(projectId);
        if (fromCache.ok) {
          return fromCache;
        }
        await this.setRecentFailure({
          projectId,
          name: meta.name,
          fileName: meta.fileName,
          kind: 'permission',
          message: 'Permission to read that file was denied.',
        });
        return { ok: false, message: 'Permission to read that file was denied.' };
      }
      const { text, fileName } = await this.files.readHandle(handle);
      const validation = parseAndValidateProject(text);
      if (!validation.ok) {
        const message = validation.reason
          ? `${validation.message}: ${validation.reason}`
          : validation.message;
        await this.setRecentFailure({
          projectId,
          name: meta.name,
          fileName: meta.fileName,
          kind: 'other',
          message,
        });
        return { ok: false, message };
      }

      const pending = await this.maybeConflict(handle, validation.project, fileName);
      if (pending) {
        this.recentFailureSignal.set(null);
        return { ok: false, message: 'This file differs from the browser copy.' };
      }

      await this.attachFile(handle, validation.project, fileName);
      this.recentFailureSignal.set(null);
      await this.refreshLastProjectHint();
      return { ok: true };
    } catch (error) {
      const kind = this.isMissingFileError(error) ? 'missing' : 'other';
      const message =
        kind === 'missing'
          ? 'The file may have been moved or deleted.'
          : this.messageFrom(error);
      if (kind === 'missing') {
        const fromCache = await this.openFromCache(projectId);
        if (fromCache.ok) {
          return fromCache;
        }
      }
      await this.setRecentFailure({
        projectId,
        name: meta.name,
        fileName: meta.fileName,
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

  /** Remove the failed recent entry from history. */
  async removeFailedRecent(): Promise<void> {
    const failure = this.recentFailureSignal();
    if (!failure) {
      return;
    }
    await this.recents.remove(failure.projectId);
    this.recentFailureSignal.set(null);
  }

  /** Open Project picker to recover a missing recent (new path). */
  async openFileForFailedRecent(): Promise<SessionActionResult> {
    const failure = this.recentFailureSignal();
    this.recentFailureSignal.set(null);
    const result = await this.openProject();
    if (result.ok) {
      if (failure && this.projectSignal().id !== failure.projectId) {
        await this.recents.remove(failure.projectId);
      }
      return result;
    }
    if (failure && !this.cacheConflictSignal()) {
      this.recentFailureSignal.set(failure);
    }
    return result;
  }

  /** Use disk version when file and browser cache disagree. */
  async resolveConflictUseDisk(): Promise<SessionActionResult> {
    const conflict = this.cacheConflictSignal();
    if (!conflict) {
      return { ok: false, message: 'No conflict to resolve.' };
    }
    this.busySignal.set(true);
    try {
      await this.attachFile(conflict.handle, conflict.disk, conflict.fileName);
      this.cacheConflictSignal.set(null);
      return { ok: true };
    } catch (error) {
      const message = this.messageFrom(error);
      this.uiErrorSignal.set(message);
      return { ok: false, message };
    } finally {
      this.busySignal.set(false);
    }
  }

  /** Use browser cache and write it back to the open file. */
  async resolveConflictUseCache(): Promise<SessionActionResult> {
    const conflict = this.cacheConflictSignal();
    if (!conflict) {
      return { ok: false, message: 'No conflict to resolve.' };
    }
    this.busySignal.set(true);
    try {
      await this.files.write(conflict.handle, conflict.cache);
      await this.attachFile(conflict.handle, conflict.cache, conflict.fileName);
      this.cacheConflictSignal.set(null);
      this.saveErrorSignal.set(null);
      return { ok: true };
    } catch {
      this.saveErrorSignal.set(SAVE_FAILED_MESSAGE);
      return { ok: false, message: SAVE_FAILED_MESSAGE };
    } finally {
      this.busySignal.set(false);
    }
  }

  dismissConflict(): void {
    this.cacheConflictSignal.set(null);
  }

  /**
   * Apply a pure mutation to the in-memory project.
   * Auto-saves to disk when a file handle exists; always updates browser cache for real sessions.
   */
  async updateProject(
    mutator: (current: TwProject) => TwProject,
  ): Promise<SessionActionResult> {
    const current = this.projectSignal();
    const next = mutator(structuredClone(current));
    this.projectSignal.set(next);

    const handle = this.fileHandleSignal();
    if (handle) {
      try {
        await this.files.write(handle, next);
        this.saveErrorSignal.set(null);
      } catch {
        this.saveErrorSignal.set(SAVE_FAILED_MESSAGE);
        await this.cache.put(next, this.fileNameSignal());
        return { ok: false, message: SAVE_FAILED_MESSAGE };
      }
    }

    if (handle || this.cacheOnlySignal()) {
      await this.cache.put(next, this.fileNameSignal());
    }

    return { ok: true };
  }

  /** Story F: create task in a column and auto-save. */
  async createTask(input: CreateTaskInput): Promise<SessionActionResult> {
    const current = this.projectSignal();
    const built = buildNewTask(input, current.statuses);
    if (!built.ok) {
      return { ok: false, message: built.reason };
    }
    return this.updateProject((p) => addTask(p, built.value));
  }

  /** Story G: update task fields and auto-save. */
  async saveTask(taskId: string, input: UpdateTaskInput): Promise<SessionActionResult> {
    const current = this.projectSignal();
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
    if (!findTask(current, taskId)) {
      return { ok: false, message: 'Task not found.' };
    }
    return this.updateProject((p) => removeTask(p, taskId));
  }

  /** Story I: drag task to another column; auto-save. */
  async moveTask(taskId: string, newStatus: string): Promise<SessionActionResult> {
    const current = this.projectSignal();
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
    const renamed = renameProject(current, name);
    if (!renamed.ok) {
      return { ok: false, message: renamed.reason };
    }
    if (renamed.value === current || renamed.value.name === current.name) {
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
    const result = addStatus(current, name);
    if (!result.ok) {
      return { ok: false, message: result.reason };
    }
    return this.updateProject(() => result.value);
  }

  /** Story K: rename status + task status values. */
  async renameStatus(oldName: string, newName: string): Promise<SessionActionResult> {
    const current = this.projectSignal();
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
    const result = deleteStatus(current, name);
    if (!result.ok) {
      return { ok: false, message: result.reason };
    }
    return this.updateProject(() => result.value);
  }

  /** Retry writing the current in-memory project to the open handle. */
  async retrySave(): Promise<SessionActionResult> {
    const current = this.projectSignal();
    const handle = this.fileHandleSignal();
    if (!handle) {
      return { ok: false, message: 'No project file is open.' };
    }
    try {
      await this.files.write(handle, current);
      this.saveErrorSignal.set(null);
      await this.cache.put(current, this.fileNameSignal());
      return { ok: true };
    } catch {
      this.saveErrorSignal.set(SAVE_FAILED_MESSAGE);
      return { ok: false, message: SAVE_FAILED_MESSAGE };
    }
  }

  /**
   * Re-read the open file handle from disk, validate, replace memory.
   * On invalid file or I/O error: keep previous in-memory project, set uiError.
   * If disk disagrees with cache, surface conflict (ask user).
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
    try {
      const { text, fileName } = await this.files.readHandle(handle);
      const validation = parseAndValidateProject(text);
      if (!validation.ok) {
        const message = validation.reason
          ? `${validation.message}: ${validation.reason}`
          : validation.message;
        this.uiErrorSignal.set(message);
        return { ok: false, message };
      }

      const pending = await this.maybeConflict(handle, validation.project, fileName);
      if (pending) {
        return { ok: false, message: 'This file differs from the browser copy.' };
      }

      await this.attachFile(this.fileHandleSignal()!, validation.project, fileName);
      return { ok: true };
    } catch (error) {
      const message = this.messageFrom(error);
      this.uiErrorSignal.set(message);
      return { ok: false, message };
    } finally {
      this.busySignal.set(false);
    }
  }

  /** Detach file handle and reset to a fresh empty draft board (page stays visible). */
  closeProject(): void {
    this.fileHandleSignal.set(null);
    this.cacheOnlySignal.set(false);
    this.projectSignal.set(createEmptyProject());
    this.fileNameSignal.set(null);
    this.saveErrorSignal.set(null);
    this.uiErrorSignal.set(null);
    this.cacheConflictSignal.set(null);
  }

  clearUiError(): void {
    this.uiErrorSignal.set(null);
  }

  /**
   * If browser cache exists for this project id and content differs, park conflict and return true.
   * Otherwise return false (caller may attach).
   */
  private async maybeConflict(
    handle: FileSystemFileHandle,
    disk: TwProject,
    fileName: string,
  ): Promise<boolean> {
    const cached = await this.cache.get(disk.id);
    if (!cached?.project) {
      return false;
    }
    if (projectsContentEqual(cached.project, disk)) {
      return false;
    }
    this.cacheConflictSignal.set({
      handle,
      fileName,
      disk,
      cache: cached.project,
    });
    return true;
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

  private async attachFile(
    handle: FileSystemFileHandle,
    project: TwProject,
    fileName: string,
  ): Promise<void> {
    this.fileHandleSignal.set(handle);
    this.cacheOnlySignal.set(false);
    this.projectSignal.set(project);
    this.fileNameSignal.set(fileName);
    this.saveErrorSignal.set(null);
    this.uiErrorSignal.set(null);
    await this.recents.record(handle, project, fileName);
    await this.cache.put(project, fileName);
    await this.refreshLastProjectHint();
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
