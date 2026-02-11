import { Transport } from './transport';
import { SenzorOptions, TraceData, Span, TraceController } from './types';
import { enableFetchInstrumentation } from '../instrumentation/fetch';

export class SenzorClient {
  private transport: Transport | null = null;
  private options: SenzorOptions | null = null;

  public init(options: SenzorOptions) {
    if (!options.apiKey) {
      console.warn('[Senzor] API Key missing. SDK disabled.');
      return;
    }
    this.options = options;
    this.transport = new Transport(options);

    // Auto-instrument global fetch
    try {
      enableFetchInstrumentation();
    } catch (e) {
      if (options.debug) console.warn('[Senzor] Failed to instrument fetch:', e);
    }

    if (options.debug) console.log('[Senzor] Initialized for Serverless');
  }

  /**
   * Creates a detached trace session.
   */
  public createTrace(data: Partial<TraceData>): { controller: TraceController, end: (status: number, route?: string) => void, flush: () => Promise<void> } {
    if (!this.transport) {
      // Return dummy if not initialized
      return {
        controller: {
          startSpan: () => ({ end: () => { } }),
          captureException: () => { },
          traceId: '00000000000000000000000000000000'
        },
        end: () => { },
        flush: async () => { }
      };
    }

    const traceId = crypto.randomUUID().replace(/-/g, ''); // 32 hex chars usually
    const startTime = performance.now();
    const spans: Span[] = [];

    const startSpan = (name: string, type: 'db' | 'http' | 'function' | 'custom' = 'custom') => {
      const spanStartAbs = performance.now();
      const startRel = spanStartAbs - startTime;
      return {
        end: (meta?: any, status?: number) => {
          spans.push({
            name,
            type,
            startTime: startRel, // Relative to trace start
            duration: performance.now() - spanStartAbs,
            status,
            meta
          });
        }
      };
    };

    const controller: TraceController = {
      traceId,
      startSpan,
      captureException: (err: any) => {
        spans.push({
          name: 'exception',
          type: 'custom',
          startTime: performance.now() - startTime,
          duration: 0,
          status: 500,
          meta: { error: err.message || String(err), stack: err.stack }
        });
      }
    };

    const end = (status: number, route: string = 'UNKNOWN') => {
      const duration = performance.now() - startTime;
      const payload: TraceData = {
        traceId,
        method: data.method || 'GET',
        route,
        path: data.path || '/',
        status,
        duration,
        ip: data.ip,
        userAgent: data.userAgent,
        timestamp: new Date().toISOString(),
        spans
      };
      this.transport?.add(payload);
    };

    const flush = async () => {
      await this.transport?.flush();
    };

    return { controller, end, flush };
  }

  /**
   * Track a single request trace immediately.
   */
  public track(data: Partial<TraceData> & { status: number, duration: number, route: string }) {
    if (!this.transport) return;

    const payload: TraceData = {
      traceId: crypto.randomUUID(),
      method: data.method || 'GET',
      route: data.route,
      path: data.path || '/',
      status: data.status,
      duration: data.duration,
      ip: data.ip,
      userAgent: data.userAgent,
      timestamp: new Date().toISOString(),
      spans: data.spans || []
    };

    this.transport.add(payload);
    this.transport.flush().catch(() => { });
  }

  // Stubs for legacy Node support
  public startTrace<T>(data: Partial<TraceData>, callback: () => T): T { return callback(); }
  public endTrace(status: number, data?: { route?: string }) { }
}

export const client = new SenzorClient();
