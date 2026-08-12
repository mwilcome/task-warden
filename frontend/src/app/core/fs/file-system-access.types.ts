export interface TwFilePickerAcceptType {
  description?: string;
  accept: Record<string, string[]>;
}

export interface TwOpenFilePickerOptions {
  multiple?: boolean;
  types?: TwFilePickerAcceptType[];
  excludeAcceptAllOption?: boolean;
}

export interface TwSaveFilePickerOptions {
  suggestedName?: string;
  types?: TwFilePickerAcceptType[];
  excludeAcceptAllOption?: boolean;
}

/** Not always on the TS lib Window type we compile against. */
export interface TwFileSystemWindow {
  showOpenFilePicker?: (
    options?: TwOpenFilePickerOptions,
  ) => Promise<FileSystemFileHandle[]>;
  showSaveFilePicker?: (
    options?: TwSaveFilePickerOptions,
  ) => Promise<FileSystemFileHandle>;
}

export const TW_JSON_PICKER_TYPES: TwFilePickerAcceptType[] = [
  {
    description: 'Task Warden project',
    accept: {
      'application/json': ['.tw.json', '.json'],
    },
  },
];

export function isAbortError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'name' in error &&
    (error as { name: string }).name === 'AbortError'
  );
}

export function getFileSystemWindow(): TwFileSystemWindow {
  return window as unknown as TwFileSystemWindow;
}
