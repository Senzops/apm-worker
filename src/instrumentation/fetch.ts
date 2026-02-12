import { storage } from '../core/context';

const SZ_INSTRUMENTED = Symbol('sz_instrumented');

export const enableFetchInstrumentation = () => {
  // 1. Prevent Double Instrumentation
  if ((globalThis as any).fetch && (globalThis as any).fetch[SZ_INSTRUMENTED]) {
    return;
  }

  const originalFetch = globalThis.fetch;

  // 2. Create Patched Fetch
  const patchedFetch = async function (this: any, input: RequestInfo | URL, init?: RequestInit) {
    // 3. Check Context
    const controller = storage.getStore();

    // If no active trace, bypass instrumentation completely for performance
    if (!controller) {
      return originalFetch.apply(this, [input, init]);
    }

    // 4. Resolve Metadata
    let url = 'unknown';
    let method = 'GET';

    try {
      if (typeof input === 'string') {
        url = input;
      } else if (input instanceof URL) {
        url = input.toString();
      } else if (input && typeof input === 'object') {
        // Duck typing for Request object
        if ('url' in input) url = (input as Request).url;
        if ('method' in input) method = (input as Request).method;
      }

      if (init && init.method) {
        method = init.method;
      }
    } catch (e) {
      // Ignore meta extraction failures
    }

    // 5. Start Span
    const span = controller.startSpan(`HTTP ${method.toUpperCase()}`, 'http');

    // 6. Prepare Arguments (Header Injection)
    let args: [RequestInfo | URL, RequestInit | undefined] = [input, init];

    try {
      const spanId = crypto.randomUUID().replace(/-/g, '').substring(0, 16);
      const traceParent = `00-${controller.traceId}-${spanId}-01`;

      if (input instanceof Request) {
        // Handle Request Object
        if (!input.bodyUsed) {
          // Creating a new Request is the only way to modify headers safely
          // We must be careful to preserve Cloudflare specific properties like 'cf' if they exist on the input
          const reqHeaders = new Headers(input.headers);
          reqHeaders.set('traceparent', traceParent);

          // Clone init options from input if needed, but new Request(input) handles most
          // We specifically merge the new headers
          const newRequestInit: RequestInit = {
            ...init,
            headers: reqHeaders,
          };

          // Try to preserve 'cf' context if it exists on the original request
          const originalCf = (input as any).cf;
          if (originalCf) {
            (newRequestInit as any).cf = originalCf;
          }

          args[0] = new Request(input, newRequestInit);
          args[1] = undefined; // Init merged into Request
        }
      } else {
        // Handle String/URL
        const headers = new Headers(init?.headers);
        headers.set('traceparent', traceParent);

        args[1] = {
          ...init,
          headers
        };
      }
    } catch (e) {
      // If injection fails (e.g. immutable headers), proceed with original args
    }

    // 7. Execute Fetch
    try {
      const response = await originalFetch.apply(this, args);

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

  // Mark as instrumented
  (patchedFetch as any)[SZ_INSTRUMENTED] = true;
  globalThis.fetch = patchedFetch;
};

// No-op for legacy imports
export const instrumentFetch = () => { };