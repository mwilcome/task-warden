const PROJECT_ID_ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';
const PROJECT_ID_LENGTH = 8;
const TASK_ID_RE = /^t(\d+)$/;

/** New project id: 8 lowercase characters (e.g. k7xm2p9q). */
export function createProjectId(): string {
  const chars = new Array<string>(PROJECT_ID_LENGTH);
  const bytes = new Uint8Array(PROJECT_ID_LENGTH);
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i++) {
      bytes[i] = Math.floor(Math.random() * 256);
    }
  }
  for (let i = 0; i < PROJECT_ID_LENGTH; i++) {
    chars[i] = PROJECT_ID_ALPHABET[bytes[i]! % PROJECT_ID_ALPHABET.length]!;
  }
  return chars.join('');
}

/**
 * Next task id in a file: t1, t2, … after the highest existing tN.
 * Ids that are not tN (including legacy UUIDs) are ignored for sequencing.
 */
export function nextTaskId(tasks: readonly { id: string }[]): string {
  let max = 0;
  for (const task of tasks) {
    const match = TASK_ID_RE.exec(task.id);
    if (!match) {
      continue;
    }
    const n = Number.parseInt(match[1]!, 10);
    if (n > max) {
      max = n;
    }
  }
  return `t${max + 1}`;
}

/** True if value is a non-empty string id (legacy UUIDs and short ids both pass). */
export function isNonEmptyId(value: unknown): value is string {
  return typeof value === 'string' && value.trim() !== '';
}
