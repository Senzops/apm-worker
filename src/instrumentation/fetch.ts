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
    const spanId = crypto.randomUUID().replace(/-/g, '').substring(0, 16);
    const traceParent = `00-${controller.traceId}-${spanId}-01`;

    let finalInput = input;
    let finalInit = init;

    try {
      // Robust header injection
      if (input instanceof Request) {
        // If input is a Request, we construct a new Request to merge/override headers
        // We use the original 'input' as the base to preserve body streams/signals
        const newHeaders = new Headers(input.headers);
        newHeaders.set('traceparent', traceParent);

        // If init also provides headers, they typically override request headers in fetch logic
        if (init && init.headers) {
          new Headers(init.headers).forEach((v, k) => newHeaders.set(k, v));
        }

        finalInput = new Request(input, {
          ...init,
          headers: newHeaders
        });

        // Since we merged init into finalInput, we can pass undefined or null for init, 
        // BUT originalFetch(req) is safer than originalFetch(req, undefined) in some polyfills.
        // However, standard fetch accepts init. We effectively merged it.
        finalInit = undefined;
      } else {
        // Input is string/URL
        const newHeaders = new Headers(init?.headers);
        newHeaders.set('traceparent', traceParent);

        finalInit = {
          ...init,
          headers: newHeaders
        };
      }
    } catch (e) {
      // If Request construction fails (e.g. body already used), fallback to original without trace headers
      // capturing the error in the span would be misleading if the fetch itself succeeds.
    }

    try {
      const response = await originalFetch(finalInput, finalInit);
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
