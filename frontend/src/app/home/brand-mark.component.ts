import { Component, input } from '@angular/core';

/**
 * TW badge — restored to pre-dark geometry (clip-path shield + original sizes).
 * Paint uses current slate-blue tokens; shape matches main.
 */
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
  /** sm = dialog; header = app bar; default = md hero size */
  readonly size = input<'sm' | 'header' | 'md'>('md');
}
