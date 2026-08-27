import { Injectable } from '@angular/core';
import type { TwProject } from '../project/project.types';

const DB_NAME = 'task-warden-cache';
const DB_VERSION = 1;
const STORE = 'projects';

/** IndexedDB row. `project` is the same TwProject blob as a `.tw.json` file. */
interface CacheRow {
  id: string;
  project: TwProject;
}

/**
 * In-browser store for New browser project. IndexedDB holds the same
 * TwProject blob as a `.tw.json` file. Recents are metadata only.
 */
@Injectable({ providedIn: 'root' })
export class ProjectCacheService {
  private dbPromise: Promise<IDBDatabase> | null = null;

  async put(project: TwProject): Promise<void> {
    try {
      const db = await this.openDb();
      await this.idbPut(db, { id: project.id, project });
    } catch {
      /* IndexedDB may be unavailable */
    }
  }

  async get(projectId: string): Promise<TwProject | null> {
    try {
      const db = await this.openDb();
      const row = await this.idbGet(db, projectId);
      return row?.project ?? null;
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

  private idbGet(db: IDBDatabase, id: string): Promise<CacheRow | undefined> {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).get(id);
      req.onsuccess = () => resolve(req.result as CacheRow | undefined);
      req.onerror = () => reject(req.error);
    });
  }

  private idbPut(db: IDBDatabase, record: CacheRow): Promise<void> {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(record);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }
}
