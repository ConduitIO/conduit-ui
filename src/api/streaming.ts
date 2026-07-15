// Hand-written websocket wrapper for Conduit's Inspect streaming RPCs
// (/v1/connectors/{id}/inspect, /v1/processors/{id}/inspect-in|out). These are
// EXCLUDED from the generated typed client: grpc-gateway emits them in the
// OpenAPI schema as `{ result: <Record> }` with "(streaming responses)", which a
// codegen tool mis-models as a single object. The websocket proxy on the engine
// sends one JSON `{ "result": <Record> }` frame per record.
//
// UI-1 provides the boundary + types; the live-record-flow consumer is UI-4.

/** One frame from an Inspect websocket: the engine wraps each record in `result`. */
export interface InspectFrame<TRecord = unknown> {
  result: TRecord;
}

/**
 * grpc-gateway emits a trailing/interleaved `{ "error": {...} }` line when a
 * streaming RPC fails. We surface it rather than treating `.result` (undefined) as
 * a record.
 */
interface InspectErrorFrame {
  error: unknown;
}

/** Handlers for stream lifecycle beyond record delivery. All optional. */
export interface InspectStreamHandlers {
  /** A transport error, an in-band `{error}` frame, or a malformed line. */
  onError?: (err: Event) => void;
  /** The socket closed (server going-away, idle timeout, network). */
  onClose?: (ev: CloseEvent) => void;
}

function isErrorFrame(v: unknown): v is InspectErrorFrame {
  return typeof v === 'object' && v !== null && 'error' in v;
}

export type InspectKind = 'connector' | 'processor-in' | 'processor-out';

/** Builds the ws(s):// URL for an Inspect stream from an http(s) base. */
export function inspectURL(baseUrl: string, kind: InspectKind, id: string): string {
  const wsBase = baseUrl.replace(/\/$/, '').replace(/^http/, 'ws');
  const enc = encodeURIComponent(id);
  switch (kind) {
    case 'connector':
      return `${wsBase}/v1/connectors/${enc}/inspect`;
    case 'processor-in':
      return `${wsBase}/v1/processors/${enc}/inspect-in`;
    case 'processor-out':
      return `${wsBase}/v1/processors/${enc}/inspect-out`;
  }
}

/**
 * Opens an Inspect stream and invokes onRecord for each `{result}` record frame.
 * Returns a close function. This is a thin boundary; reconnect/backpressure/
 * sampling UX is UI-4's job (see the design doc's live-record-flow section).
 *
 * Robustness contract (relied on by UI-4's reconnect logic):
 *   - A malformed/partial line or a grpc-gateway `{error}` frame is routed to
 *     `onError` and never throws out of the message handler (a thrown parse would
 *     otherwise silently kill record delivery).
 *   - `onClose` fires on socket close so the consumer can reconnect.
 */
export function openInspectStream<TRecord = unknown>(
  url: string,
  onRecord: (record: TRecord) => void,
  handlers: InspectStreamHandlers = {}
): () => void {
  const ws = new WebSocket(url);
  ws.addEventListener('message', (ev: MessageEvent<string>) => {
    let frame: unknown;
    try {
      frame = JSON.parse(ev.data);
    } catch {
      // Malformed/partial line — surface as a stream error, don't throw.
      handlers.onError?.(new Event('inspect-parse-error'));
      return;
    }
    if (isErrorFrame(frame)) {
      handlers.onError?.(new Event('inspect-stream-error'));
      return;
    }
    onRecord((frame as InspectFrame<TRecord>).result);
  });
  if (handlers.onError) ws.addEventListener('error', handlers.onError);
  if (handlers.onClose) ws.addEventListener('close', handlers.onClose);
  return () => ws.close();
}
