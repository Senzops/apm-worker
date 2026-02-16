import { getActiveController } from '../core/context';

declare const require: any;

export const instrumentHttp = (ingestUrl: string, debug = false) => {
  let ingestHost = '';
  try {
    ingestHost = new URL(ingestUrl).hostname;
  } catch (e) { }

  try {
    // Check if require exists (it might not in pure ESM/Workers)
    if (typeof require === 'undefined') return;

    // Dynamic require to avoid build errors
    // @ts-ignore
    const http = require('http');
    // @ts-ignore
    const https = require('https');

    const requestWrapper = (original: Function) => {
      return function (this: any, ...args: any[]) {
        const controller = getActiveController();
        // If no context, skip instrumentation overhead
        if (!controller) {
          return original.apply(this, args);
        }

        let options: any = {};
        let urlStr = '';

        // Normalize arguments
        // request(url, options, cb) OR request(options, cb)
        if (typeof args[0] === 'string' || args[0] instanceof URL) {
          urlStr = args[0].toString();
          if (typeof args[1] === 'object' && args[1] !== null) options = args[1];
        } else {
          options = args[0] || {};
          const protocol = options.protocol || (options.port === 443 ? 'https:' : 'http:');
          const host = options.hostname || options.host || 'localhost';
          const path = options.path || '/';
          urlStr = `${protocol}//${host}${path}`;
        }

        // Loop Guard
        if (ingestHost && (urlStr.includes(ingestHost) || (options.hostname && options.hostname.includes(ingestHost)))) {
          return original.apply(this, args);
        }

        const method = (options.method || 'GET').toUpperCase();
        let hostname = 'unknown';
        try { hostname = new URL(urlStr).hostname; } catch (e) { hostname = options.hostname || 'unknown'; }

        const spanName = `${method} ${hostname}`;
        const span = controller.startSpan(spanName, 'http');

        // Inject Headers (Standard Node http/https options are mutable)
        const spanId = crypto.randomUUID().replace(/-/g, '').substring(0, 16);
        if (!options.headers) options.headers = {};
        options.headers['x-senzor-trace-id'] = controller.traceId;
        options.headers['x-senzor-parent-span-id'] = spanId;

        // Execute Request
        const req = original.apply(this, args);

        // Hook Events
        if (req && typeof req.on === 'function') {
          const endSpan = (status: number, errorMsg?: string) => {
            span.end({
              url: urlStr,
              method,
              status: status,
              library: 'http',
              error: errorMsg
            }, status);
          };

          req.on('response', (res: any) => {
            res.once('end', () => endSpan(res.statusCode));
            res.once('error', (err: any) => endSpan(500, err.message));
          });

          req.on('error', (err: any) => {
            endSpan(500, err.message);
          });
        }

        return req;
      };
    };

    const shimmer = (module: any, method: string, wrapper: any) => {
      if (module && module[method]) {
        module[method] = wrapper(module[method]);
      }
    }

    if (http) {
      shimmer(http, 'request', requestWrapper);
      shimmer(http, 'get', requestWrapper);
    }
    if (https) {
      shimmer(https, 'request', requestWrapper);
      shimmer(https, 'get', requestWrapper);
    }

  } catch (e) {
    if (debug) console.warn('[Senzor] instrumentation skipped (module not found or require failed)');
  }
};