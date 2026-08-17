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
import { ProjectSessionService } from '../core/project/project-session.service';
import { OneAtATime, focusInput, onEnterOrEscape } from '../core/ui';
import { BrandMarkComponent } from './brand-mark.component';

@Component({
  selector: 'app-home',
  imports: [BoardComponent, FormsModule, BrandMarkComponent],
  templateUrl: './home.component.html',
})
export class HomeComponent {
  protected readonly session = inject(ProjectSessionService);
  protected readonly downloadProjectFileGuide = downloadProjectFileGuide;

  protected readonly editingName = signal(false);
  protected readonly nameDraft = signal('');
  protected readonly nameError = signal<string | null>(null);
  protected readonly projectsMenuOpen = signal(false);

  private readonly nameInput = viewChild<ElementRef<HTMLInputElement>>('nameInput');
  private readonly projectsMenuRoot = viewChild<ElementRef<HTMLElement>>('projectsMenu');
  private readonly nameLock = new OneAtATime();

  constructor() {
    effect(() => {
      const project = this.session.project();
      if (!this.editingName()) {
        this.nameDraft.set(project.name);
      }
    });

    effect(() => {
      if (this.editingName()) {
        queueMicrotask(() => focusInput(this.nameInput()));
      }
    });
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

  protected runAndClose(action: () => unknown): void {
    this.projectsMenuOpen.set(false);
    void action();
  }

  onStartEditName(): void {
    const project = this.session.project();
    this.nameDraft.set(project.name);
    this.nameError.set(null);
    this.editingName.set(true);
  }

  onNameKeydown(event: KeyboardEvent): void {
    onEnterOrEscape(
      event,
      () => void this.commitName(),
      () => this.cancelNameEdit(),
    );
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
    await this.nameLock.run(async () => {
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
    });
  }
}
