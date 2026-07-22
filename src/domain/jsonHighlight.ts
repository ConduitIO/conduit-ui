// A minimal, hand-rolled JSON syntax tokenizer for the Drawer's record/payload
// display (plan §3.7). Not a library, not a full JSON parser with error
// recovery — it re-stringifies an already-decoded JS value with
// `JSON.stringify(value, null, 2)` and classifies each *token* of that known-
// good output for CSS-only coloring. Deliberately does not touch strings that
// might contain '{'/'"' etc. inside record VALUES by tokenizing the formatted
// text itself with one combined regex, rather than trying to re-derive
// structure from the value a second time.

export type JsonTokenKind = 'key' | 'string' | 'number' | 'boolean' | 'null' | 'punctuation';

export interface JsonToken {
  kind: JsonTokenKind;
  text: string;
}

const TOKEN_RE =
  /("(?:\\.|[^"\\])*"(?=\s*:))|("(?:\\.|[^"\\])*")|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)|(true|false)|(null)|([{}[\],:])/g;

/**
 * Pretty-prints `value` as JSON and tokenizes it for syntax coloring. Any
 * non-JSON-serializable input (e.g. a value containing a bigint) falls back to
 * `String(value)` as a single unclassified token, rather than throwing.
 */
export function tokenizeJson(value: unknown): JsonToken[] {
  let text: string;
  try {
    text = JSON.stringify(value, null, 2) ?? String(value);
  } catch {
    return [{ kind: 'punctuation', text: String(value) }];
  }

  const tokens: JsonToken[] = [];
  let lastIndex = 0;
  for (const match of text.matchAll(TOKEN_RE)) {
    const index = match.index;
    if (index > lastIndex) {
      tokens.push({ kind: 'punctuation', text: text.slice(lastIndex, index) });
    }
    const [, key, str, num, bool, nul, punct] = match;
    if (key !== undefined) tokens.push({ kind: 'key', text: key });
    else if (str !== undefined) tokens.push({ kind: 'string', text: str });
    else if (num !== undefined) tokens.push({ kind: 'number', text: num });
    else if (bool !== undefined) tokens.push({ kind: 'boolean', text: bool });
    else if (nul !== undefined) tokens.push({ kind: 'null', text: nul });
    else if (punct !== undefined) tokens.push({ kind: 'punctuation', text: punct });
    lastIndex = index + match[0].length;
  }
  if (lastIndex < text.length) {
    tokens.push({ kind: 'punctuation', text: text.slice(lastIndex) });
  }
  return tokens;
}
