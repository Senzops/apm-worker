import { TraceController } from './types';

interface IStore {
  run<R>(store: TraceController, callback: (...args: any[]) => R, ...args: any[]): R;
  getStore(): TraceController | undefined;
}

// 1. Naive implementation (Global Variable)
// This is used as a fallback when AsyncLocalStorage is unavailable.
// WARNING: This is not concurrency-safe in a single-isolate concurrent environment.
// It works for sequential request processing.
class NaiveStorage implements IStore {
  private store: TraceController | undefined;

  run<R>(store: TraceController, callback: (...args: any[]) => R, ...args: any[]): R {
    const prev = this.store;
    this.store = store;
    try {
      return callback(...args);
    } finally {
      this.store = prev;
    }
  }

  getStore() {
    return this.store;
  }
}

// 2. Factory to resolve best storage mechanism
const getStorage = (): IStore => {
  // Check global (Node 15+, Modern V8)
  if (typeof globalThis !== 'undefined' && (globalThis as any).AsyncLocalStorage) {
    return new (globalThis as any).AsyncLocalStorage();
  }

  // Check Node.js environment via dynamic require (bypass static analysis)
  try {
    // @ts-ignore
    if (typeof require !== 'undefined') {
      // @ts-ignore
      const { AsyncLocalStorage } = require('node:async_hooks');
      return new AsyncLocalStorage();
    }
  } catch (e) {
    // Ignore
  }

  // Fallback
  // console.warn('[Senzor] AsyncLocalStorage unavailable. Using naive fallback (concurrency issues may occur).');
  return new NaiveStorage();
};

export const storage = getStorage();