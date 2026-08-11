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
    write: ReturnType<typeof vi.fn>;
  };
  let cache: {
    getLastProjectId: ReturnType<typeof vi.fn>;
    setLastProjectId: ReturnType<typeof vi.fn>;
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
      write: vi.fn(async () => undefined),
    };
    cache = {
      getLastProjectId: vi.fn(() => null),
      setLastProjectId: vi.fn(),
      put: vi.fn(async () => undefined),
      get: vi.fn(async () => null),
      remove: vi.fn(async () => undefined),
    };

    TestBed.configureTestingModule({
      providers: [
        ProjectSessionService,
        { provide: ProjectFileRepository, useValue: files },
        { provide: ProjectCacheService, useValue: cache },
        {
          provide: RecentProjectsService,
          useValue: {
            list: signal([]).asReadonly(),
            record: vi.fn(async () => undefined),
            getHandle: vi.fn(async () => null),
            getMeta: vi.fn(async () => null),
            remove: vi.fn(async () => undefined),
            refresh: vi.fn(async () => undefined),
          },
        },
      ],
    });
    session = TestBed.inject(ProjectSessionService);
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
      return { handle, fileName: 'untitled.tw.json' };
    });

    const result = await session.newProject();
    expect(result.ok).toBe(true);
    expect(session.hasFile()).toBe(true);
    expect(session.fileName()).toBe('untitled.tw.json');
    expect(session.project()?.version).toBe(SCHEMA_VERSION);
    expect(session.saveError()).toBeNull();
  });

  it('newProject cancelled keeps draft board without a file', async () => {
    files.pickLocationAndWrite.mockRejectedValue(new UserCancelledFilePickerError());
    const result = await session.newProject();
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.cancelled).toBe(true);
    }
    expect(session.hasFile()).toBe(false);
    expect(session.project()).toBeTruthy();
  });

  it('openProject loads valid file into session', async () => {
    const project = createEmptyProject();
    const handle = { name: 'demo.tw.json' } as FileSystemFileHandle;
    files.pickAndRead.mockResolvedValue({
      handle,
      text: JSON.stringify(project),
      fileName: 'demo.tw.json',
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
    });

    const result = await session.openProject();
    expect(result.ok).toBe(false);
    expect(session.hasFile()).toBe(false);
    expect(session.project()).toBeTruthy();
    expect(session.uiError()).toContain(INVALID_FILE_MESSAGE);
    expect(session.uiError()?.startsWith(INVALID_FILE_MESSAGE)).toBe(true);
  });

  it('openProject rejects wrong version', async () => {
    const project = { ...createEmptyProject(), version: '9.9.9' };
    files.pickAndRead.mockResolvedValue({
      handle: { name: 'old.tw.json' } as FileSystemFileHandle,
      text: JSON.stringify(project),
      fileName: 'old.tw.json',
    });

    const result = await session.openProject();
    expect(result.ok).toBe(false);
    expect(session.uiError()).toContain(INVALID_FILE_MESSAGE);
  });

  it('updateProject mutates memory and auto-saves full object', async () => {
    const project = createEmptyProject();
    const handle = { name: 'x.tw.json' } as FileSystemFileHandle;
    files.pickLocationAndWrite.mockResolvedValue({ handle, fileName: 'x.tw.json' });
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
    files.pickLocationAndWrite.mockResolvedValue({ handle, fileName: 'x.tw.json' });
    await session.newProject();
    files.write.mockRejectedValue(new Error('disk full'));

    const result = await session.updateProject((p) => ({ ...p, name: 'OnlyInMemory' }));
    expect(result.ok).toBe(false);
    expect(session.project()?.name).toBe('OnlyInMemory');
    expect(session.saveError()).toBe(SAVE_FAILED_MESSAGE);
  });

  it('retrySave clears banner when write succeeds', async () => {
    const handle = { name: 'x.tw.json' } as FileSystemFileHandle;
    files.pickLocationAndWrite.mockResolvedValue({ handle, fileName: 'x.tw.json' });
    await session.newProject();
    files.write.mockRejectedValueOnce(new Error('fail'));
    await session.updateProject((p) => ({ ...p, name: 'A' }));
    expect(session.saveError()).toBe(SAVE_FAILED_MESSAGE);

    files.write.mockResolvedValue(undefined);
    const result = await session.retrySave();
    expect(result.ok).toBe(true);
    expect(session.saveError()).toBeNull();
  });

  it('closeProject detaches file and resets to empty draft board', async () => {
    const handle = { name: 'x.tw.json' } as FileSystemFileHandle;
    files.pickLocationAndWrite.mockResolvedValue({ handle, fileName: 'x.tw.json' });
    await session.newProject();
    session.closeProject();
    expect(session.hasFile()).toBe(false);
    expect(session.fileName()).toBeNull();
    expect(session.project()).toBeTruthy();
    expect(session.project()?.tasks).toEqual([]);
  });

  it('surfaces unsupported browser message', async () => {
    files.isSupported.mockReturnValue(false);
    const result = await session.openProject();
    expect(result.ok).toBe(false);
    expect(session.uiError()).toContain('Chrome or Edge');
    expect(new FileSystemUnsupportedError().message).toContain('Chrome or Edge');
  });

  it('createTask adds a task and auto-saves', async () => {
    const handle = { name: 'x.tw.json' } as FileSystemFileHandle;
    files.pickLocationAndWrite.mockResolvedValue({ handle, fileName: 'x.tw.json' });
    await session.newProject();

    const result = await session.createTask({ title: 'First', status: 'Todo', points: 2 });
    expect(result.ok).toBe(true);
    expect(session.project()?.tasks).toHaveLength(1);
    expect(session.project()?.tasks[0].title).toBe('First');
    expect(session.project()?.tasks[0].points).toBe(2);
    expect(files.write).toHaveBeenCalled();
  });

  it('saveTask updates fields and closed when moved to last status', async () => {
    const handle = { name: 'x.tw.json' } as FileSystemFileHandle;
    files.pickLocationAndWrite.mockResolvedValue({ handle, fileName: 'x.tw.json' });
    await session.newProject();
    await session.createTask({ title: 'Work', status: 'Todo' });
    const id = session.project()!.tasks[0].id;

    const result = await session.saveTask(id, {
      title: 'Work',
      description: 'done',
      points: null,
      assigned: null,
      status: 'Done',
    });
    expect(result.ok).toBe(true);
    const task = session.project()!.tasks[0];
    expect(task.status).toBe('Done');
    expect(task.closed).not.toBeNull();
    expect(task.description).toBe('done');
  });

  it('deleteTask removes the task and auto-saves', async () => {
    const handle = { name: 'x.tw.json' } as FileSystemFileHandle;
    files.pickLocationAndWrite.mockResolvedValue({ handle, fileName: 'x.tw.json' });
    await session.newProject();
    await session.createTask({ title: 'Gone', status: 'Todo' });
    const id = session.project()!.tasks[0].id;

    const result = await session.deleteTask(id);
    expect(result.ok).toBe(true);
    expect(session.project()?.tasks).toHaveLength(0);
  });

  it('moveTask changes status and auto-saves', async () => {
    const handle = { name: 'x.tw.json' } as FileSystemFileHandle;
    files.pickLocationAndWrite.mockResolvedValue({ handle, fileName: 'x.tw.json' });
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
    files.pickLocationAndWrite.mockResolvedValue({ handle, fileName: 'x.tw.json' });
    await session.newProject();

    const result = await session.setProjectName('  My Board  ');
    expect(result.ok).toBe(true);
    expect(session.project()?.name).toBe('My Board');
  });

  it('addStatus / renameStatus / reorderStatuses / deleteStatus', async () => {
    const handle = { name: 'x.tw.json' } as FileSystemFileHandle;
    files.pickLocationAndWrite.mockResolvedValue({ handle, fileName: 'x.tw.json' });
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
    files.pickLocationAndWrite.mockResolvedValue({ handle, fileName: 'x.tw.json' });
    await session.newProject();
    await session.createTask({ title: 'Blocker', status: 'Todo' });
    const result = await session.deleteStatus('Todo');
    expect(result.ok).toBe(false);
  });

  it('reloadFromDisk replaces memory with validated disk content', async () => {
    const handle = { name: 'x.tw.json' } as FileSystemFileHandle;
    files.pickLocationAndWrite.mockResolvedValue({ handle, fileName: 'x.tw.json' });
    await session.newProject();
    await session.setProjectName('OnlyInMemory');

    const disk = createEmptyProject();
    disk.name = 'FromDisk';
    files.readHandle.mockResolvedValue({
      text: JSON.stringify(disk),
      fileName: 'x.tw.json',
    });

    const result = await session.reloadFromDisk();
    expect(result.ok).toBe(true);
    expect(session.project()?.name).toBe('FromDisk');
    expect(session.uiError()).toBeNull();
  });

  it('reloadFromDisk keeps memory when disk JSON is invalid', async () => {
    const handle = { name: 'x.tw.json' } as FileSystemFileHandle;
    files.pickLocationAndWrite.mockResolvedValue({ handle, fileName: 'x.tw.json' });
    await session.newProject();
    await session.setProjectName('KeepMe');

    files.readHandle.mockResolvedValue({
      text: '{ not json',
      fileName: 'x.tw.json',
    });

    const result = await session.reloadFromDisk();
    expect(result.ok).toBe(false);
    expect(session.project()?.name).toBe('KeepMe');
    expect(session.uiError()).toContain(INVALID_FILE_MESSAGE);
  });

  it('updateProject writes browser cache when a file is attached', async () => {
    const handle = { name: 'x.tw.json' } as FileSystemFileHandle;
    files.pickLocationAndWrite.mockResolvedValue({ handle, fileName: 'x.tw.json' });
    await session.newProject();
    cache.put.mockClear();

    await session.updateProject((p) => ({ ...p, name: 'Cached' }));
    expect(cache.put).toHaveBeenCalled();
    const putArg = cache.put.mock.calls.at(-1)?.[0] as { name: string };
    expect(putArg.name).toBe('Cached');
  });

  it('openProject surfaces conflict when cache disagrees with disk', async () => {
    const disk = createEmptyProject();
    disk.name = 'Disk';
    const cached = { ...createEmptyProject(), id: disk.id, name: 'Browser' };
    cache.get.mockResolvedValue({
      id: disk.id,
      project: cached,
      fileName: 'demo.tw.json',
      cachedAt: new Date().toISOString(),
    });
    files.pickAndRead.mockResolvedValue({
      handle: { name: 'demo.tw.json' } as FileSystemFileHandle,
      text: JSON.stringify(disk),
      fileName: 'demo.tw.json',
    });

    const result = await session.openProject();
    expect(result.ok).toBe(false);
    expect(session.cacheConflict()).toBeTruthy();
    expect(session.hasFile()).toBe(false);

    const useDisk = await session.resolveConflictUseDisk();
    expect(useDisk.ok).toBe(true);
    expect(session.project()?.name).toBe('Disk');
    expect(session.cacheConflict()).toBeNull();
  });

  it('bootstrap does not auto-open; only prepares last-project hint', async () => {
    const project = createEmptyProject();
    project.name = 'FromCache';
    cache.getLastProjectId.mockReturnValue(project.id);
    cache.get.mockResolvedValue({
      id: project.id,
      project,
      fileName: 'from-cache.tw.json',
      cachedAt: new Date().toISOString(),
    });

    await session.bootstrap();
    expect(session.hasWorkspace()).toBe(false);
    expect(session.hasFile()).toBe(false);
    expect(session.lastProject()?.name).toBe('FromCache');
  });

  it('openLastProject loads from cache when no file handle', async () => {
    const project = createEmptyProject();
    project.name = 'FromCache';
    cache.getLastProjectId.mockReturnValue(project.id);
    cache.get.mockResolvedValue({
      id: project.id,
      project,
      fileName: 'from-cache.tw.json',
      cachedAt: new Date().toISOString(),
    });

    await session.bootstrap();
    const result = await session.openLastProject();
    expect(result.ok).toBe(true);
    expect(session.project()?.name).toBe('FromCache');
    expect(session.hasWorkspace()).toBe(true);
    expect(session.cacheOnly()).toBe(true);
  });
});
