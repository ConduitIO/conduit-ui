// Whether the engine this UI talks to has no authentication in front of it.
//
// TODO(UI-6): this is a stub, not dead code. Verified against pkg/http (v0.18):
// no auth mechanism exists on the Conduit HTTP API today, so there is no 401/403
// response to probe for — "detecting" auth would just be guessing. Hard-coding
// `true` is honest about that: anyone who can reach the port can already
// `curl -X POST .../stop`, with or without this banner. It's factored as a
// function (not an inline constant at the call site) so a real check — e.g.
// an unauthenticated HEAD request, or reading an engine-reported auth-enabled
// flag once one exists — drops in here without touching NoAuthBanner or App.tsx.
export function isApiUnauthenticated(): boolean {
  return true;
}
