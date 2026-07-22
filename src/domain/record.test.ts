import { describe, it, expect } from 'vitest';
import type { SchemaV1Record } from '../api/schema';
import { decodeData, flattenRecord, formatPosition, recordPositionKey } from './record';

function b64(s: string): string {
  return btoa(s);
}

describe('decodeData', () => {
  it('decodes raw UTF-8 text', () => {
    expect(decodeData({ rawData: b64('hello world') })).toEqual({
      kind: 'text',
      text: 'hello world',
    });
  });

  it('reports non-UTF-8 bytes as binary, never garbled text', () => {
    // 0xFF 0xFE is not valid UTF-8 on its own.
    const bytes = new Uint8Array([0xff, 0xfe, 0x00, 0x01]);
    const binary = String.fromCharCode(...bytes);
    expect(decodeData({ rawData: btoa(binary) })).toEqual({ kind: 'binary', byteLength: 4 });
  });

  it('prefers structured data over raw data when both present', () => {
    expect(decodeData({ rawData: b64('ignored'), structuredData: { a: 1 } as never })).toEqual({
      kind: 'structured',
      value: { a: 1 },
    });
  });

  it('treats an empty structured object as empty, falling through to rawData', () => {
    expect(decodeData({ structuredData: {}, rawData: b64('fallback') })).toEqual({
      kind: 'text',
      text: 'fallback',
    });
  });

  it('missing data is empty', () => {
    expect(decodeData(undefined)).toEqual({ kind: 'empty' });
  });

  it('empty rawData string is empty, not a zero-length binary blob', () => {
    expect(decodeData({ rawData: '' })).toEqual({ kind: 'empty' });
  });
});

describe('recordPositionKey', () => {
  it('returns the raw base64 position', () => {
    expect(recordPositionKey({ position: 'cG9zMQ==' })).toBe('cG9zMQ==');
  });

  it('excludes a missing position', () => {
    expect(recordPositionKey({})).toBeUndefined();
  });

  it('excludes an empty-string position', () => {
    expect(recordPositionKey({ position: '' })).toBeUndefined();
  });
});

describe('formatPosition', () => {
  it('shortens a long position and keeps the full value', () => {
    const full = b64('a-fairly-long-position-value');
    const { short, full: kept } = formatPosition(full);
    expect(kept).toBe(full);
    expect(short.length).toBeLessThan(full.length);
    expect(short.endsWith('…')).toBe(true);
  });

  it('leaves a short position untouched', () => {
    expect(formatPosition('abc')).toEqual({ short: 'abc', full: 'abc' });
  });

  it('renders a missing position as (none)', () => {
    expect(formatPosition(undefined)).toEqual({ short: '(none)', full: '' });
  });
});

describe('flattenRecord', () => {
  it('flattens metadata, key, and payload.after into dotted paths', () => {
    const record: SchemaV1Record = {
      position: 'p1',
      operation: 'OPERATION_UPDATE',
      metadata: { 'conduit.source.plugin': 'postgres' },
      key: { rawData: b64('id-123') },
      payload: {
        after: { structuredData: { email: 'a@example.com', address: { city: 'nyc' } } as never },
      },
    };
    const flat = flattenRecord(record);
    expect(flat.get('metadata.conduit.source.plugin')).toBe('postgres');
    expect(flat.get('key')).toBe('id-123');
    expect(flat.get('payload.after.email')).toBe('a@example.com');
    expect(flat.get('payload.after.address.city')).toBe('nyc');
  });

  it('flattens nested arrays with index paths', () => {
    const record: SchemaV1Record = {
      payload: { after: { structuredData: { tags: ['a', 'b'] } as never } },
    };
    const flat = flattenRecord(record);
    expect(flat.get('payload.after.tags[0]')).toBe('a');
    expect(flat.get('payload.after.tags[1]')).toBe('b');
  });

  it('a delete with only `before` populated flattens under payload.after.* (stable diff key)', () => {
    const record: SchemaV1Record = {
      operation: 'OPERATION_DELETE',
      payload: { before: { structuredData: { id: '42' } as never } },
    };
    const flat = flattenRecord(record);
    expect(flat.get('payload.after.id')).toBe('42');
  });

  it('a delete WITH an after present still prefers after, not before', () => {
    const record: SchemaV1Record = {
      operation: 'OPERATION_DELETE',
      payload: {
        before: { structuredData: { id: '42', extra: 'old' } as never },
        after: { structuredData: { id: '42' } as never },
      },
    };
    const flat = flattenRecord(record);
    expect(flat.get('payload.after.id')).toBe('42');
    expect(flat.has('payload.after.extra')).toBe(false);
  });

  it('a record with no position is still flattenable (excluded only from diff joining, not display)', () => {
    const record: SchemaV1Record = {
      payload: { after: { structuredData: { a: '1' } as never } },
    };
    expect(recordPositionKey(record)).toBeUndefined();
    expect(flattenRecord(record).get('payload.after.a')).toBe('1');
  });

  it('an absent field produces no map entry at all (absent vs. empty string)', () => {
    const record: SchemaV1Record = {};
    const flat = flattenRecord(record);
    expect(flat.has('payload.after')).toBe(false);
    expect(flat.has('key')).toBe(false);
  });
});
