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
  type TaskOpResult,
  type UpdateTaskInput,
} from './task-ops';
import { parseAndValidateProject } from './validate-project';

export const SAVE_FAILED_MESSAGE =
  'Save failed – changes are only in memory. Try again or refresh.';

export type SessionActionResult =
  | { ok: true }
  | { ok: false; message: string; cancelled?: boolean };

export type RecentOpenFailure = {
  projectId: string;
  name: string;
  fileName: string;
  kind: 'missing' | 'permission' | 'other';
  message: string;
};

export type CacheConflict = {
  handle: FileSystemFileHandle;
  fileName: string;
  disk: TwProject;
  cache: TwProject;
};

/** In-memory session. Writes disk when a file handle is attached; always updates the browser cache. */
@Injectable({ providedIn: 'root' })
export class ProjectSessionService {
  private readonly files = inject(ProjectFileRepository);
  private readonly recents = inject(RecentProjectsService);
  private readonly cache = inject(ProjectCacheService);

  private readonly projectSignal = signal<TwProject>(createEmptyProject());
  private readonly fileNameSignal = signal<string | null>(null);
  private readonly saveErrorSignal = signal<string | null>(null);
  private readonly uiErrorSignal = signal<string | null>(null);
  private readonly busySignal = signal(false);
  private readonly fileHandleSignal = signal<FileSystemFileHandle | null>(null);
  private readonly recentFailureSignal = signal<RecentOpenFailure | null>(null);
  private readonly cacheConflictSignal = signal<CacheConflict | null>(null);
  private readonly cacheOnlySignal = signal(false);
  private readonly lastProjectSignal = signal<RecentProjectMeta | null>(null);
  private bootstrapStarted = false;

  readonly project = this.projectSignal.asReadonly();
  readonly fileName = this.fileNameSignal.asReadonly();
  readonly saveError = this.saveErrorSignal.asReadonly();
  readonly uiError = this.uiErrorSignal.asReadonly();
  readonly busy = this.busySignal.asReadonly();
  readonly hasFile = computed(() => this.fileHandleSignal() !== null);
  /** Disk file attached, or a browser-only session is open. */
  readonly hasWorkspace = computed(
    () => this.fileHandleSignal() !== null || this.cacheOnlySignal(),
  );
  readonly fileSystemSupported = this.files.isSupported();
  readonly recentProjects = this.recents.list;
  readonly recentFailure = this.recentFailureSignal.asReadonly();
  readonly cacheConflict = this.cacheConflictSignal.asReadonly();
  readonly cacheOnly = this.cacheOnlySignal.asReadonly();
  readonly lastProject = this.lastProjectSignal.asReadonly();

  /** Loads recents for the open prompt. Does not auto-open a workspace. */
  async bootstrap(): Promise<void> {
    if (this.bootstrapStarted) {
      return;
    }
    this.bootstrapStarted = true;
    await this.recents.refresh();
    await this.refreshLastProjectHint();
  }

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
        fileName: cached.fileName,
        source: 'browser',
        openedAt: cached.cachedAt,
      });
      return;
    }
    this.lastProjectSignal.set(null);
  }

  async openLastProject(): Promise<SessionActionResult> {
    this.uiErrorSignal.set(null);
    const lastId = this.cache.getLastProjectId() ?? this.lastProjectSignal()?.id;
    if (!lastId) {
      const message = 'No recent project to open.';
      this.uiErrorSignal.set(message);
      return { ok: false, message };
    }
    return this.openRecent(lastId);
  }

  /** Cache only; caller owns the busy flag. */
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
    await this.cache.put(cached.project, null);
    await this.recents.recordBrowser(cached.project);
    await this.refreshLastProjectHint();
    return { ok: true };
  }

  /** Save-dialog first. Cancel leaves no session open. */
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

  /** No disk file; cache in this browser only. */
  async newBrowserOnlyProject(): Promise<SessionActionResult> {
    this.uiErrorSignal.set(null);
    this.cacheConflictSignal.set(null);
    this.recentFailureSignal.set(null);
    this.busySignal.set(true);
    try {
      const project = createEmptyProject();
      this.fileHandleSignal.set(null);
      this.cacheOnlySignal.set(true);
      this.projectSignal.set(project);
      this.fileNameSignal.set(null);
      this.saveErrorSignal.set(null);
      this.uiErrorSignal.set(null);
      await this.cache.put(project, null);
      await this.recents.recordBrowser(project);
      await this.refreshLastProjectHint();
      return { ok: true };
    } catch (error) {
      const message = this.messageFrom(error);
      this.uiErrorSignal.set(message);
      return { ok: false, message };
    } finally {
      this.busySignal.set(false);
    }
  }

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

  async openRecent(projectId: string): Promise<SessionActionResult> {
    this.uiErrorSignal.set(null);
    this.recentFailureSignal.set(null);
    this.cacheConflictSignal.set(null);

    const meta = await this.recents.getMeta(projectId);
    const handle = await this.recents.getHandle(projectId);

    if (meta?.source === 'browser' || !handle) {
      this.busySignal.set(true);
      try {
        const fromCache = await this.openFromCache(projectId);
        if (fromCache.ok) {
          return fromCache;
        }
      } finally {
        this.busySignal.set(false);
      }
      if (!meta && !handle) {
        await this.setRecentFailure({
          projectId,
          name: 'Project',
          fileName: '',
          kind: 'missing',
          message: 'That project was not found in this browser.',
        });
        return { ok: false, message: 'That project was not found in this browser.' };
      }
      if (meta?.source === 'browser') {
        await this.setRecentFailure({
          projectId,
          name: meta.name,
          fileName: '',
          kind: 'missing',
          message: 'No browser copy of that project was found.',
        });
        return { ok: false, message: 'No browser copy of that project was found.' };
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
          name: meta?.name ?? 'Project',
          fileName: meta?.fileName ?? '',
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
          name: meta?.name ?? 'Project',
          fileName: meta?.fileName ?? '',
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

  /** Mutate memory, write disk if a handle exists, and refresh the browser cache. */
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
    if (this.cacheOnlySignal()) {
      await this.recents.recordBrowser(next);
    }

    return { ok: true };
  }

  private applyOp(
    op: (current: TwProject) => TaskOpResult<TwProject>,
  ): Promise<SessionActionResult> {
    const current = this.projectSignal();
    const result = op(current);
    if (!result.ok) {
      return Promise.resolve({ ok: false, message: result.reason });
    }
    if (result.value === current) {
      return Promise.resolve({ ok: true });
    }
    return this.updateProject(() => result.value);
  }

  async createTask(input: CreateTaskInput): Promise<SessionActionResult> {
    return this.applyOp((p) => {
      const built = buildNewTask(input, p.statuses);
      if (!built.ok) {
        return built;
      }
      return { ok: true, value: addTask(p, built.value) };
    });
  }

  async saveTask(taskId: string, input: UpdateTaskInput): Promise<SessionActionResult> {
    return this.applyOp((p) => {
      const existing = findTask(p, taskId);
      if (!existing) {
        return { ok: false, reason: 'Task not found.' };
      }
      const updated = applyTaskUpdate(existing, input, p.statuses);
      if (!updated.ok) {
        return updated;
      }
      return { ok: true, value: replaceTask(p, updated.value) };
    });
  }

  async deleteTask(taskId: string): Promise<SessionActionResult> {
    return this.applyOp((p) => {
      if (!findTask(p, taskId)) {
        return { ok: false, reason: 'Task not found.' };
      }
      return { ok: true, value: removeTask(p, taskId) };
    });
  }

  async moveTask(taskId: string, newStatus: string): Promise<SessionActionResult> {
    return this.applyOp((p) => moveTaskToStatus(p, taskId, newStatus));
  }

  async setProjectName(name: string): Promise<SessionActionResult> {
    return this.applyOp((p) => renameProject(p, name));
  }

  async addStatus(name: string): Promise<SessionActionResult> {
    return this.applyOp((p) => addStatus(p, name));
  }

  async renameStatus(oldName: string, newName: string): Promise<SessionActionResult> {
    return this.applyOp((p) => renameStatus(p, oldName, newName));
  }

  async reorderStatuses(fromIndex: number, toIndex: number): Promise<SessionActionResult> {
    return this.applyOp((p) => reorderStatuses(p, fromIndex, toIndex));
  }

  async deleteStatus(name: string): Promise<SessionActionResult> {
    return this.applyOp((p) => deleteStatus(p, name));
  }

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

  /** Disk replaces memory. On parse/I/O failure the previous project is kept. */
  async reloadFromDisk(): Promise<SessionActionResult> {
    const handle = this.fileHandleSignal();
    if (!handle) {
      const message = 'No project file is open.';
      this.uiErrorSignal.set(message);
      return { ok: false, message };
    }

    this.busySignal.set(true);
    this.uiErrorSignal.set(null);
    this.cacheConflictSignal.set(null);
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

  /** True when cache exists for this id and differs from disk. */
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
    await this.recents.recordFile(handle, project, fileName);
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
