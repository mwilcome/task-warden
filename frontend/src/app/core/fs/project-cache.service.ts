import { Injectable } from '@angular/core';
import type { TwProject } from '../project/project.types';
import { openIndexedDb, withIdbTimeout } from './idb-timeout';

const DB_NAME = 'task-warden-cache';
const DB_VERSION = 1;
const STORE = 'projects';
const LAST_ID_KEY = 'task-warden:last-project-id';

export interface CachedProjectRecord {
  id: string;
  project: TwProject;
  fileName: string | null;
  cachedAt: string;
}

/**
 * Local full-project JSON cache (IndexedDB) + last-project id (localStorage).
 * Used for New browser project / saved in this browser. Disk `.tw.json` is
 * the source of truth when a file handle is open. Last-id is not auto-restored.
 */
@Injectable({ providedIn: 'root' })
export class ProjectCacheService {
  private dbPromise: Promise<IDBDatabase> | null = null;

  getLastProjectId(): string | null {
    try {
      return localStorage.getItem(LAST_ID_KEY);
    } catch {
      return null;
    }
  }

  setLastProjectId(projectId: string | null): void {
    try {
      if (!projectId) {
        localStorage.removeItem(LAST_ID_KEY);
      } else {
        localStorage.setItem(LAST_ID_KEY, projectId);
      }
    } catch {
      /* private mode / quota */
    }
  }

  async put(project: TwProject, fileName: string | null): Promise<void> {
    try {
      const db = await this.openDb();
      const record: CachedProjectRecord = {
        id: project.id,
        project,
        fileName,
        cachedAt: new Date().toISOString(),
      };
      await withIdbTimeout(this.idbPut(db, record));
      this.setLastProjectId(project.id);
    } catch {
      /* cache is best-effort */
    }
  }

  async get(projectId: string): Promise<CachedProjectRecord | null> {
    try {
      const db = await this.openDb();
      return (await withIdbTimeout(this.idbGet(db, projectId))) ?? null;
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
      if (this.getLastProjectId() === projectId) {
        this.setLastProjectId(null);
      }
    } catch {
      /* ignore */
    }
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

  private idbGet(db: IDBDatabase, id: string): Promise<CachedProjectRecord | undefined> {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).get(id);
      req.onsuccess = () => resolve(req.result as CachedProjectRecord | undefined);
      req.onerror = () => reject(req.error);
      tx.onabort = () => reject(tx.error ?? new Error('IndexedDB abort'));
    });
  }

  private idbPut(db: IDBDatabase, record: CachedProjectRecord): Promise<void> {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(record);
      tx.oncomplete = () => resolve();
      tx.onabort = () => reject(tx.error ?? new Error('IndexedDB abort'));
      tx.onerror = () => reject(tx.error);
    });
  }
}
