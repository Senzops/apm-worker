import { client } from './core/client';
import { wrapWorker } from './wrappers/worker';
import { wrapH3 } from './wrappers/h3';
import { SenzorOptions } from './core/types';

const Senzor = {
  /**
   * Initialize the SDK.
   * Call this in the global scope of your Worker or Plugin.
   */
  init: (options: SenzorOptions) => client.init(options),

  /**
   * Wrap your Cloudflare Worker 'fetch' handler.
   * Inject trace controller as the 4th argument.
   */
  worker: wrapWorker,

  /**
   * Wrap a Nitro/H3 event handler.
   * Use this for Nuxt or pure Nitro server routes.
   */
  nitro: wrapH3
};

export default Senzor;
export { Senzor };
export type { TraceController } from './core/types';
