import { IDB_TIMEOUT_MS, openIndexedDb, withIdbTimeout } from './idb-timeout';

describe('withIdbTimeout', () => {
  it('resolves when work finishes in time', async () => {
    await expect(withIdbTimeout(Promise.resolve('ok'), 50)).resolves.toBe('ok');
  });

  it('rejects when work never settles', async () => {
    vi.useFakeTimers();
    try {
      const hung = new Promise<void>(() => {
        /* never settles */
      });
      const pending = withIdbTimeout(hung, IDB_TIMEOUT_MS);
      const expectation = expect(pending).rejects.toThrow(/timed out/i);
      await vi.advanceTimersByTimeAsync(IDB_TIMEOUT_MS);
      await expectation;
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('openIndexedDb', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  function stubOpen(handlers: {
    onerror?: (req: { onerror: (() => void) | null; onblocked: (() => void) | null; onsuccess: (() => void) | null; onupgradeneeded: (() => void) | null; error: DOMException | null; result: IDBDatabase }) => void;
    onblocked?: (req: { onerror: (() => void) | null; onblocked: (() => void) | null; onsuccess: (() => void) | null; onupgradeneeded: (() => void) | null; error: DOMException | null; result: IDBDatabase }) => void;
    hang?: boolean;
  }): void {
    vi.stubGlobal('indexedDB', {
      open: () => {
        const req = {
          onerror: null as (() => void) | null,
          onblocked: null as (() => void) | null,
          onsuccess: null as (() => void) | null,
          onupgradeneeded: null as (() => void) | null,
          error: null as DOMException | null,
          result: {} as IDBDatabase,
        };
        queueMicrotask(() => {
          if (handlers.hang) {
            return;
          }
          handlers.onblocked?.(req);
          handlers.onerror?.(req);
        });
        return req;
      },
    });
  }

  it('rejects when indexedDB.open never settles', async () => {
    vi.useFakeTimers();
    stubOpen({ hang: true });
    const pending = openIndexedDb('hang', 1, () => undefined);
    const expectation = expect(pending).rejects.toThrow(/timed out/i);
    await vi.advanceTimersByTimeAsync(IDB_TIMEOUT_MS);
    await expectation;
  });

  it('rejects when open is blocked', async () => {
    stubOpen({
      onblocked: (req) => {
        req.onblocked?.();
      },
    });
    await expect(openIndexedDb('blocked', 1, () => undefined)).rejects.toThrow(/blocked/i);
  });
});
