# Release-gate source audit — Pass 58 (2026-10-10)

## Scope
Manual review of source-level release gates and deployment transport after GitHub Actions continued failing before workflow steps. No application code or production service was changed in this pass.

## Findings

### P1 — GitHub Actions cannot execute checks
Latest inspected runs (Pass 57) report steps: null and no logs across code-check, smoke, and archive workflows. This blocks confirmation of any build/test outcome. Root cause remains outside repository source evidence.

### P1 — Frontend build suppresses built-in TypeScript errors
next.config.ts sets typescript.ignoreBuildErrors: true. The independent pre-deploy audit invokes npm run typecheck before npm run build, so a working audit job should still fail on TypeScript errors. However, Vercel's own build alone is not a trustworthy type-safety gate until this override is removed or the independent check is confirmed in CI. It was not removed blindly because the repo comment says residual admin-page implicit-any issues remain and a blind change could break deployment.

### P1 — Dependency tree is not locked
package-lock.json, pnpm-lock.yaml, and yarn.lock are absent. The frontend workflow uses npm install and package ranges are caret-based, so dependency resolution can drift between builds. A correct lockfile must be generated and reviewed using npm with registry access; this environment cannot reach GitHub/registry from the local shell. No fabricated lockfile was added.

### P2 — ESLint configuration currently has no rules
eslint.config.mjs only lists ignored paths and does not import Next.js recommended rules or TypeScript rules. npm run lint therefore does not currently provide a meaningful code-quality gate even if it exits successfully. It is not invoked by the current code-check workflow. Adding rules safely requires a runnable local/CI environment to baseline and remediate findings; not done blindly while Actions cannot execute.

### P1 — FTP deployment disables certificate verification
.github/workflows/deploy-backend.yml passes --ssl -k to curl and sets ssl:verify-certificate no in lftp. This encrypts the connection when FTPS negotiates successfully but does not authenticate the server certificate, leaving credentials/source vulnerable to a man-in-the-middle if the connection is intercepted. Do not simply flip the flag without checking the hosting certificate/hostname; next safe step is verify the certificate chain and hostname from a trusted network, then enable verification and test a read-only listing before deployment. FTP password was not read or changed in this audit.

### P2 — Deployment has backup, but no demonstrated automatic rollback
The deploy workflow backs up source/routes before uploading and uploads the backup as an artifact, which is useful. Source inspection does not show a rollback step that restores the backup after a partial upload or post-deploy verification failure. Add a tested rollback mechanism only after verifying remote path behavior and backup completeness; not attempted here.

## Positive controls observed
- Backend syntax checks, three PHP regression scripts and route-registration smoke are in both code-check and deploy workflows.
- Pre-deploy audit also runs TypeScript typecheck and Next production build, and checks API proxy, route duplicates, authorization and media-cache invariants.
- Deploy workflow checks a non-empty backup before deployment and downloads multiple deployed files to verify source markers.
- No workflow command was run by GitHub Actions during the inspected failed attempts, so these are source observations, not passing test results.

## Next steps
1. Restore Actions job initialization or use an approved local runner with dependencies; run actual PHP lint/regression, TypeScript, Next build and pre-deploy audit.
2. Generate/commit a genuine npm lockfile with registry access; switch CI to npm ci after the lockfile is validated.
3. Baseline lint with Next.js recommended rules and TypeScript rules; fix findings before making lint a required gate.
4. Validate SpaceWeb FTPS certificate from a trusted environment, then enable certificate verification.
5. Add rollback only after a safe staging test of backup/restore semantics.
6. Reassess whether ignoreBuildErrors can be removed after actual typecheck findings are resolved.

Status: source audit complete; runtime gates remain blocked/unverified; no production writes/deployment.