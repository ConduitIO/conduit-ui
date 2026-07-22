import { describe, it, expect } from 'vitest';
import { tokenizeJson } from './jsonHighlight';

function reassemble(tokens: ReturnType<typeof tokenizeJson>): string {
  return tokens.map((t) => t.text).join('');
}

describe('tokenizeJson', () => {
  it('classifies keys, strings, numbers, booleans, and null distinctly', () => {
    const tokens = tokenizeJson({ name: 'ada', age: 30, active: true, note: null });
    const kinds = new Set(tokens.map((t) => t.kind));
    expect(kinds.has('key')).toBe(true);
    expect(kinds.has('string')).toBe(true);
    expect(kinds.has('number')).toBe(true);
    expect(kinds.has('boolean')).toBe(true);
    expect(kinds.has('null')).toBe(true);
    expect(kinds.has('punctuation')).toBe(true);
  });

  it('reassembling every token text reproduces the original pretty-printed JSON exactly', () => {
    const value = { a: [1, 2, { b: 'x' }], c: false };
    const tokens = tokenizeJson(value);
    expect(reassemble(tokens)).toBe(JSON.stringify(value, null, 2));
  });

  it('a string value is distinguished from a key by lookahead on the following colon', () => {
    const tokens = tokenizeJson({ key: 'not-a-key-value' });
    const keyTokens = tokens.filter((t) => t.kind === 'key');
    const stringTokens = tokens.filter((t) => t.kind === 'string');
    expect(keyTokens.map((t) => t.text)).toEqual(['"key"']);
    expect(stringTokens.map((t) => t.text)).toEqual(['"not-a-key-value"']);
  });

  it('a non-serializable value falls back to a single token, never throws', () => {
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    expect(() => tokenizeJson(circular)).not.toThrow();
    expect(tokenizeJson(circular).length).toBeGreaterThan(0);
  });
});
