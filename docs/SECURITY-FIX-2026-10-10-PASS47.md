# Security/reliability fix — private media cache isolation (Pass 47)

Date: 2026-10-10  
Scope: `src/lib/api.ts`, `scripts/predeploy-audit.mjs`.

## Finding

Three client caches were keyed only by a content ID: trainer card data, trainer image blob URLs, and material file URLs/blob URLs. Because these endpoints enforce specialty/group access on the server, retaining a previously authorized response across an account switch could bypass the new account's authorization check in the current browser tab. In addition, material presigned B2 URLs expire after a bounded lifetime, but the client cache did not distinguish them from stable URLs.

This is a client-side cache isolation risk; no live cross-account access was demonstrated.

## Changes

- Trainer card, trainer image and material-file caches now include the current user scope.
- Opaque/malformed tokens bypass cache rather than sharing a generic authenticated cache bucket (Pass 46).
- Changing account scope and logging out clears cached API data, private card data and private media blob URLs; blob URLs are revoked.
- If a new account scope is selected without a new refresh token, the previous account's refresh token is removed rather than retained.
- Authenticated trainer images use `cache: no-store` rather than browser `force-cache`.
- Presigned B2 URLs are returned but not retained in the in-memory material cache.
- Direct trainer-image, material-file and histology-source-file fetches now have bounded request timeouts; refresh requests use a 10-second timeout.
- The pre-deploy audit now checks the private-media cache isolation contract.

## Verification / limitations

- Source reviewed; no production cross-account leak was reproduced.
- GitHub Actions still fails before steps, so TypeScript/pre-deploy audit has not executed in GitHub.
- Latest observed READY Vercel deployment predates Pass 45–47 source changes; production inclusion is not confirmed.
- SpaceWeb file authorization remains a separate required test: access must be enforced server-side regardless of browser cache behavior.

## Acceptance

1. Typecheck and pre-deploy audit pass.
2. Account A opens a restricted trainer card/material; logout and sign in as account B without access; B cannot see the previous blob/card via cache.
3. Same-user refresh retains correct access, while logout clears cached private object URLs.
4. Presigned B2 URLs are re-negotiated after a fresh request instead of being reused from memory.
5. Run iPhone Safari and desktop browser tests for image/material loading, retry, timeout and account switching.
