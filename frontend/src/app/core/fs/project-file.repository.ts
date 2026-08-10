import { Injectable } from '@angular/core';
import type { TwProject } from '../project/project.types';
import {
  TW_JSON_PICKER_TYPES,
  getFileSystemWindow,
  isAbortError,
} from './file-system-access.types';

export class FileSystemUnsupportedError extends Error {
  override readonly name = 'FileSystemUnsupportedError';
  constructor() {
    super(
      'This browser does not support local project files. Use Chrome or Edge for Task Warden.',
    );
  }
}

export class UserCancelledFilePickerError extends Error {
  override readonly name = 'UserCancelledFilePickerError';
  constructor() {
    super('File picker cancelled.');
  }
}

export interface OpenedProjectFile {
  handle: FileSystemFileHandle;
  text: string;
  fileName: string;
}

/**
 * Infrastructure: File System Access API adapter for `.tw.json` files.
 * No domain validation here — application layer parses/validates.
 */
@Injectable({ providedIn: 'root' })
export class ProjectFileRepository {
  isSupported(): boolean {
    const w = getFileSystemWindow();
    return typeof w.showOpenFilePicker === 'function' && typeof w.showSaveFilePicker === 'function';
  }

  async pickAndRead(): Promise<OpenedProjectFile> {
    this.assertSupported();
    const w = getFileSystemWindow();
    try {
      const [handle] = await w.showOpenFilePicker!({
        multiple: false,
        excludeAcceptAllOption: false,
        types: TW_JSON_PICKER_TYPES,
      });
      const file = await handle.getFile();
      const text = await file.text();
      return { handle, text, fileName: file.name || handle.name };
    } catch (error) {
      if (isAbortError(error)) {
        throw new UserCancelledFilePickerError();
      }
      throw error;
    }
  }

  /**
   * Prompt for a new file location, write the full project JSON, return the handle.
   */
  async pickLocationAndWrite(project: TwProject, suggestedName = 'untitled.tw.json'): Promise<{
    handle: FileSystemFileHandle;
    fileName: string;
  }> {
    this.assertSupported();
    const w = getFileSystemWindow();
    try {
      const handle = await w.showSaveFilePicker!({
        suggestedName,
        excludeAcceptAllOption: false,
        types: TW_JSON_PICKER_TYPES,
      });
      await this.write(handle, project);
      return { handle, fileName: handle.name };
    } catch (error) {
      if (isAbortError(error)) {
        throw new UserCancelledFilePickerError();
      }
      throw error;
    }
  }

  /** Write the entire project object to an existing file handle. */
  async write(handle: FileSystemFileHandle, project: TwProject): Promise<void> {
    const writable = await handle.createWritable();
    try {
      const payload = `${JSON.stringify(project, null, 2)}\n`;
      await writable.write(payload);
      await writable.close();
    } catch (error) {
      try {
        await writable.abort();
      } catch {
        /* ignore abort errors */
      }
      throw error;
    }
  }

  private assertSupported(): void {
    if (!this.isSupported()) {
      throw new FileSystemUnsupportedError();
    }
  }
}
