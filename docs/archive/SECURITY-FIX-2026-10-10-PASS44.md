# Security fix — trainer route membership consistency (Pass 44)

Date: 2026-10-10  
Repository: `MISTACEN/medbiohim`  
Source commit: `99ed1bc905a1b9fe2f2d5ca2f2b6e8bac2dd53a3`  
Scope: PHP API source only; no Supabase content rows or ticket banks changed.

## Finding

The PHP trainer endpoints did not apply the same MBH membership rule consistently. Some paths checked only `specialty_slug = mbh`, while histology content may be identified by `subject_slug = histology`. The unfiltered feed could also query published rows without excluding restricted histology/MBH cards for a user outside MBH.

## Source changes

- Feed: checks access when the requested filter is histology/MBH and excludes histology/MBH-restricted rows from the main SQL query for users without MBH membership.
- Supabase REST fallback: adds equivalent restrictions in both fallback branches, including rows where either slug is NULL.
- Detail, answer submission, and image endpoints: check both `subject_slug = histology` and `specialty_slug = mbh`.
- Question sanitizer: removes top-level correctness/answer fields and option correctness flags, including recursively nested question objects.

## Verification state

- Source reviewed after commits `c763cba`, `6b48951`, and `99ed1bc`.
- GitHub Actions jobs triggered by the code change failed before their first step; reported `runner_id=0` and `steps=[]`. Therefore PHP lint, route-registration checks, and authenticated integration tests did not run.
- SpaceWeb deployment is **not confirmed**. The source fix must not be described as live until the deployment is verified.
- Vercel READY status only validates the frontend deployment metadata; it does not prove the PHP routes on SpaceWeb have been updated.
- No destructive content changes were made.

## Required acceptance checks

1. Non-MBH authenticated user: feed excludes histology/MBH cards; detail, answer, and image endpoints return 403 for restricted cards.
2. Active MBH member: can load an allowed histology card, submit an answer, and receive post-answer review.
3. Feed fallback works when the PHP SQL connection fails, without returning restricted cards to non-MBH users.
4. Run `php -l` on all backend PHP files and the route-registration smoke check.
5. Verify the deployed PHP source on SpaceWeb and repeat checks against the live API.
