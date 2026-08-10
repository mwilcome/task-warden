import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';

/**
 * Root shell — routing only.
 * No component styles: all visuals live in src/styles.scss (see docs/architecture.md).
 */
@Component({
  selector: 'app-root',
  imports: [RouterOutlet],
  template: `<router-outlet />`,
})
export class App {}
