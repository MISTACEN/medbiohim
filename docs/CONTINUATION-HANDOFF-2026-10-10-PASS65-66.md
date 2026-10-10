# MEDBIOHIM — Pass 65–66: workflow permissions and runner failure diagnosis

Date: 2026-10-10  
Branch: `main`  
Scope: repository CI hardening and diagnosis only. No production deployment or database mutation.

## Pass 65 — least-privilege workflow tokens

Added explicit workflow-level permissions `contents: read` to four workflows that only need to check out/read the repository or package files:

- `.github/workflows/package-archives.yml`
- `.github/workflows/build-spaceweb-archive.yml`
- `.github/workflows/code-check.yml`
- `.github/workflows/smoke.yml`

Commits:
- `33f936b2f9f3b231d967957d969db959b9343467`
- `2a0fc6ac4b8b5bab1bd9817fddc6a2ff2f5e331a`
- `b716fe794c2a108923ad1ea908f4d1041ed5f55f`
- `c8ed55e9c8350c0d0953fafeb5a9897d32c06344`

This is a permissions reduction, not a CI repair. The deploy workflow was intentionally not changed because its required deployment permissions and secret usage need a separate audit.

## Pass 66 — Actions runner diagnostics

After the permission changes, GitHub Actions runs still fail before any step becomes visible:

| Workflow | Run | Result |
|---|---:|---|
| Code checks | [38024900534](https://github.com/MISTACEN/medbiohim/actions/runs/38024900534) | failed; both jobs have empty steps and null logs |
| SpaceWeb archive | [38024900530](https://github.com/MISTACEN/medbiohim/actions/runs/38024900530) | failed; empty steps and null logs |

Additional direct API observations:
- code-check run `38019548725`, attempt 2, failed again with no steps;
- raw jobs payload for run `38024900534` shows `runner_id: 0`, empty `runner_name`, `steps: []`, and job completion only seconds after creation;
- wrapper job payloads report `steps: null` and `logs_url: null`;
- workflow files are present on `main`, and new runs reference the expected commit SHA.

Interpretation: current evidence points to failure before runner allocation / job execution, rather than a failing PHP, npm, ZIP, or smoke-test command. It does **not** prove the exact platform-side root cause. Changing project source cannot reliably repair a runner that never starts.

## Pass 68 — token permissions across all workflows

Added explicit `permissions: contents: read` to the remaining two workflows:

- `.github/workflows/deploy-backend.yml` — commit `7695100f2e92d37f9a3511e16c96b84f0f9d4f6e`.
- `.github/workflows/optional-integrations-check.yml` — commit `d3641f2aee698dbf1f7069a5ffc01520294159d0`.

All six workflows now have explicit read-only repository-token permissions. The deployment workflow still has its FTP credential in Actions secrets; the source change did not trigger a successful deployment.

## Pass 69 — fixed malformed source-archive workflow YAML

A closer inspection found a real, independent bug in `.github/workflows/package-archives.yml`: five ZIP exclusion continuation lines were indented outside the YAML `run: |` block. GitHub consequently showed the workflow path as its display name and the run had no jobs. Corrected the shell-block indentation in commit `d566031d01e73f7a62a91e7502c9410456a9e6f2`. The next run now has the proper workflow name `Package MEDBIOHIM source` and a `package` job, confirming GitHub recognizes the workflow YAML again.

However, the package job still fails before steps: run [38025017740](https://github.com/MISTACEN/medbiohim/actions/runs/38025017740), raw job metadata shows `runner_id: 0`, empty `runner_name`, `steps: []`, and completion about two seconds after creation. Code checks [38025017750](https://github.com/MISTACEN/medbiohim/actions/runs/38025017750), smoke [38025017788](https://github.com/MISTACEN/medbiohim/actions/runs/38025017788), and SpaceWeb archive [38025017818](https://github.com/MISTACEN/medbiohim/actions/runs/38025017818) remain blocked in the same pre-step manner.

## Pass 70 — continuation record / next action

The next action is to inspect GitHub Actions repository/org settings and runner availability in the GitHub UI, check any disabled Actions policy, usage/billing limit, queue/service incident, or runner provisioning restriction, then request GitHub support if no setting explains the immediate pre-step failures. The malformed source-archive YAML is now fixed; do not revert that correction. The archive still needs a real successful run to verify its output.

After runner execution is restored:
1. dispatch code checks and verify that step logs exist;
2. validate PHP lint, backend regression tests, route registration, frontend predeploy audit;
3. dispatch source and SpaceWeb archive workflows; inspect archive listings and confirm no `.env` or `.env.*` entries;
4. run public smoke checks and only then update release status;
5. separately resume production runtime checks and the prepared-but-unapplied Supabase privilege migration review.

## Known constraints

- No production DB writes were performed.
- No deployment was triggered manually.
- Archive security guards are committed but remain **unverified by execution** while the runner issue persists.
- A commit being present on `main` is not evidence of successful tests or deployment.

## Exact continuation prompt

Continue work on `MISTACEN/medbiohim` directly on `main`, without creating unnecessary branches. Read this report and `docs/UNFINISHED-REGISTRY.md` first. Continue in short grouped passes (up to 10 small passes, fewer for large tasks), keeping each work session under 20 minutes where possible. For every pass, inspect the current state, make a real change or gather actionable evidence, verify what is possible, commit, and update the handoff. Do not claim tests passed when GitHub Actions jobs have `runner_id: 0`, empty steps, or missing logs. First unblock GitHub Actions execution via owner-side settings/support; then run the actual code/archive/smoke checks. Do not modify production data or manually deploy without explicit approval.
