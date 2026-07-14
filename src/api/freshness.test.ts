import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { generateSchemaTypes } from '../../scripts/generate-schema.mjs';

// Generated-client freshness test (NOT a client-vs-live-API contract test — it
// proves the checked-in client matches what regenerating from the pinned schema
// produces, so the generated types can never silently drift from the vendored
// schema). The pinned-vs-live-engine gap is tracked via SCHEMA_VERSION + the
// documented re-vendor path.
describe('generated API client freshness', () => {
  it('src/api/schema.d.ts matches a fresh generation from the pinned schema', async () => {
    const root = path.resolve(import.meta.dirname, '..', '..');
    const committed = readFileSync(path.join(root, 'src', 'api', 'schema.d.ts'), 'utf8');
    const fresh: string = await generateSchemaTypes(
      path.join(root, 'src', 'api', 'api.swagger.json')
    );
    expect(committed).toBe(fresh); // stale -> run `npm run gen:api`
  });
});
