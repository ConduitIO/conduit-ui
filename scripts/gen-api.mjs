// Regenerates the typed API client from the vendored copy of Conduit's served
// OpenAPI schema (src/api/api.swagger.json). Run: npm run gen:api
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { generateSchemaTypes } from './generate-schema.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const schema = path.join(root, 'src', 'api', 'api.swagger.json');
const out = path.join(root, 'src', 'api', 'schema.d.ts');

const ts = await generateSchemaTypes(schema);
writeFileSync(out, ts);
console.log(`generated ${path.relative(root, out)} from ${path.relative(root, schema)}`);
