import { AsyncLocalStorage } from 'node:async_hooks';
import { TraceController } from './types';

// This relies on the 'nodejs_compat' compatibility flag in Cloudflare Workers.
export const storage = new AsyncLocalStorage<TraceController>();
