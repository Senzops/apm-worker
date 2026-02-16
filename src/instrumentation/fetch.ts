import { getActiveController } from '../core/context';

export const enableFetchInstrumentation = (ingestUrl: string, debug = false) => {
  if (!globalThis.fetch) return;

  // Prevent infinite loops by identifying our own ingest host
  let ingestHost = '';
  try { ingestHost = new URL(ingestUrl).hostname; } catch (e) { }

  const originalFetch = globalThis.fetch;

  // @ts-ignore
  globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    // 1. Extract URL
    let urlStr = '';
    if (typeof input === 'string') urlStr = input;
    else if (input instanceof URL) urlStr = input.toString();
    else if (input && typeof input === 'object') {
      // Duck typing for Request object
      if ('url' in input) urlStr = (input as Request).url;
    }

    // 2. Infinite Loop Guard
    if (ingestHost && urlStr.includes(ingestHost)) {
      return originalFetch.apply(globalThis, [input, init]);
    }

    // 3. Context Check
    const controller = getActiveController();
    if (!controller) {
      return originalFetch.apply(globalThis, [input, init]);
    }

    // 4. Start Span
    let method = 'GET';
    if (init?.method) method = init.method;
    else if (input instanceof Request) method = input.method;
    method = method.toUpperCase();
    const spanId = crypto.randomUUID();

    let hostname = 'unknown';
    try { hostname = new URL(urlStr).hostname; } catch (e) { }

    const spanName = `${method} ${hostname}`;
    if (debug) console.log(`[Senzor] Tracking Fetch: ${spanName}`);

    const span = controller.startSpan(spanName, 'http');

    const newInit = { ...init };
    if (!newInit.headers) {
      newInit.headers = {};
    }

    // Handle different Header formats (Headers object vs plain object)
    if (newInit.headers instanceof Headers) {
      newInit.headers.set('x-senzor-trace-id', controller.traceId);
      newInit.headers.set('x-senzor-parent-span-id', spanId);
    } else if (Array.isArray(newInit.headers)) {
      newInit.headers.push(['x-senzor-trace-id', controller.traceId]);
      newInit.headers.push(['x-senzor-parent-span-id', spanId]);
    } else {
      // Plain object
      (newInit.headers as any)['x-senzor-trace-id'] = controller.traceId;
      (newInit.headers as any)['x-senzor-parent-span-id'] = spanId;
    }

    try {
      // Use apply to preserve context, pass original args if injection wasn't trivial
      const response = await originalFetch.apply(globalThis, [input, newInit]);

      // 5. End Span
      span.end({
        url: urlStr,
        method,
        library: 'fetch',
        status: response.status
      }, response.status);

      return response;
    } catch (err: any) {
      span.end({
        url: urlStr,
        method,
        library: 'fetch',
        error: err.message
      }, 500);
      throw err;
    }
  };
};

// No-op for legacy imports
export const instrumentFetch = () => { };