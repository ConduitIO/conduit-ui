import type { SchemaV1Record, SchemaV1Data } from '../api/schema';

// Pure, DOM-free record decoding/flattening for the live record flow (UI-4). Kept
// separate from recordDiff.ts (which only compares two already-flattened maps) so
// "how do we read a wire record" and "how do we compare two views of one" don't
// get tangled — see the design plan §3.1/§3.2.

export type DecodedData =
  | { kind: 'empty' }
  | { kind: 'structured'; value: Record<string, unknown> }
  | { kind: 'text'; text: string }
  | { kind: 'binary'; byteLength: number };

// openapi-typescript has no way to express "arbitrary JSON object" and emits
// `Record<string, never>` for v1Data.structuredData — that's a codegen artifact,
// not a real constraint (the wire sends real structured payloads). This is the
// single sanctioned cast point; nothing else in this module reaches past decodeData.
function asObject(value: unknown): Record<string, unknown> {
  return value as Record<string, unknown>;
}

/**
 * Decodes a wire `v1Data` into a display/flatten-ready shape. Raw bytes are only
 * ever shown as text if they round-trip through a *strict* UTF-8 decode — a lossy
 * decode (the default `TextDecoder` behavior) would silently replace invalid bytes
 * with U+FFFD and render binary data as garbled-but-plausible text. `fatal: true`
 * makes that impossible: anything that isn't clean UTF-8 is reported as binary.
 */
export function decodeData(data: SchemaV1Data | undefined): DecodedData {
  if (!data) return { kind: 'empty' };
  if (data.structuredData !== undefined) {
    const obj = asObject(data.structuredData);
    if (Object.keys(obj).length > 0) return { kind: 'structured', value: obj };
  }
  if (data.rawData !== undefined && data.rawData.length > 0) {
    return decodeRawData(data.rawData);
  }
  return { kind: 'empty' };
}

function decodeRawData(base64: string): DecodedData {
  let bytes: Uint8Array;
  try {
    bytes = base64ToBytes(base64);
  } catch {
    // Not valid base64 at all — treat as opaque binary rather than throwing.
    return { kind: 'binary', byteLength: 0 };
  }
  if (bytes.byteLength === 0) return { kind: 'empty' };
  const text = tryDecodeStrictUtf8(bytes);
  return text !== undefined
    ? { kind: 'text', text }
    : { kind: 'binary', byteLength: bytes.byteLength };
}

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function tryDecodeStrictUtf8(bytes: Uint8Array): string | undefined {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return undefined;
  }
}

/**
 * Raw base64 `position` — the cross-stage join/dedupe key (records are not
 * mutated in transit, so this is stable end to end; see the plan's engine-facts
 * section). An empty/missing position is excluded from diffing entirely rather
 * than silently joined on an empty string, which would falsely correlate every
 * position-less record across every stage.
 */
export function recordPositionKey(record: SchemaV1Record): string | undefined {
  return record.position !== undefined && record.position.length > 0 ? record.position : undefined;
}

export function formatPosition(base64: string | undefined): { short: string; full: string } {
  if (base64 === undefined || base64.length === 0) return { short: '(none)', full: '' };
  const short = base64.length > 12 ? `${base64.slice(0, 10)}…` : base64;
  return { short, full: base64 };
}

function flattenValue(prefix: string, value: unknown, out: Map<string, string>): void {
  if (value === null || value === undefined) {
    out.set(prefix, value === null ? 'null' : 'undefined');
    return;
  }
  if (Array.isArray(value)) {
    if (value.length === 0) {
      out.set(prefix, '[]');
      return;
    }
    value.forEach((item, i) => flattenValue(`${prefix}[${i}]`, item, out));
    return;
  }
  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>);
    if (entries.length === 0) {
      out.set(prefix, '{}');
      return;
    }
    for (const [k, v] of entries) flattenValue(`${prefix}.${k}`, v, out);
    return;
  }
  out.set(prefix, primitiveToString(value));
}

// Everything reaching here is a JSON-decoded primitive (string/number/boolean)
// — never a plain object — but this is written as an explicit narrowing switch
// rather than a bare `String(value)` so it can never silently print
// "[object Object]" if an unexpected shape ever reaches it.
function primitiveToString(value: unknown): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
    return String(value);
  }
  if (typeof value === 'symbol') return value.toString();
  return typeof value;
}

function flattenData(
  prefix: string,
  data: SchemaV1Data | undefined,
  out: Map<string, string>
): void {
  const decoded = decodeData(data);
  switch (decoded.kind) {
    case 'empty':
      // Absent field — deliberately no entry (absent vs. empty-string matters for
      // the diff: a field that never existed at this stage is not "removed").
      return;
    case 'text':
      out.set(prefix, decoded.text);
      return;
    case 'binary':
      out.set(
        prefix,
        `(binary, ${decoded.byteLength} ${decoded.byteLength === 1 ? 'byte' : 'bytes'})`
      );
      return;
    case 'structured':
      flattenValue(prefix, decoded.value, out);
      return;
  }
}

/**
 * Flattens one record's diff-relevant surface into a dotted-path -> stringified
 * value map: `metadata.*`, `key.*`, and the record's "current" data view under
 * `payload.after.*`.
 *
 * "Current data view" is `payload.after` for every operation except a DELETE
 * that carries no `after` (deletes normally only populate `before`, representing
 * the entity as it existed right before removal) — that case falls back to
 * `payload.before`, still labeled `payload.after.*` so a field's diff key stays
 * stable across a stage boundary regardless of which side of the record actually
 * held the data. This mirrors the plan's diff semantics (§3.1/§4): the diff
 * always compares "the record's current view", not "whichever half happens to be
 * populated".
 */
export function flattenRecord(record: SchemaV1Record): Map<string, string> {
  const out = new Map<string, string>();
  for (const [k, v] of Object.entries(record.metadata ?? {})) {
    out.set(`metadata.${k}`, v);
  }
  flattenData('key', record.key, out);

  const payload = record.payload;
  const isDeleteWithNoAfter =
    record.operation === 'OPERATION_DELETE' && payload?.after === undefined;
  const dataSide = isDeleteWithNoAfter ? payload?.before : payload?.after;
  flattenData('payload.after', dataSide, out);

  return out;
}
