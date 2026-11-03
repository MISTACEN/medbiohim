# MEDBIOHIM — API and cross-layer contracts

## Canonical request path
Browser/PWA → same-origin `/api/v1/*` → Next.js proxy `src/app/api/v1/[...path]/route.ts` → HTTPS Cloudflare Worker `medbiohim-api`. Proxy does not fall back to PHP. Worker may use `medbiohim-api-shadow` only for compatibility responses with HTTP 501. Do not route ordinary requests directly to shadow.

## Envelope
Success:
```json
{ "ok": true, "data": {}, "requestId": "request-id" }
```
Error:
```json
{ "ok": false, "error": { "code": "ERROR_CODE", "message": "Safe user-facing message" }, "requestId": "request-id" }
```
Preserve HTTP status semantics. Do not expose stack traces, SQL details, tokens, upstream credentials or private data. Existing endpoints may have documented legacy/streaming/binary exceptions; inspect the actual route before normalizing.

## Transport
- Frontend uses relative `/api/v1` base and sends bearer/cookie session as supported by proxy.
- Proxy forwards only approved headers and uses no-store behavior for API calls.
- Binary/media endpoints may return bytes and appropriate `Content-Type`, `Cache-Control`, `Content-Disposition`, `ETag`; do not wrap binary in JSON.
- Propagate or generate `requestId` consistently; never use it to expose internal state.

## Auth and authorization
- Authenticate on server/Worker; frontend hiding is not authorization.
- Use authenticated Supabase client for user-scoped data and RLS. Service role is server-only and must be narrowly justified.
- Every user-owned read/write must enforce owner/group/role scope at the data boundary. Test anon, authenticated owner, other user and staff/admin cases.
- Admin UI visibility and Worker authorization are distinct. Worker remains authoritative.

## Database contract
- Supabase is canonical source of truth. Redis is cache/ephemeral only.
- Before changing a query, inspect actual live schema and current migration ledger; historical SQL files are not proof of deployed schema.
- API and DB agents agree on field names, nullability, cardinality, constraints, RPC signatures, RLS and migration rollout before implementation.
- Migration is not applied until ledger/live schema confirms it.

## Storage contract
- General file adapter: B2 preferred when configured, Upstash fallback.
- Trainer/histology images: separate Drive index → public Upstash Blob/SDK resolver; not the general B2 adapter.
- Public media must contain no private data. Private documents require authorization or expiring signed URLs.
- Validate object keys, MIME, size and access scope. Never accept arbitrary remote URLs/paths without allowlist/normalization.

## Change protocol
Any change to URL, method, request/response schema, auth requirements, pagination, error codes or binary behavior requires a contract note and coordinated frontend/backend/QA review. Backward compatibility is preferred; version only when needed.
