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
 * Opens an Inspect stream and invokes onRecord for each record frame. Returns a
 * close function. This is a thin boundary; reconnect/backpressure/sampling UX is
 * UI-4's job (see the design doc's live-record-flow section).
 */
export function openInspectStream<TRecord = unknown>(
  url: string,
  onRecord: (record: TRecord) => void,
  onError?: (err: Event) => void
): () => void {
  const ws = new WebSocket(url);
  ws.addEventListener('message', (ev: MessageEvent<string>) => {
    const frame = JSON.parse(ev.data) as InspectFrame<TRecord>;
    onRecord(frame.result);
  });
  if (onError) ws.addEventListener('error', onError);
  return () => ws.close();
}
