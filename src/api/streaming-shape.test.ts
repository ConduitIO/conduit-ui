import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

// The 3 Inspect streaming endpoints are excluded from the typed client because
// grpc-gateway models each as a single `{ result: <Record> }` object rather than
// a stream. This test asserts, against the RAW pinned schema (independent of what
// the generator did), that the `result` wrapper shape hasn't drifted — if it
// does, the hand-written websocket wrapper (streaming.ts) needs updating.
describe('Inspect streaming endpoints shape', () => {
  const root = path.resolve(import.meta.dirname, '..', '..');
  const schema = JSON.parse(
    readFileSync(path.join(root, 'src', 'api', 'api.swagger.json'), 'utf8')
  ) as {
    paths: Record<
      string,
      { get?: { responses?: { '200'?: { schema?: { properties?: { result?: unknown } } } } } }
    >;
  };

  const inspectPaths = [
    '/v1/connectors/{id}/inspect',
    '/v1/processors/{id}/inspect-in',
    '/v1/processors/{id}/inspect-out',
  ];

  for (const p of inspectPaths) {
    it(`${p} responds with a { result } wrapper`, () => {
      const op = schema.paths[p]?.get;
      expect(op, `path ${p} missing from schema`).toBeTruthy();
      const props = op?.responses?.['200']?.schema?.properties;
      expect(props, `${p} 200 response has no schema.properties`).toBeTruthy();
      expect('result' in (props ?? {})).toBe(true);
    });
  }
});
