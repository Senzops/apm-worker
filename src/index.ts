import { client } from './core/client';
import { wrapWorker } from './wrappers/worker';
import { wrapH3 } from './wrappers/h3';
import { senzorPlugin, NitroApp } from './wrappers/nitro';
import { SenzorOptions } from './core/types';

const Senzor = {
  /**
   * Initialize the SDK.
   * Call this in the global scope of your Worker or Plugin.
   */
  init: (options: SenzorOptions) => client.init(options),

  /**
   * Wrap your Cloudflare Worker 'fetch' handler.
   */
  worker: wrapWorker,

  /**
   * Wrap a generic H3 event handler.
   */
  wrapH3: wrapH3,

  /**
   * Nitro/Nuxt Plugin for global instrumentation.
   * Usage: export default Senzor.nitroPlugin; in server/plugins/senzor.ts
   */
  nitroPlugin: senzorPlugin
};

export default Senzor;
export { Senzor };
export type { TraceController } from './core/types';
// Re-export types that are used in public API signatures
export type { NitroApp } from './wrappers/nitro';
