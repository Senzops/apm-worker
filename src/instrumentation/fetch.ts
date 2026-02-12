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

    let hostname = 'unknown';
    try { hostname = new URL(urlStr).hostname; } catch (e) { }

    const spanName = `${method} ${hostname}`;
    if (debug) console.log(`[Senzor] Tracking Fetch: ${spanName}`);

    const span = controller.startSpan(spanName, 'http');

    // Attempt to inject trace headers IF safe to do so
    // In Cloudflare, modifying Request objects often requires cloning which can fail if body is used.
    // We prioritize keeping the application working over distributed tracing if complexity is high.
    let finalInput = input;
    let finalInit = init;

    try {
      const spanId = crypto.randomUUID().replace(/-/g, '').substring(0, 16);
      const traceParent = `00-${controller.traceId}-${spanId}-01`;

      if (typeof input === 'string' || input instanceof URL) {
        // Safe to modify init for strings
        finalInit = { ...init };
        if (!finalInit.headers) finalInit.headers = {};
        // Handle different header formats
        if (finalInit.headers instanceof Headers) {
          finalInit.headers.set('traceparent', traceParent);
        } else if (Array.isArray(finalInit.headers)) {
          finalInit.headers.push(['traceparent', traceParent]);
        } else {
          (finalInit.headers as Record<string, string>)['traceparent'] = traceParent;
        }
      }
      // NOTE: We intentionally SKIP Request object injection here to prevent the "Request body used" errors 
      // that often break Cloudflare Workers. If user provided a Request object, we assume they handle it.
    } catch (e) {
      // Ignore injection errors
    }

    try {
      // Use apply to preserve context, pass original args if injection wasn't trivial
      const response = await originalFetch.apply(globalThis, [finalInput, finalInit]);

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