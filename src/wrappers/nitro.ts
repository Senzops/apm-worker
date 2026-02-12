import { client } from '../core/client';
import { getRoute } from '../core/normalizer';
import { storage } from '../core/context';

// Type definitions for NitroApp to avoid heavy dependencies
export interface NitroApp {
  h3App: {
    handler: (event: any) => Promise<any>;
    stack: any[];
  };
  hooks: any;
  [key: string]: any;
}

/**
 * A Nitro Plugin to automatically instrument the entire application.
 * Usage: Create 'server/plugins/senzor.ts' and export default senzorPlugin;
 */
export const senzorPlugin = (nitroApp: NitroApp) => {
  // Capture the original handler
  if (!nitroApp.h3App || !nitroApp.h3App.handler) {
    if (client.options?.debug) console.warn('[Senzor] NitroApp.h3App.handler not found. Skipping instrumentation.');
    return;
  }

  const originalHandler = nitroApp.h3App.handler;

  // Replace the main H3 app handler with a wrapped version
  nitroApp.h3App.handler = async (event: any) => {
    const req = event.node?.req || event.req;
    // Fallback for H3 event structure
    const path = req?.originalUrl || req?.url || (event.path as string) || '/';
    const method = req?.method || (event.method as string) || 'GET';

    // 1. Start Trace
    const session = client.createTrace({
      method: method,
      path: path,
      ip: req?.headers?.['x-forwarded-for'] || req?.socket?.remoteAddress || event.context?.cf?.connectingIp,
      userAgent: req?.headers?.['user-agent'],
    });

    // 2. Run execution inside AsyncLocalStorage context
    return storage.run(session.controller, async () => {
      let response;
      let status = 200;

      try {
        response = await originalHandler(event);

        // Try to determine status from response or event
        if (event.node?.res?.statusCode) status = event.node.res.statusCode;
        if (response?.status) status = response.status;

        return response;
      } catch (err: any) {
        status = err.statusCode || err.status || 500;
        session.controller.captureException(err);
        throw err;
      } finally {
        // 3. End Trace
        session.end(status, getRoute(event, path));

        // 4. Flush (Non-blocking)
        // Check for Cloudflare context in various locations
        const cfCtx = event.context?.cloudflare?.context || event.context?.cf || event.context;
        const waitUntil = cfCtx?.waitUntil || event.waitUntil;

        if (waitUntil && typeof waitUntil === 'function') {
          waitUntil(session.flush());
        } else {
          session.flush().catch(() => {
            if (client.options?.debug) console.warn('[Senzor] Flush failed or context missing');
          });
        }
      }
    });
  };
};