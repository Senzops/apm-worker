import { client } from '../core/client';
import { normalizePath } from '../core/normalizer';
import { TraceController } from '../core/types';
import { clearActiveController, setActiveController, storage } from '../core/context';

type WorkerHandler = (request: Request, env: any, ctx: any, trace: TraceController) => Promise<Response>;

export const wrapWorker = (handler: WorkerHandler) => {
  return async (request: Request, env: any, ctx: any) => {
    // 2. Extract Request Info
    const url = new URL(request.url);
    const path = url.pathname;

    // 3. Start Trace
    const session = client.createTrace({
      method: request.method,
      path: path,
      userAgent: request.headers.get('user-agent') || undefined,
      ip: request.headers.get('cf-connecting-ip') || request.headers.get('x-forwarded-for') || undefined
    });

    // 4. Run Handler within Context (AsyncLocalStorage)
    // This enables the global fetch instrumentation to find the current trace controller
    setActiveController(session.controller);
    return storage.run(session.controller, async () => {
      let response: Response;
      let status = 500;

      try {
        // Inject trace controller as 4th arg for manual usage
        response = await handler(request, env, ctx, session.controller);
        status = response.status;
        return response;
      } catch (err: any) {
        session.controller.captureException(err);
        throw err;
      } finally {
        // 5. End Trace
        session.end(status, normalizePath(path));

        clearActiveController();

        // 6. Flush (Async WaitUntil)
        if (ctx && typeof ctx.waitUntil === 'function') {
          ctx.waitUntil(session.flush());
        } else {
          await session.flush();
        }
      }
    });
  };
};
