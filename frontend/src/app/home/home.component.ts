import {
  Component,
  ElementRef,
  HostListener,
  effect,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { BoardComponent } from '../board/board.component';
import { downloadProjectFileGuide } from '../core/project/project-file-guide';
import { INVALID_FILE_MESSAGE } from '../core/project/project.types';
import { ProjectSessionService } from '../core/project/project-session.service';
import { BrandMarkComponent } from './brand-mark.component';

@Component({
  selector: 'app-home',
  imports: [BoardComponent, FormsModule, BrandMarkComponent],
  templateUrl: './home.component.html',
})
export class HomeComponent {
  protected readonly session = inject(ProjectSessionService);

  protected readonly editingName = signal(false);
  protected readonly nameDraft = signal('');
  protected readonly nameError = signal<string | null>(null);
  protected readonly projectsMenuOpen = signal(false);

  private readonly nameInput = viewChild<ElementRef<HTMLInputElement>>('nameInput');
  private readonly projectsMenuRoot = viewChild<ElementRef<HTMLElement>>('projectsMenu');

  constructor() {
    effect(() => {
      const project = this.session.project();
      if (!this.editingName()) {
        this.nameDraft.set(project.name);
      }
    });

    effect(() => {
      if (!this.editingName()) {
        return;
      }
      queueMicrotask(() => {
        this.nameInput()?.nativeElement.focus();
        this.nameInput()?.nativeElement.select();
      });
    });
  }

  protected get isInvalidFileError(): boolean {
    const err = this.session.uiError();
    return !!err && err.startsWith(INVALID_FILE_MESSAGE);
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    if (!this.projectsMenuOpen()) {
      return;
    }
    const root = this.projectsMenuRoot()?.nativeElement;
    if (root && !root.contains(event.target as Node)) {
      this.projectsMenuOpen.set(false);
    }
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.projectsMenuOpen()) {
      this.projectsMenuOpen.set(false);
    }
  }

  toggleProjectsMenu(event: Event): void {
    event.stopPropagation();
    this.projectsMenuOpen.update((open) => !open);
  }

  async onNewProject(): Promise<void> {
    this.projectsMenuOpen.set(false);
    await this.session.newProject();
  }

  async onNewBrowserOnlyProject(): Promise<void> {
    this.projectsMenuOpen.set(false);
    await this.session.newBrowserOnlyProject();
  }

  async onOpenProject(): Promise<void> {
    this.projectsMenuOpen.set(false);
    await this.session.openProject();
  }

  async onOpenRecent(projectId: string): Promise<void> {
    this.projectsMenuOpen.set(false);
    await this.session.openRecent(projectId);
  }

  async onOpenLastProject(): Promise<void> {
    this.projectsMenuOpen.set(false);
    await this.session.openLastProject();
  }

  onDownloadProjectFileGuide(): void {
    this.projectsMenuOpen.set(false);
    downloadProjectFileGuide();
  }

  onCloseProject(): void {
    this.session.closeProject();
  }

  async onRetrySave(): Promise<void> {
    await this.session.retrySave();
  }

  async onReloadFromDisk(): Promise<void> {
    await this.session.reloadFromDisk();
  }

  onDismissUiError(): void {
    this.session.clearUiError();
  }

  onDismissRecentFailure(): void {
    this.session.dismissRecentFailure();
  }

  async onRemoveFailedRecent(): Promise<void> {
    await this.session.removeFailedRecent();
  }

  async onOpenFileForFailedRecent(): Promise<void> {
    await this.session.openFileForFailedRecent();
  }

  async onConflictUseDisk(): Promise<void> {
    await this.session.resolveConflictUseDisk();
  }

  async onConflictUseCache(): Promise<void> {
    await this.session.resolveConflictUseCache();
  }

  onConflictCancel(): void {
    this.session.dismissConflict();
  }

  onStartEditName(): void {
    const project = this.session.project();
    this.nameDraft.set(project.name);
    this.nameError.set(null);
    this.editingName.set(true);
  }

  onNameKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter') {
      event.preventDefault();
      void this.commitName();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      this.cancelNameEdit();
    }
  }

  onNameBlur(): void {
    if (this.editingName()) {
      void this.commitName();
    }
  }

  private cancelNameEdit(): void {
    this.nameDraft.set(this.session.project().name);
    this.nameError.set(null);
    this.editingName.set(false);
  }

  private async commitName(): Promise<void> {
    if (!this.editingName()) {
      return;
    }
    const draft = this.nameDraft().trim();
    if (!draft) {
      this.nameError.set('Project name is required.');
      return;
    }
    const result = await this.session.setProjectName(draft);
    if (!result.ok) {
      this.nameError.set(result.message);
      return;
    }
    this.nameError.set(null);
    this.editingName.set(false);
  }
}
