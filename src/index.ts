import { client } from './core/client';
import { wrapWorker } from './wrappers/worker';
import { SenzorOptions } from './core/types';

const Senzor = {
  /**
   * Initialize the SDK.
   * Call this in the global scope of your Worker.
   */
  init: (options: SenzorOptions) => client.init(options),

  /**
   * Wrap your Cloudflare Worker 'fetch' handler.
   * Inject trace controller as the 4th argument.
   */
  worker: wrapWorker
};

export default Senzor;
export { Senzor };
export type { TraceController } from './core/types';
