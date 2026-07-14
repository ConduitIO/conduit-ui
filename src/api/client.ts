import createClient from 'openapi-fetch';
import type { paths } from './schema';

// The typed API client, generated from the vendored OpenAPI schema. This is the
// ONLY sanctioned way to call Conduit's HTTP API — it's provably "just another
// API client" (see the design doc). The 3 Inspect streaming endpoints are
// deliberately NOT driven through this typed client (grpc-gateway models them as
// a single `{result: Record}` object, which is wrong for a stream); they use the
// hand-written websocket wrapper in ./streaming instead.
//
// baseUrl defaults to same-origin (the embedded UI case); override for dev
// against a remote engine (with the engine's api.http.cors.allowed-origins set).
export function createConduitClient(baseUrl = '') {
  return createClient<paths>({ baseUrl });
}

export type ConduitClient = ReturnType<typeof createConduitClient>;
