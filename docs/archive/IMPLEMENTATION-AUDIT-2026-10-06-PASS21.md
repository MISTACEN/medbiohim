# IMPLEMENTATION AUDIT — 2026-10-06 — PASS 21

## Deployment / runtime gate and cross-group audit

### Findings

1. Vercel project is connected and identifiable, but the connected Vercel account cannot read/list or create deployments for the project: API returns 403 Forbidden. No deployment was changed.
2. GitHub .github/workflows/code-check.yml exists and contains frontend npm install/architecture checks, source-artifact detection, duplicate route detection, npm run predeploy:audit, backend PHP 8.4 syntax check, and route-registration smoke test.
3. The connected GitHub workflow query currently returns no workflow runs for the latest commits, so CI is not evidence of a green build.
4. A cross-group bug was found in bank-progress: the sequential preparation session query did not constrain group_id. Fixed to use the resolved canonical group.
5. Live Supabase invariants after the fix:
- active attempts without group: 0
- active preparations without group: 0
- active preparations without academic session: 0
- active preparations without question snapshot: 0
- preparation results without answer snapshot: 0
- current database has no user/test combination with sequential sessions spanning multiple groups.

### Deployment conclusion

No production deployment was forced because the connected Vercel credentials return 403 and do not have permission to create a deployment. This is an access limitation, not a build-success claim.

SpaceWeb runtime remains a separate target-runtime gate.

### Next

Pass 22 should continue the broad legacy/stub audit while preserving the current immutable test/preparation model, then re-attempt runtime verification if deployment access becomes available.