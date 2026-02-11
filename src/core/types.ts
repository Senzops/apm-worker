export interface SenzorOptions {
  apiKey: string;
  endpoint?: string;
  debug?: boolean;
}

export interface Span {
  name: string;
  type: 'db' | 'http' | 'function' | 'custom';
  startTime: number; // Relative to trace start
  duration: number;
  status?: number;
  meta?: Record<string, any>;
}

export interface TraceData {
  traceId: string;
  method: string;
  route: string; // Normalized
  path: string;  // Raw
  status: number;
  duration: number;
  ip?: string;
  userAgent?: string;
  timestamp: string;
  spans: Span[];
}

export interface TraceController {
  /**
   * Starts a new span.
   */
  startSpan(name: string, type?: 'db' | 'http' | 'function' | 'custom'): { end: (meta?: any, status?: number) => void };

  /**
   * Adds an error to the trace.
   */
  captureException(error: Error | any): void;

  /**
   * The trace ID for the current session
   */
  readonly traceId: string;
}
