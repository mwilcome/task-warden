import { TestBed } from '@angular/core/testing';
import {
  FileSystemUnsupportedError,
  ProjectFileRepository,
  UserCancelledFilePickerError,
} from '../fs/project-file.repository';
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
    write: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    files = {
      isSupported: vi.fn(() => true),
      pickAndRead: vi.fn(),
      pickLocationAndWrite: vi.fn(),
      write: vi.fn(async () => undefined),
    };

    TestBed.configureTestingModule({
      providers: [
        ProjectSessionService,
        { provide: ProjectFileRepository, useValue: files },
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
    expect(session.hasProject()).toBe(true);
    expect(session.fileName()).toBe('untitled.tw.json');
    expect(session.project()?.version).toBe(SCHEMA_VERSION);
    expect(session.saveError()).toBeNull();
  });

  it('newProject cancelled leaves no project open', async () => {
    files.pickLocationAndWrite.mockRejectedValue(new UserCancelledFilePickerError());
    const result = await session.newProject();
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.cancelled).toBe(true);
    }
    expect(session.hasProject()).toBe(false);
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
    expect(session.hasProject()).toBe(false);
    expect(session.project()).toBeNull();
    expect(session.fileName()).toBeNull();
    expect(session.uiError()).toContain(INVALID_FILE_MESSAGE);
    // User can still recover on the landing path (Story L).
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

  it('closeProject clears session (re-open required next visit)', async () => {
    const handle = { name: 'x.tw.json' } as FileSystemFileHandle;
    files.pickLocationAndWrite.mockResolvedValue({ handle, fileName: 'x.tw.json' });
    await session.newProject();
    session.closeProject();
    expect(session.hasProject()).toBe(false);
    expect(session.fileName()).toBeNull();
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
});
