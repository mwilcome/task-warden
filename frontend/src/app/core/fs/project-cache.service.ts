import { Injectable } from '@angular/core';
import type { TwProject } from '../project/project.types';

const DB_NAME = 'task-warden-cache';
const DB_VERSION = 1;
const STORE = 'projects';

export interface CachedProjectRecord {
  id: string;
  project: TwProject;
  fileName: string | null;
  cachedAt: string;
}

/**
 * In-browser store for New browser project. IndexedDB holds the same TwProject
 * blob as a `.tw.json` file. Recents are metadata only.
 */
@Injectable({ providedIn: 'root' })
export class ProjectCacheService {
  private dbPromise: Promise<IDBDatabase> | null = null;

  async put(project: TwProject, fileName: string | null): Promise<void> {
    try {
      const db = await this.openDb();
      const record: CachedProjectRecord = {
        id: project.id,
        project,
        fileName,
        cachedAt: new Date().toISOString(),
      };
      await this.idbPut(db, record);
    } catch {
      /* store is best-effort */
    }
  }

  async get(projectId: string): Promise<CachedProjectRecord | null> {
    try {
      const db = await this.openDb();
      return (await this.idbGet(db, projectId)) ?? null;
    } catch {
      return null;
    }
  }

  async remove(projectId: string): Promise<void> {
    try {
      const db = await this.openDb();
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE, 'readwrite');
        tx.objectStore(STORE).delete(projectId);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    } catch {
      /* ignore */
    }
  }

  private openDb(): Promise<IDBDatabase> {
    if (this.dbPromise) {
      return this.dbPromise;
    }
    this.dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onerror = () => reject(req.error ?? new Error('IndexedDB open failed'));
      req.onsuccess = () => resolve(req.result);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) {
          db.createObjectStore(STORE, { keyPath: 'id' });
        }
      };
    });
    return this.dbPromise;
  }

  private idbGet(db: IDBDatabase, id: string): Promise<CachedProjectRecord | undefined> {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).get(id);
      req.onsuccess = () => resolve(req.result as CachedProjectRecord | undefined);
      req.onerror = () => reject(req.error);
    });
  }

  private idbPut(db: IDBDatabase, record: CachedProjectRecord): Promise<void> {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(record);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }
}
