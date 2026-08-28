/** Fail-fast budget for IndexedDB open/put so Safari cannot hold busy forever. */
export const IDB_TIMEOUT_MS = 2000;

export function withIdbTimeout<T>(work: Promise<T>, ms: number = IDB_TIMEOUT_MS): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error('IndexedDB timed out'));
    }, ms);
    work.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

export function openIndexedDb(
  name: string,
  version: number,
  upgrade: (db: IDBDatabase) => void,
  ms: number = IDB_TIMEOUT_MS,
): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (fn: () => void): void => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      fn();
    };
    const timer = setTimeout(() => {
      finish(() => reject(new Error('IndexedDB open timed out')));
    }, ms);

    let req: IDBOpenDBRequest;
    try {
      req = indexedDB.open(name, version);
    } catch (error) {
      finish(() => reject(error));
      return;
    }

    req.onerror = () => {
      finish(() => reject(req.error ?? new Error('IndexedDB open failed')));
    };
    req.onblocked = () => {
      finish(() => reject(new Error('IndexedDB open blocked')));
    };
    req.onsuccess = () => {
      finish(() => resolve(req.result));
    };
    req.onupgradeneeded = () => {
      try {
        upgrade(req.result);
      } catch (error) {
        finish(() => reject(error));
      }
    };
  });
}
