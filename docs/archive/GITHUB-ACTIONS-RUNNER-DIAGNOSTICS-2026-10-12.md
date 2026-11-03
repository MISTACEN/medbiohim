# GitHub Actions runner diagnostics — 2026-10-12

## Evidence collected

Repository: `MISTACEN/medbiohim`, default branch `main`.

Workflow: `.github/workflows/optional-integrations-check.yml` (name: `MEDBIOHIM optional integrations checks`).

The workflow is configured to use GitHub-hosted `ubuntu-24.04`, checkout v4, Node.js 22, then run:
- Telegram bot tests;
- Cloudflare Telegram Worker tests;
- Cloudflare API migration tests;
- Python histology importer tests;
- browser extension syntax and permission checks.

Run `38204783534` had job `optional-integrations` fail. Its first reported job ID was `114665745768`; the job summary had no steps and no logs URL. The failed job was re-run through the GitHub Actions API. The retry job ID `114666611692` also completed with `failure`, again with an empty step list and no logs URL. Fetching its logs returned HTTP 404 (`BlobNotFound`).

## What this proves / does not prove

- Both attempts failed before any step summary was available to the connected GitHub API.
- This is consistent with a runner/provisioning/service-side failure, but the evidence is insufficient to identify the exact cause.
- It does **not** prove that the Node/Python tests pass or fail; the job did not expose test output.
- No workflow configuration, repository Actions setting, or runner setting was changed as part of this diagnostic.

## Next checks

1. In GitHub UI, open the failed run and inspect the run-level annotations and any “Set up job” failure message.
2. Check repository **Settings → Actions → General** for Actions disabled/restricted policy and allowed actions.
3. Compare another workflow run from the same period and confirm whether all GitHub-hosted runner jobs fail before checkout.
4. Once a runner reaches steps, execute the existing test suite before changing application logic; preserve the actual first failing assertion/log.
5. Do not mark CI restored until a new run visibly executes checkout and test steps and concludes successfully.

## Operational safety

No production cutover was performed. The Cloudflare API remains a shadow deployment; SpaceWeb PHP remains the current backend.