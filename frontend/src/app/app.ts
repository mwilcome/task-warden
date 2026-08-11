import { Component, inject, OnInit } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { ProjectSessionService } from './core/project/project-session.service';

/**
 * Root shell — routing only.
 * No component styles: all visuals live in src/styles.scss (see docs/architecture.md).
 */
@Component({
  selector: 'app-root',
  imports: [RouterOutlet],
  template: `<router-outlet />`,
})
export class App implements OnInit {
  private readonly session = inject(ProjectSessionService);

  ngOnInit(): void {
    void this.session.bootstrap();
  }
}
