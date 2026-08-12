import { Component, input } from '@angular/core';

@Component({
  selector: 'app-brand-mark',
  host: {
    'aria-hidden': 'true',
  },
  template: `
    <span
      class="brand-mark"
      [class.brand-mark--sm]="size() === 'sm'"
      [class.brand-mark--header]="size() === 'header'"
    >
      <span class="brand-mark__glyph">TW</span>
    </span>
  `,
})
export class BrandMarkComponent {
  readonly size = input<'sm' | 'header' | 'md'>('md');
}
