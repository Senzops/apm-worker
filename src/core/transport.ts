import { SenzorOptions, TraceData } from './types';

export class Transport {
  private queue: TraceData[] = [];

  constructor(private config: SenzorOptions) { }

  public add(trace: TraceData) {
    this.queue.push(trace);
  }

  /**
   * Flushes the queue to the API. 
   * Returns a promise that should be passed to ctx.waitUntil()
   */
  public async flush(): Promise<void> {
    if (this.queue.length === 0) return;

    const batch = [...this.queue];
    this.queue = []; // Clear immediately

    try {
      const endpoint = this.config.endpoint || 'https://api.senzor.dev/api/ingest/apm';

      await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-service-api-key': this.config.apiKey,
        },
        body: JSON.stringify(batch),
        // keepalive is not strictly necessary in workers if awaited/waitUntil'd, but good practice
        keepalive: true,
      });

      if (this.config.debug) console.log(`[Senzor] Flushed ${batch.length} traces`);
    } catch (err) {
      if (this.config.debug) console.error('[Senzor] Ingestion Error:', err);
    }
  }
}
