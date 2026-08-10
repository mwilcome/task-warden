import {
  Component,
  ElementRef,
  effect,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { BoardComponent } from '../board/board.component';
import { INVALID_FILE_MESSAGE } from '../core/project/project.types';
import { ProjectSessionService } from '../core/project/project-session.service';

/**
 * Landing (no file) and project shell with board when a file is open.
 * Stories L + M: empty/error recovery + keyboard-friendly name edit.
 * Styles: global classes only (src/styles.scss).
 */
@Component({
  selector: 'app-home',
  imports: [BoardComponent, FormsModule],
  templateUrl: './home.component.html',
})
export class HomeComponent {
  protected readonly session = inject(ProjectSessionService);

  protected readonly editingName = signal(false);
  protected readonly nameDraft = signal('');
  protected readonly nameError = signal<string | null>(null);

  private readonly nameInput = viewChild<ElementRef<HTMLInputElement>>('nameInput');

  constructor() {
    effect(() => {
      const project = this.session.project();
      if (!project) {
        this.editingName.set(false);
        this.nameDraft.set('');
        this.nameError.set(null);
        return;
      }
      if (!this.editingName()) {
        this.nameDraft.set(project.name);
      }
    });

    effect(() => {
      if (!this.editingName()) {
        return;
      }
      // Defer until the input is in the DOM.
      queueMicrotask(() => {
        this.nameInput()?.nativeElement.focus();
        this.nameInput()?.nativeElement.select();
      });
    });
  }

  /** True when the last UI error is a validation/open failure on a .tw.json file. */
  protected get isInvalidFileError(): boolean {
    const err = this.session.uiError();
    return !!err && err.startsWith(INVALID_FILE_MESSAGE);
  }

  async onNewProject(): Promise<void> {
    await this.session.newProject();
  }

  async onOpenProject(): Promise<void> {
    await this.session.openProject();
  }

  onCloseProject(): void {
    this.session.closeProject();
  }

  async onRetrySave(): Promise<void> {
    await this.session.retrySave();
  }

  onDismissUiError(): void {
    this.session.clearUiError();
  }

  onStartEditName(): void {
    const project = this.session.project();
    if (!project) {
      return;
    }
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
    const project = this.session.project();
    this.nameDraft.set(project?.name ?? '');
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
