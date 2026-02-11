import { storage } from '../core/context';

let isInstrumented = false;

export const enableFetchInstrumentation = () => {
  if (isInstrumented) return;
  isInstrumented = true;

  const originalFetch = globalThis.fetch;

  // Monkey-patch global fetch
  // Use a regular function to preserve 'this' context if needed, though usually not strictly required for fetch
  globalThis.fetch = async function (input: RequestInfo | URL, init?: RequestInit) {
    // 1. Check for active trace context
    const controller = storage.getStore();

    // If no trace is active, bypass instrumentation completely for performance
    if (!controller) {
      return originalFetch.apply(globalThis, [input, init]);
    }

    // 2. Resolve URL and Method for Span Name
    let url = 'unknown';
    let method = 'GET';

    try {
      if (typeof input === 'string') {
        url = input;
      } else if (input instanceof URL) {
        url = input.toString();
      } else if (input && typeof input === 'object' && 'url' in input) {
        // Handle Request object (duck typing for safety across realms)
        url = (input as Request).url;
        method = (input as Request).method;
      }

      if (init && init.method) {
        method = init.method;
      }
    } catch (e) {
      // Fallback if accessing properties fails
    }

    // 3. Start Span
    const spanName = `HTTP ${method.toUpperCase()}`;
    const span = controller.startSpan(spanName, 'http');

    // 4. Inject Trace Headers (W3C Trace Context)
    // We must be very careful not to break the request (e.g. consuming body)
    let finalInput = input;
    let finalInit = init;

    try {
      const spanId = crypto.randomUUID().replace(/-/g, '').substring(0, 16);
      const traceParent = `00-${controller.traceId}-${spanId}-01`;

      if (input instanceof Request) {
        // If it's a Request object, we attempt to clone it to add headers.
        // If the body is used, this throws. We check first.
        if (input.bodyUsed) {
          // If body is used, we cannot clone safely to add headers without potentially breaking the stream.
          // We proceed without tracing headers, but still capture the span.
        } else {
          const newHeaders = new Headers(input.headers);
          newHeaders.set('traceparent', traceParent);

          if (init && init.headers) {
            new Headers(init.headers).forEach((v, k) => newHeaders.set(k, v));
          }

          // Create new Request with the same body stream/blob
          finalInput = new Request(input, {
            ...init,
            headers: newHeaders
          });
          finalInit = undefined; // init merged
        }
      } else {
        // Simple string/URL input - safe to modify init
        const newHeaders = new Headers(init?.headers);
        newHeaders.set('traceparent', traceParent);

        finalInit = {
          ...init,
          headers: newHeaders
        };
      }
    } catch (e) {
      // If injection fails, proceed with original input to ensure app functionality
    }

    try {
      // 5. Execute Fetch
      const response = await originalFetch.apply(globalThis, [finalInput, finalInit]);

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
};