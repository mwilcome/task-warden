import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ProjectSessionService } from '../core/project/project-session.service';
import { createEmptyProject } from '../core/project/create-empty-project';
import { HomeComponent } from './home.component';

function sessionStub(overrides: Record<string, unknown> = {}) {
  const project = signal(overrides['project'] ?? null);
  const hasWorkspace = signal(overrides['hasWorkspace'] ?? false);
  return {
    project: project.asReadonly(),
    fileName: signal(null).asReadonly(),
    saveError: signal(null).asReadonly(),
    uiError: signal(null).asReadonly(),
    busy: signal(false).asReadonly(),
    hasFile: signal(false).asReadonly(),
    hasWorkspace: hasWorkspace.asReadonly(),
    savedInBrowser: signal(false).asReadonly(),
    fileSystemSupported: true,
    recentProjects: signal([]).asReadonly(),
    recentFailure: signal(null).asReadonly(),
    dirtyFile: signal(null).asReadonly(),
    taskPanel: signal(null).asReadonly(),
    newProject: vi.fn(),
    newBrowserProject: vi.fn(),
    openProject: vi.fn(),
    openUploadedFile: vi.fn(),
    openRecent: vi.fn(),
    downloadProject: vi.fn(),
    closeProject: vi.fn(),
    retrySave: vi.fn(),
    reloadFromDisk: vi.fn(),
    clearUiError: vi.fn(),
    dismissRecentFailure: vi.fn(),
    removeFailedRecent: vi.fn(),
    openFileForFailedRecent: vi.fn(),
    resolveDirtyReload: vi.fn(),
    resolveDirtyOverwrite: vi.fn(),
    setProjectName: vi.fn(),
    openTaskPanel: vi.fn(),
    closeTaskPanel: vi.fn(),
    deleteBrowserProject: vi.fn(),
    ...overrides,
  };
}

describe('HomeComponent', () => {
  it('blocks the board until a project is opened and shows create-or-open', async () => {
    await TestBed.configureTestingModule({
      imports: [HomeComponent],
      providers: [{ provide: ProjectSessionService, useValue: sessionStub() }],
    }).compileComponents();

    const fixture = TestBed.createComponent(HomeComponent);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;

    expect(el.querySelector('app-board')).toBeNull();
    expect(el.textContent).toContain('Create or open a project');
    expect(el.textContent).toContain('New project');
    expect(el.textContent).toContain('New browser project');
    expect(el.textContent).toContain('Open project');
    expect(el.textContent).toContain('Download schema (.md)');
  });

  it('renders the board only after a workspace exists', async () => {
    const project = createEmptyProject();
    await TestBed.configureTestingModule({
      imports: [HomeComponent],
      providers: [
        {
          provide: ProjectSessionService,
          useValue: sessionStub({
            project: signal(project).asReadonly(),
            hasWorkspace: signal(true).asReadonly(),
            hasFile: signal(true).asReadonly(),
            fileName: signal('demo.tw.json').asReadonly(),
          }),
        },
      ],
    }).compileComponents();

    const fixture = TestBed.createComponent(HomeComponent);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;

    expect(el.querySelector('app-board')).toBeTruthy();
    expect(el.textContent).toContain(project.name);
    expect(el.textContent).not.toContain('Create or open a project');
  });

  it('shows saved-in-this-browser copy and download without a disk file', async () => {
    const project = createEmptyProject();
    await TestBed.configureTestingModule({
      imports: [HomeComponent],
      providers: [
        {
          provide: ProjectSessionService,
          useValue: sessionStub({
            project: signal(project).asReadonly(),
            hasWorkspace: signal(true).asReadonly(),
            hasFile: signal(false).asReadonly(),
            savedInBrowser: signal(true).asReadonly(),
          }),
        },
      ],
    }).compileComponents();

    const fixture = TestBed.createComponent(HomeComponent);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;

    expect(el.querySelector('app-board')).toBeTruthy();
    expect(el.textContent).toContain('Saved in this browser');
    expect(el.textContent).toContain('Download');
    expect(el.textContent).not.toContain('Reload');
  });

  it('offers Delete this project for a browser-saved board', async () => {
    const project = createEmptyProject();
    await TestBed.configureTestingModule({
      imports: [HomeComponent],
      providers: [
        {
          provide: ProjectSessionService,
          useValue: sessionStub({
            project: signal(project).asReadonly(),
            hasWorkspace: signal(true).asReadonly(),
            hasFile: signal(false).asReadonly(),
            savedInBrowser: signal(true).asReadonly(),
          }),
        },
      ],
    }).compileComponents();

    const fixture = TestBed.createComponent(HomeComponent);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    const trigger = el.querySelector('.projects-menu__trigger') as HTMLButtonElement;
    trigger.click();
    fixture.detectChanges();

    expect(el.textContent).toContain('Delete this project');
  });

  it('does not offer Delete this project for a disk file', async () => {
    const project = createEmptyProject();
    await TestBed.configureTestingModule({
      imports: [HomeComponent],
      providers: [
        {
          provide: ProjectSessionService,
          useValue: sessionStub({
            project: signal(project).asReadonly(),
            hasWorkspace: signal(true).asReadonly(),
            hasFile: signal(true).asReadonly(),
            savedInBrowser: signal(false).asReadonly(),
            fileName: signal('demo.tw.json').asReadonly(),
          }),
        },
      ],
    }).compileComponents();

    const fixture = TestBed.createComponent(HomeComponent);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    const trigger = el.querySelector('.projects-menu__trigger') as HTMLButtonElement;
    trigger.click();
    fixture.detectChanges();

    expect(el.textContent).not.toContain('Delete this project');
  });

  it('renders New task outside the board scrollport', async () => {
    const project = createEmptyProject();
    await TestBed.configureTestingModule({
      imports: [HomeComponent],
      providers: [
        {
          provide: ProjectSessionService,
          useValue: sessionStub({
            project: signal(project).asReadonly(),
            hasWorkspace: signal(true).asReadonly(),
            savedInBrowser: signal(true).asReadonly(),
            taskPanel: signal({ kind: 'create', status: 'Todo' }).asReadonly(),
          }),
        },
      ],
    }).compileComponents();

    const fixture = TestBed.createComponent(HomeComponent);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;

    expect(el.querySelector('app-task-panel')).toBeTruthy();
    expect(el.querySelector('.app-main--board app-task-panel')).toBeNull();
    expect(el.querySelector('#task-title')).toBeTruthy();
    expect(el.textContent).toContain('Body');
    expect(el.textContent).toContain('Add task');
    expect(el.textContent).toContain('Cancel');
  });
});
