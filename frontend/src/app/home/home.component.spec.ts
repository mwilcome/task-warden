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
    needsDownload: signal(false).asReadonly(),
    fileSystemSupported: true,
    recentProjects: signal([]).asReadonly(),
    recentFailure: signal(null).asReadonly(),
    dirtyFile: signal(null).asReadonly(),
    newProject: vi.fn(),
    openProject: vi.fn(),
    openUploadedFile: vi.fn(),
    openRecent: vi.fn(),
    openLastProject: vi.fn(),
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
    expect(el.textContent).toContain('Open project');
    expect(el.textContent).toContain('Download schema (.md)');
    expect(el.textContent).toContain('no in-app AI');
    expect(el.textContent?.toLowerCase()).not.toContain('last opened');
    expect(el.textContent?.toLowerCase()).not.toContain('wizard');
    expect(el.textContent?.toLowerCase()).not.toContain('browser only');
    expect(typeof fixture.componentInstance.onOpenLastProject).toBe('function');
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
});
