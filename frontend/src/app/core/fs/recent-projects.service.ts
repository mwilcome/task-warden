import { Injectable, signal } from '@angular/core';
import type { TwProject } from '../project/project.types';
import { openIndexedDb, withIdbTimeout } from './idb-timeout';

const DB_NAME = 'task-warden';
/** Recents: disk handles and browser-saved projects. */
const DB_VERSION = 4;
const STORE = 'recents';
const MAX_RECENTS = 8;

export type RecentProjectSource = 'file' | 'browser';

export interface RecentProjectMeta {
  id: string;
  name: string;
  /** Disk file name when source is file; otherwise null. */
  fileName: string | null;
  source: RecentProjectSource;
  openedAt: string;
}

interface RecentProjectRecord extends RecentProjectMeta {
  handle?: FileSystemFileHandle;
}

/**
 * Recents: disk paths (File System Access handles) and browser-saved projects.
 */
@Injectable({ providedIn: 'root' })
export class RecentProjectsService {
  private readonly listSignal = signal<RecentProjectMeta[]>([]);
  private dbPromise: Promise<IDBDatabase> | null = null;

  readonly list = this.listSignal.asReadonly();

  constructor() {
    void this.refresh();
  }

  async refresh(): Promise<void> {
    try {
      const db = await this.openDb();
      const rows = await withIdbTimeout(this.getAll(db));
      rows.sort((a, b) => b.openedAt.localeCompare(a.openedAt));
      this.listSignal.set(rows.slice(0, MAX_RECENTS).map((row) => this.toMeta(row)));
    } catch {
      this.listSignal.set([]);
    }
  }

  async recordFile(
    handle: FileSystemFileHandle,
    project: TwProject,
    fileName: string,
  ): Promise<void> {
    try {
      const db = await this.openDb();
      const record: RecentProjectRecord = {
        id: project.id,
        name: project.name,
        fileName: fileName || handle.name,
        source: 'file',
        openedAt: new Date().toISOString(),
        handle,
      };
      await withIdbTimeout(this.put(db, record));
      await this.trim(db);
      await this.refresh();
    } catch {
      /* IndexedDB or handle clone may fail */
    }
  }

  async recordBrowser(project: TwProject): Promise<void> {
    try {
      const db = await this.openDb();
      const existing = await withIdbTimeout(this.get(db, project.id));
      const record: RecentProjectRecord = {
        id: project.id,
        name: project.name,
        fileName: null,
        source: 'browser',
        openedAt: new Date().toISOString(),
        handle: existing?.handle,
      };
      await withIdbTimeout(this.put(db, record));
      await this.trim(db);
      await this.refresh();
    } catch {
      /* ignore */
    }
  }

  async getHandle(projectId: string): Promise<FileSystemFileHandle | null> {
    try {
      const db = await this.openDb();
      const row = await withIdbTimeout(this.get(db, projectId));
      return row?.handle ?? null;
    } catch {
      return null;
    }
  }

  async getMeta(projectId: string): Promise<RecentProjectMeta | null> {
    try {
      const db = await this.openDb();
      const row = await withIdbTimeout(this.get(db, projectId));
      return row ? this.toMeta(row) : null;
    } catch {
      return null;
    }
  }

  async remove(projectId: string): Promise<void> {
    try {
      const db = await this.openDb();
      await withIdbTimeout(
        new Promise<void>((resolve, reject) => {
          const tx = db.transaction(STORE, 'readwrite');
          tx.objectStore(STORE).delete(projectId);
          tx.oncomplete = () => resolve();
          tx.onabort = () => reject(tx.error ?? new Error('IndexedDB abort'));
          tx.onerror = () => reject(tx.error);
        }),
      );
      await this.refresh();
    } catch {
      await this.refresh();
    }
  }

  private toMeta(row: RecentProjectRecord): RecentProjectMeta {
    const source: RecentProjectSource =
      row.source === 'browser' || row.source === 'file'
        ? row.source
        : row.handle
          ? 'file'
          : 'browser';
    return {
      id: row.id,
      name: row.name,
      fileName: row.fileName ?? (source === 'file' ? '' : null),
      source,
      openedAt: row.openedAt,
    };
  }

  private openDb(): Promise<IDBDatabase> {
    if (this.dbPromise) {
      return this.dbPromise;
    }
    this.dbPromise = openIndexedDb(DB_NAME, DB_VERSION, (db) => {
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'id' });
      }
    }).catch((error: unknown) => {
      this.dbPromise = null;
      throw error;
    });
    return this.dbPromise;
  }

  private getAll(db: IDBDatabase): Promise<RecentProjectRecord[]> {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).getAll();
      req.onsuccess = () => resolve((req.result as RecentProjectRecord[]) ?? []);
      req.onerror = () => reject(req.error);
      tx.onabort = () => reject(tx.error ?? new Error('IndexedDB abort'));
    });
  }

  private get(db: IDBDatabase, id: string): Promise<RecentProjectRecord | undefined> {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).get(id);
      req.onsuccess = () => resolve(req.result as RecentProjectRecord | undefined);
      req.onerror = () => reject(req.error);
      tx.onabort = () => reject(tx.error ?? new Error('IndexedDB abort'));
    });
  }

  private put(db: IDBDatabase, record: RecentProjectRecord): Promise<void> {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(record);
      tx.oncomplete = () => resolve();
      tx.onabort = () => reject(tx.error ?? new Error('IndexedDB abort'));
      tx.onerror = () => reject(tx.error);
    });
  }

  private async trim(db: IDBDatabase): Promise<void> {
    const rows = await withIdbTimeout(this.getAll(db));
    if (rows.length <= MAX_RECENTS) {
      return;
    }
    rows.sort((a, b) => b.openedAt.localeCompare(a.openedAt));
    const drop = rows.slice(MAX_RECENTS);
    await withIdbTimeout(
      new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE, 'readwrite');
        const store = tx.objectStore(STORE);
        for (const row of drop) {
          store.delete(row.id);
        }
        tx.oncomplete = () => resolve();
        tx.onabort = () => reject(tx.error ?? new Error('IndexedDB abort'));
        tx.onerror = () => reject(tx.error);
      }),
    );
  }
}
