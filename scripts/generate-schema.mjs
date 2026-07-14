// Shared schema-generation used by both `npm run gen:api` and the freshness
// test, so they can never diverge. Conduit serves Swagger 2.0 (grpc-gateway);
// the vendored copy is kept byte-identical to that, and converted to OpenAPI 3.x
// here at generation time before feeding openapi-typescript (which requires 3.x).
import { readFileSync } from 'node:fs';
import openapiTS, { astToString } from 'openapi-typescript';
import swagger2openapi from 'swagger2openapi';

export async function generateSchemaTypes(swaggerPath) {
  const swagger = JSON.parse(readFileSync(swaggerPath, 'utf8'));
  const { openapi } = await swagger2openapi.convertObj(swagger, {
    patch: true,
    warnOnly: true,
    anchors: true,
  });
  const ast = await openapiTS(openapi, { rootTypes: true });
  return astToString(ast);
}
