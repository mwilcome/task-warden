import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import {
  FileSystemUnsupportedError,
  ProjectFileRepository,
  UserCancelledFilePickerError,
} from '../fs/project-file.repository';
import { ProjectCacheService } from '../fs/project-cache.service';
import { RecentProjectsService } from '../fs/recent-projects.service';
import { createEmptyProject } from './create-empty-project';
import { INVALID_FILE_MESSAGE, SCHEMA_VERSION } from './project.types';
import {
  ProjectSessionService,
  SAVE_FAILED_MESSAGE,
} from './project-session.service';

describe('ProjectSessionService', () => {
  let session: ProjectSessionService;
  let files: {
    isSupported: ReturnType<typeof vi.fn>;
    pickAndRead: ReturnType<typeof vi.fn>;
    pickLocationAndWrite: ReturnType<typeof vi.fn>;
    readHandle: ReturnType<typeof vi.fn>;
    getLastModified: ReturnType<typeof vi.fn>;
    write: ReturnType<typeof vi.fn>;
    download: ReturnType<typeof vi.fn>;
  };
  let recents: {
    list: ReturnType<ReturnType<typeof signal>['asReadonly']>;
    recordFile: ReturnType<typeof vi.fn>;
    recordBrowser: ReturnType<typeof vi.fn>;
    getHandle: ReturnType<typeof vi.fn>;
    getMeta: ReturnType<typeof vi.fn>;
    remove: ReturnType<typeof vi.fn>;
    refresh: ReturnType<typeof vi.fn>;
  };
  let cache: {
    put: ReturnType<typeof vi.fn>;
    get: ReturnType<typeof vi.fn>;
    remove: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    files = {
      isSupported: vi.fn(() => true),
      pickAndRead: vi.fn(),
      pickLocationAndWrite: vi.fn(),
      readHandle: vi.fn(),
      getLastModified: vi.fn(async () => 1),
      write: vi.fn(async () => undefined),
      download: vi.fn(),
    };
    recents = {
      list: signal([]).asReadonly(),
      recordFile: vi.fn(async () => undefined),
      recordBrowser: vi.fn(async () => undefined),
      getHandle: vi.fn(async () => null),
      getMeta: vi.fn(async () => null),
      remove: vi.fn(async () => undefined),
      refresh: vi.fn(async () => undefined),
    };
    cache = {
      put: vi.fn(async () => undefined),
      get: vi.fn(async () => null),
      remove: vi.fn(async () => undefined),
    };

    TestBed.configureTestingModule({
      providers: [
        ProjectSessionService,
        { provide: ProjectFileRepository, useValue: files },
        { provide: RecentProjectsService, useValue: recents },
        { provide: ProjectCacheService, useValue: cache },
      ],
    });
    session = TestBed.inject(ProjectSessionService);
  });

  it('starts with no workspace (empty board blocked)', () => {
    expect(session.hasWorkspace()).toBe(false);
    expect(session.project()).toBeNull();
  });

  it('newProject creates template, writes file, opens session', async () => {
    const handle = { name: 'untitled.tw.json' } as FileSystemFileHandle;
    files.pickLocationAndWrite.mockImplementation(async (project: unknown) => {
      expect(project).toEqual(
        expect.objectContaining({
          version: SCHEMA_VERSION,
          name: 'Untitled Project',
          tasks: [],
        }),
      );
      return { handle, fileName: 'untitled.tw.json', lastModified: 1 };
    });

    const result = await session.newProject();
    expect(result.ok).toBe(true);
    expect(session.hasFile()).toBe(true);
    expect(session.hasWorkspace()).toBe(true);
    expect(session.fileName()).toBe('untitled.tw.json');
    expect(session.project()?.version).toBe(SCHEMA_VERSION);
    expect(session.saveError()).toBeNull();
  });

  it('newProject cancelled opens nothing', async () => {
    files.pickLocationAndWrite.mockRejectedValue(new UserCancelledFilePickerError());
    const result = await session.newProject();
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.cancelled).toBe(true);
    }
    expect(session.hasFile()).toBe(false);
    expect(session.hasWorkspace()).toBe(false);
    expect(session.project()).toBeNull();
  });

  it('newProject without File System Access uses New browser project', async () => {
    files.isSupported.mockReturnValue(false);
    const result = await session.newProject();
    expect(result.ok).toBe(true);
    expect(session.hasFile()).toBe(false);
    expect(session.savedInBrowser()).toBe(true);
    expect(session.hasWorkspace()).toBe(true);
    expect(session.project()?.name).toBe('Untitled Project');
    expect(cache.put).toHaveBeenCalled();
    expect(recents.recordBrowser).toHaveBeenCalled();

    const downloaded = session.downloadProject();
    expect(downloaded.ok).toBe(true);
    expect(files.download).toHaveBeenCalled();
  });

  it('newBrowserProject saves in this browser without a disk file', async () => {
    const result = await session.newBrowserProject();
    expect(result.ok).toBe(true);
    expect(session.savedInBrowser()).toBe(true);
    expect(session.hasFile()).toBe(false);
    expect(session.hasWorkspace()).toBe(true);
    expect(files.pickLocationAndWrite).not.toHaveBeenCalled();
    expect(cache.put).toHaveBeenCalled();
    expect(recents.recordBrowser).toHaveBeenCalled();
  });

  it('updateProject on a browser project persists to cache, not disk', async () => {
    await session.newBrowserProject();
    files.write.mockClear();
    cache.put.mockClear();
    recents.recordBrowser.mockClear();

    const result = await session.updateProject((p) => ({ ...p, name: 'Cached' }));
    expect(result.ok).toBe(true);
    expect(session.project()?.name).toBe('Cached');
    expect(files.write).not.toHaveBeenCalled();
    expect(cache.put).toHaveBeenCalled();
    expect(recents.recordBrowser).toHaveBeenCalled();
  });

  it('openRecent loads a browser-saved project from cache', async () => {
    const project = createEmptyProject();
    recents.getMeta.mockResolvedValue({
      id: project.id,
      name: project.name,
      fileName: null,
      source: 'browser',
      openedAt: '2026-08-01T00:00:00.000Z',
    });
    recents.getHandle.mockResolvedValue(null);
    cache.get.mockResolvedValue({
      id: project.id,
      project,
      fileName: null,
      cachedAt: '2026-08-01T00:00:00.000Z',
    });

    const result = await session.openRecent(project.id);
    expect(result.ok).toBe(true);
    expect(session.savedInBrowser()).toBe(true);
    expect(session.project()?.id).toBe(project.id);
    expect(files.readHandle).not.toHaveBeenCalled();
  });

  it('openRecent does not open a missing disk file from cache', async () => {
    const project = createEmptyProject();
    recents.getMeta.mockResolvedValue({
      id: project.id,
      name: project.name,
      fileName: 'gone.tw.json',
      source: 'file',
      openedAt: '2026-08-01T00:00:00.000Z',
    });
    recents.getHandle.mockResolvedValue(null);
    cache.get.mockResolvedValue({
      id: project.id,
      project,
      fileName: 'gone.tw.json',
      cachedAt: '2026-08-01T00:00:00.000Z',
    });

    const result = await session.openRecent(project.id);
    expect(result.ok).toBe(false);
    expect(session.hasWorkspace()).toBe(false);
    expect(cache.get).not.toHaveBeenCalled();
    expect(session.recentFailure()?.kind).toBe('missing');
  });

  it('openProject loads valid file into session', async () => {
    const project = createEmptyProject();
    const handle = { name: 'demo.tw.json' } as FileSystemFileHandle;
    files.pickAndRead.mockResolvedValue({
      handle,
      text: JSON.stringify(project),
      fileName: 'demo.tw.json',
      lastModified: 10,
    });

    const result = await session.openProject();
    expect(result.ok).toBe(true);
    expect(session.project()?.id).toBe(project.id);
    expect(session.fileName()).toBe('demo.tw.json');
  });

  it('openProject rejects invalid JSON with Invalid Task Warden file and leaves no session', async () => {
    files.pickAndRead.mockResolvedValue({
      handle: { name: 'bad.tw.json' } as FileSystemFileHandle,
      text: '{ not json',
      fileName: 'bad.tw.json',
      lastModified: 1,
    });

    const result = await session.openProject();
    expect(result.ok).toBe(false);
    expect(session.hasFile()).toBe(false);
    expect(session.project()).toBeNull();
    expect(session.uiError()).toContain(INVALID_FILE_MESSAGE);
    expect(session.uiError()?.startsWith(INVALID_FILE_MESSAGE)).toBe(true);
  });

  it('openProject rejects wrong version', async () => {
    const project = { ...createEmptyProject(), version: '9.9.9' };
    files.pickAndRead.mockResolvedValue({
      handle: { name: 'old.tw.json' } as FileSystemFileHandle,
      text: JSON.stringify(project),
      fileName: 'old.tw.json',
      lastModified: 1,
    });

    const result = await session.openProject();
    expect(result.ok).toBe(false);
    expect(session.uiError()).toContain(INVALID_FILE_MESSAGE);
  });

  it('openUploadedFile loads valid JSON into a saved-in-this-browser session', async () => {
    const project = createEmptyProject();
    const file = new File([JSON.stringify(project)], 'phone.tw.json', {
      type: 'application/json',
    });
    const result = await session.openUploadedFile(file);
    expect(result.ok).toBe(true);
    expect(session.savedInBrowser()).toBe(true);
    expect(session.project()?.id).toBe(project.id);
    expect(session.fileName()).toBe('phone.tw.json');
    expect(cache.put).toHaveBeenCalled();
    expect(recents.recordBrowser).toHaveBeenCalled();
  });

  it('updateProject mutates memory and auto-saves full object', async () => {
    const handle = { name: 'x.tw.json' } as FileSystemFileHandle;
    files.pickLocationAndWrite.mockResolvedValue({
      handle,
      fileName: 'x.tw.json',
      lastModified: 1,
    });
    await session.newProject();

    const result = await session.updateProject((p) => ({ ...p, name: 'Renamed' }));
    expect(result.ok).toBe(true);
    expect(session.project()?.name).toBe('Renamed');
    expect(files.write).toHaveBeenCalled();
    const written = files.write.mock.calls.at(-1)?.[1] as { name: string };
    expect(written.name).toBe('Renamed');
    expect(session.saveError()).toBeNull();
  });

  it('updateProject keeps memory and sets banner when save fails', async () => {
    const handle = { name: 'x.tw.json' } as FileSystemFileHandle;
    files.pickLocationAndWrite.mockResolvedValue({
      handle,
      fileName: 'x.tw.json',
      lastModified: 1,
    });
    await session.newProject();
    files.write.mockRejectedValue(new Error('disk full'));

    const result = await session.updateProject((p) => ({ ...p, name: 'OnlyInMemory' }));
    expect(result.ok).toBe(false);
    expect(session.project()?.name).toBe('OnlyInMemory');
    expect(session.saveError()).toBe(SAVE_FAILED_MESSAGE);
  });

  it('updateProject parks dirty-file when disk lastModified changed', async () => {
    const handle = { name: 'x.tw.json' } as FileSystemFileHandle;
    files.pickLocationAndWrite.mockResolvedValue({
      handle,
      fileName: 'x.tw.json',
      lastModified: 1,
    });
    files.getLastModified.mockResolvedValue(1);
    await session.newProject();
    files.write.mockClear();
    files.getLastModified.mockResolvedValue(99);

    const result = await session.updateProject((p) => ({ ...p, name: 'Stale' }));
    expect(result.ok).toBe(false);
    expect(session.project()?.name).toBe('Stale');
    expect(session.dirtyFile()?.fileName).toBe('x.tw.json');
    expect(files.write).not.toHaveBeenCalled();
  });

  it('resolveDirtyOverwrite writes memory to disk', async () => {
    const handle = { name: 'x.tw.json' } as FileSystemFileHandle;
    files.pickLocationAndWrite.mockResolvedValue({
      handle,
      fileName: 'x.tw.json',
      lastModified: 1,
    });
    files.getLastModified.mockResolvedValue(1);
    await session.newProject();
    files.getLastModified.mockResolvedValue(99);
    await session.updateProject((p) => ({ ...p, name: 'KeepMe' }));
    files.write.mockClear();
    files.getLastModified.mockResolvedValue(100);

    const result = await session.resolveDirtyOverwrite();
    expect(result.ok).toBe(true);
    expect(session.dirtyFile()).toBeNull();
    expect(files.write).toHaveBeenCalled();
    const written = files.write.mock.calls.at(-1)?.[1] as { name: string };
    expect(written.name).toBe('KeepMe');
  });

  it('retrySave clears banner when write succeeds', async () => {
    const handle = { name: 'x.tw.json' } as FileSystemFileHandle;
    files.pickLocationAndWrite.mockResolvedValue({
      handle,
      fileName: 'x.tw.json',
      lastModified: 1,
    });
    await session.newProject();
    files.write.mockRejectedValueOnce(new Error('fail'));
    await session.updateProject((p) => ({ ...p, name: 'A' }));
    expect(session.saveError()).toBe(SAVE_FAILED_MESSAGE);

    files.write.mockResolvedValue(undefined);
    const result = await session.retrySave();
    expect(result.ok).toBe(true);
    expect(session.saveError()).toBeNull();
  });

  it('closeProject detaches file and returns to create-or-open', async () => {
    const handle = { name: 'x.tw.json' } as FileSystemFileHandle;
    files.pickLocationAndWrite.mockResolvedValue({
      handle,
      fileName: 'x.tw.json',
      lastModified: 1,
    });
    await session.newProject();
    session.closeProject();
    expect(session.hasFile()).toBe(false);
    expect(session.hasWorkspace()).toBe(false);
    expect(session.fileName()).toBeNull();
    expect(session.project()).toBeNull();
  });

  it('surfaces unsupported browser message on Chrome picker path', async () => {
    files.isSupported.mockReturnValue(false);
    const result = await session.openProject();
    expect(result.ok).toBe(false);
    expect(session.uiError()).toContain('Chrome or Edge');
    expect(new FileSystemUnsupportedError().message).toContain('Chrome or Edge');
  });

  it('createTask adds a task and auto-saves', async () => {
    const handle = { name: 'x.tw.json' } as FileSystemFileHandle;
    files.pickLocationAndWrite.mockResolvedValue({
      handle,
      fileName: 'x.tw.json',
      lastModified: 1,
    });
    await session.newProject();

    const result = await session.createTask({ title: 'First', status: 'Todo' });
    expect(result.ok).toBe(true);
    expect(session.project()?.tasks).toHaveLength(1);
    expect(session.project()?.tasks[0].title).toBe('First');
    expect(session.project()?.tasks[0].id).toBe('t1');
    expect(files.write).toHaveBeenCalled();
  });

  it('saveTask updates title and body and preserves status', async () => {
    const handle = { name: 'x.tw.json' } as FileSystemFileHandle;
    files.pickLocationAndWrite.mockResolvedValue({
      handle,
      fileName: 'x.tw.json',
      lastModified: 1,
    });
    await session.newProject();
    await session.createTask({ title: 'Work', description: 'old', status: 'Todo' });
    const id = session.project()!.tasks[0].id;

    const result = await session.saveTask(id, {
      title: 'Work',
      description: 'done',
    });
    expect(result.ok).toBe(true);
    const task = session.project()!.tasks[0];
    expect(task.status).toBe('Todo');
    expect(task.description).toBe('done');
    expect(task.closed).toBeNull();
  });

  it('deleteTask removes the task and auto-saves', async () => {
    const handle = { name: 'x.tw.json' } as FileSystemFileHandle;
    files.pickLocationAndWrite.mockResolvedValue({
      handle,
      fileName: 'x.tw.json',
      lastModified: 1,
    });
    await session.newProject();
    await session.createTask({ title: 'Gone', status: 'Todo' });
    const id = session.project()!.tasks[0].id;

    const result = await session.deleteTask(id);
    expect(result.ok).toBe(true);
    expect(session.project()?.tasks).toHaveLength(0);
  });

  it('moveTask changes status and auto-saves', async () => {
    const handle = { name: 'x.tw.json' } as FileSystemFileHandle;
    files.pickLocationAndWrite.mockResolvedValue({
      handle,
      fileName: 'x.tw.json',
      lastModified: 1,
    });
    await session.newProject();
    await session.createTask({ title: 'Move me', status: 'Todo' });
    const id = session.project()!.tasks[0].id;

    const result = await session.moveTask(id, 'In Progress');
    expect(result.ok).toBe(true);
    expect(session.project()!.tasks[0].status).toBe('In Progress');
    expect(files.write).toHaveBeenCalled();
  });

  it('setProjectName renames and auto-saves', async () => {
    const handle = { name: 'x.tw.json' } as FileSystemFileHandle;
    files.pickLocationAndWrite.mockResolvedValue({
      handle,
      fileName: 'x.tw.json',
      lastModified: 1,
    });
    await session.newProject();

    const result = await session.setProjectName('  My Board  ');
    expect(result.ok).toBe(true);
    expect(session.project()?.name).toBe('My Board');
  });

  it('addStatus / renameStatus / reorderStatuses / deleteStatus', async () => {
    const handle = { name: 'x.tw.json' } as FileSystemFileHandle;
    files.pickLocationAndWrite.mockResolvedValue({
      handle,
      fileName: 'x.tw.json',
      lastModified: 1,
    });
    await session.newProject();

    expect((await session.addStatus('Review')).ok).toBe(true);
    expect(session.project()?.statuses).toContain('Review');

    expect((await session.renameStatus('Review', 'QA')).ok).toBe(true);
    expect(session.project()?.statuses).toContain('QA');

    const statuses = session.project()!.statuses;
    const from = statuses.indexOf('QA');
    const to = 0;
    expect((await session.reorderStatuses(from, to)).ok).toBe(true);
    expect(session.project()?.statuses[0]).toBe('QA');

    expect((await session.deleteStatus('QA')).ok).toBe(true);
    expect(session.project()?.statuses).not.toContain('QA');
  });

  it('deleteStatus fails when column has tasks', async () => {
    const handle = { name: 'x.tw.json' } as FileSystemFileHandle;
    files.pickLocationAndWrite.mockResolvedValue({
      handle,
      fileName: 'x.tw.json',
      lastModified: 1,
    });
    await session.newProject();
    await session.createTask({ title: 'Blocker', status: 'Todo' });
    const result = await session.deleteStatus('Todo');
    expect(result.ok).toBe(false);
  });

  it('reloadFromDisk replaces memory with validated disk content', async () => {
    const handle = { name: 'x.tw.json' } as FileSystemFileHandle;
    files.pickLocationAndWrite.mockResolvedValue({
      handle,
      fileName: 'x.tw.json',
      lastModified: 1,
    });
    await session.newProject();
    await session.setProjectName('OnlyInMemory');

    const disk = createEmptyProject();
    disk.name = 'FromDisk';
    files.readHandle.mockResolvedValue({
      handle,
      text: JSON.stringify(disk),
      fileName: 'x.tw.json',
      lastModified: 2,
    });

    const result = await session.reloadFromDisk();
    expect(result.ok).toBe(true);
    expect(session.project()?.name).toBe('FromDisk');
    expect(session.uiError()).toBeNull();
  });

  it('reloadFromDisk keeps memory when disk JSON is invalid', async () => {
    const handle = { name: 'x.tw.json' } as FileSystemFileHandle;
    files.pickLocationAndWrite.mockResolvedValue({
      handle,
      fileName: 'x.tw.json',
      lastModified: 1,
    });
    await session.newProject();
    await session.setProjectName('KeepMe');

    files.readHandle.mockResolvedValue({
      handle,
      text: '{ not json',
      fileName: 'x.tw.json',
      lastModified: 2,
    });

    const result = await session.reloadFromDisk();
    expect(result.ok).toBe(false);
    expect(session.project()?.name).toBe('KeepMe');
    expect(session.uiError()).toContain(INVALID_FILE_MESSAGE);
  });

  it('bootstrap does not auto-open a workspace', async () => {
    await session.bootstrap();
    expect(session.hasWorkspace()).toBe(false);
    expect(session.hasFile()).toBe(false);
    expect(session.project()).toBeNull();
    expect(recents.refresh).toHaveBeenCalled();
  });
});
