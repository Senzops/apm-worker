import { storage } from '../core/context';

let isInstrumented = false;

export const enableFetchInstrumentation = () => {
  if (isInstrumented) return;

  const originalFetch = globalThis.fetch;

  // Monkey-patch global fetch
  globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    // 1. Check for active trace context
    const controller = storage.getStore();

    // If no trace is active, just pass through
    if (!controller) {
      return originalFetch(input, init);
    }

    // 2. Resolve URL and Method
    let url = '';
    let method = 'GET';

    if (typeof input === 'string') {
      url = input;
    } else if (input instanceof URL) {
      url = input.toString();
    } else if (input instanceof Request) {
      url = input.url;
      method = input.method;
    }

    if (init && init.method) {
      method = init.method;
    }

    // 3. Start Span
    const spanName = `HTTP ${method}`;
    const span = controller.startSpan(spanName, 'http');

    // 4. Inject Trace Headers (W3C Trace Context)
    // We clone headers to avoid side effects on the input object
    const headers = new Headers(init?.headers || (input instanceof Request ? input.headers : {}));

    // Generate a span ID for the outgoing request
    const spanId = crypto.randomUUID().replace(/-/g, '').substring(0, 16);
    const traceParent = `00-${controller.traceId}-${spanId}-01`;
    headers.set('traceparent', traceParent);

    const newInit: RequestInit = {
      ...init,
      headers
    };

    try {
      const response = await originalFetch(input, newInit);
      span.end({
        url,
        method,
        status: response.status
      }, response.status);
      return response;
    } catch (err: any) {
      span.end({
        url,
        method,
        error: err.message
      }, 500);
      throw err;
    }
  };

  isInstrumented = true;
};
