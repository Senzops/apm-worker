import { storage } from '../core/context';

export const instrumentHttp = () => {
  try {
    // Use dynamic require to avoid build issues in pure ESM environments if not polyfilled.
    // In Cloudflare Workers with nodejs_compat, this works.
    const http = require('http');
    const https = require('https');

    const patch = (module: any, protocol: string) => {
      if (!module || !module.request) return;

      const originalRequest = module.request;

      // Override http.request / https.request
      module.request = function (...args: any[]) {
        const controller = storage.getStore();

        // If no active trace, skip instrumentation overhead
        if (!controller) {
          return originalRequest.apply(this, args);
        }

        let options: any = {};
        let urlStr = 'unknown';

        // Signature 1: request(url, options?, callback?)
        // Signature 2: request(options, callback?)
        if (typeof args[0] === 'string' || args[0] instanceof URL) {
          urlStr = args[0].toString();
          if (args[1] && typeof args[1] === 'object') {
            options = args[1];
          }
        } else {
          options = args[0] || {};
          const host = options.hostname || options.host || 'localhost';
          const path = options.path || '/';
          urlStr = `${options.protocol || protocol}//${host}${path}`;
        }

        const method = (options.method || 'GET').toUpperCase();

        // 1. Start Span
        const span = controller.startSpan(`HTTP ${method}`, 'http');

        // 2. Inject Trace Headers
        // Ensure options.headers exists
        if (!options.headers) {
          options.headers = {};
        }

        // Generate Trace Parent
        const spanId = crypto.randomUUID().replace(/-/g, '').substring(0, 16);
        const traceParent = `00-${controller.traceId}-${spanId}-01`;

        // options.headers might be a primitive or null prototype object, handle safely
        try {
          options.headers['traceparent'] = traceParent;
        } catch (e) {
          // If headers is immutable or special, try creating a copy if possible (hard in args array)
          // For now, assume mutable standard options object
        }

        // 3. Call Original
        const req = originalRequest.apply(this, args);

        // 4. Listen for Response
        if (req && typeof req.on === 'function') {
          req.on('response', (res: any) => {
            span.end({
              url: urlStr,
              method: method,
              status: res.statusCode
            }, res.statusCode);
          });

          req.on('error', (err: any) => {
            span.end({
              url: urlStr,
              method: method,
              error: err.message
            }, 500);
          });
        }

        return req;
      };
    };

    patch(http, 'http:');
    patch(https, 'https:');

  } catch (e) {
    // Ignore errors (e.g. 'http' module not found in pure edge runtime)
  }
};

// Also export a no-op for fetch since it's handled separately
export const instrumentFetch = () => { }; 
