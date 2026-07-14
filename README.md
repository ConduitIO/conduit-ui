# conduit-ui

Conduit's built-in web UI — **observe + operate**, not authoring.

This is a React single-page app, generated-from-OpenAPI, that will be embedded into the `conduit`
binary and served by `conduit run`. It observes running pipelines (live record flow, per-stage
inspection, a pipeline graph, metrics) and operates them (start/stop). It is **not** an authoring
surface: pipelines are created and edited as config (YAML → `conduit pipelines deploy`/`apply`, MCP,
or the library), which stays the single source of truth. See the design doc in the `conduit` repo:
`docs/design-documents/20260713-greenfield-built-in-ui.md`.

This repo is at the **UI-1 (bootstrap)** stage: scaffold, generated API client + freshness test,
design tokens, CI. Feature slices (fleet view, graph, record flow, operate, embedding) follow.

## Develop against a running engine

Start Conduit with the UI's dev origin allowed for CORS (the engine denies cross-origin by default):

```sh
conduit run --api.http.cors.allowed-origins=http://localhost:5173
```

Then:

```sh
npm ci
npm run dev        # Vite dev server on http://localhost:5173
```

`*` is refused on a non-loopback bind — list exact origins for anything but local loopback.

## Scripts

| Command                   | What it does                                                          |
| ------------------------- | --------------------------------------------------------------------- |
| `npm run dev`             | Vite dev server                                                       |
| `npm run build`           | Typecheck + static SPA build to `dist/` (embedded into conduit later) |
| `npm run test`            | Vitest (unit + a11y + the generated-client freshness test)            |
| `npm run lint` / `format` | ESLint (incl. jsx-a11y) / Prettier                                    |
| `npm run gen:api`         | Regenerate the typed API client from the vendored schema              |

## The API client

The typed client (`src/api/`) is **generated** from a vendored, byte-identical copy of Conduit's
served OpenAPI schema (`src/api/api.swagger.json`, Swagger 2.0 from grpc-gateway, converted to
OpenAPI 3.x at generation time). `SCHEMA_VERSION` records the `conduit` ref the schema came from.

The **generated-client freshness test** asserts the checked-in client matches a fresh generation
from the pinned schema — so the client can never silently drift from the schema. It does **not**
prove the pinned schema matches a live engine; that gap is tracked by `SCHEMA_VERSION` and the
re-vendor path (copy `conduit`'s `proto/api/v1/api.swagger.json` here, update `SCHEMA_VERSION`, run
`npm run gen:api`). A scheduled drift check is a planned fast-follow.

The 3 Inspect **streaming** endpoints are excluded from the typed client (grpc-gateway models them
as a single object, not a stream) and use the hand-written websocket wrapper in `src/api/streaming.ts`.

## Design tokens

`src/tokens/` holds framework-agnostic CSS custom properties, every one namespaced `--conduit-*`.
They will later be extracted into a shared `@conduitio/design-tokens` package used by both this UI
and the connector-registry web UI — keep the folder free of framework/build-tool syntax.
