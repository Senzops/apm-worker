import { client } from '../core/client';
import { getRoute } from '../core/normalizer';
import { clearActiveController, setActiveController, storage } from '../core/context';

// Minimal types for H3 to avoid peer-deps
type EventHandler = (event: any) => any;

export const wrapH3 = (handler: EventHandler) => {
  return async (event: any) => {
    const req = event.node.req;
    const path = req.originalUrl || req.url || '/';

    // 1. Start Trace Session
    const session = client.createTrace({
      method: req.method || 'GET',
      path: path,
      ip: req.headers['x-forwarded-for'] || req.socket?.remoteAddress || event.context?.cf?.connectingIp,
      userAgent: req.headers['user-agent'],
      headers: req.headers 
    });

    // 2. Run Handler within AsyncLocalStorage Context
    // This ensures global fetch() auto-instrumentation works inside Nitro handlers
    setActiveController(session.controller);
    return storage.run(session.controller, async () => {
      let response: any;
      let status = 200;

      try {
        response = await handler(event);

        // H3/Nitro response status handling
        if (event.node.res.statusCode) status = event.node.res.statusCode;
        if (response && response.statusCode) status = response.statusCode;

        return response;
      } catch (err: any) {
        status = err.statusCode || err.status || 500;
        session.controller.captureException(err);
        throw err;
      } finally {
        // 3. End Trace
        session.end(status, getRoute(event, path));
        
        clearActiveController();

        // 4. Flush Data (Non-blocking for Cloudflare)
        // Nitro exposes Cloudflare context in event.context.cloudflare
        const cfCtx = event.context?.cloudflare?.context || event.context?.cf;
        // Or sometimes directly on event in newer H3 versions if adapter binds it
        const waitUntil = cfCtx?.waitUntil || event.waitUntil;

        if (waitUntil && typeof waitUntil === 'function') {
          waitUntil(session.flush());
        } else {
          // If not in a worker environment or waitUntil missing, flush async but don't block response significantly
          // (Note: without waitUntil, the runtime might kill the process before flush completes)
          session.flush().catch(() => { });
        }
      }
    });
  };
};
