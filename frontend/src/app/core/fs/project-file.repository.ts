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
      'This browser cannot keep a .tw.json file open on disk. Use New browser project (saved in this browser), or upload a file and download to save. Chrome or Edge can write the file on disk.',
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
  lastModified: number;
}

/**
 * Infrastructure: File System Access (Chrome/Edge) and upload/download (Safari).
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
      return this.readHandle(handle);
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
  async pickLocationAndWrite(
    project: TwProject,
    suggestedName = 'untitled.tw.json',
  ): Promise<{
    handle: FileSystemFileHandle;
    fileName: string;
    lastModified: number;
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
      const lastModified = await this.getLastModified(handle);
      return { handle, fileName: handle.name, lastModified };
    } catch (error) {
      if (isAbortError(error)) {
        throw new UserCancelledFilePickerError();
      }
      throw error;
    }
  }

  /** Re-read text from an existing file handle (fresh from disk). */
  async readHandle(handle: FileSystemFileHandle): Promise<OpenedProjectFile> {
    const file = await handle.getFile();
    const text = await file.text();
    return {
      handle,
      text,
      fileName: file.name || handle.name,
      lastModified: file.lastModified,
    };
  }

  async getLastModified(handle: FileSystemFileHandle): Promise<number> {
    const file = await handle.getFile();
    return file.lastModified;
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

  /** Download the open project as `.tw.json`. */
  download(project: TwProject, fileName: string): void {
    const payload = `${JSON.stringify(project, null, 2)}\n`;
    const blob = new Blob([payload], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = fileName;
    anchor.rel = 'noopener';
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  }

  private assertSupported(): void {
    if (!this.isSupported()) {
      throw new FileSystemUnsupportedError();
    }
  }
}
