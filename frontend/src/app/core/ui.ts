import type { ElementRef } from '@angular/core';

/** Enter confirms, Escape cancels. */
export function onEnterOrEscape(
  event: KeyboardEvent,
  onEnter: () => void,
  onEscape: () => void,
): void {
  if (event.key === 'Enter') {
    event.preventDefault();
    onEnter();
  } else if (event.key === 'Escape') {
    event.preventDefault();
    onEscape();
  }
}

export function focusInput(
  ref: ElementRef<HTMLInputElement> | undefined,
  select = true,
): void {
  const el = ref?.nativeElement;
  if (!el) {
    return;
  }
  el.focus();
  if (select) {
    el.select();
  }
}

/** Drops a second call while the first await is still open. */
export class OneAtATime {
  private busy = false;

  async run(work: () => Promise<void>): Promise<void> {
    if (this.busy) {
      return;
    }
    this.busy = true;
    try {
      await work();
    } finally {
      this.busy = false;
    }
  }
}
