# MEDBIOHIM Browser Extension — requirements and behavior spec

**Date recorded:** 2026-10-11  
**Status:** agreed product requirements; implementation and runtime validation are still pending.  
**Repository area:** `integrations/browser-extension/`  
**Product concept:** MEDBIOHIM Bridge — compact browser-side assistant connecting third-party learning/test sites with the MEDBIOHIM study platform.

## 1. Core behavior

The extension should understand the academic subject for the current test/page, find answers while the student is taking a test, and help build a progressively better subject-organized question bank. It must not be limited to opening quick links.

### Subject recognition
- Infer the likely subject from available page title, test/course headings, question content, URL/domain-specific adapter, and existing MEDBIOHIM mappings.
- Support subject, topic/module, source site, test/session, question stem, answer options, question type, and available result/feedback.
- Allow manual subject correction when inference is uncertain.
- Keep uncertainty explicit; do not silently assign a weakly inferred subject as certain.
- A question may have multiple valid subject/topic associations when appropriate.

### Compact side panel
- Prefer the browser side panel or similarly compact extension UI; use screen space efficiently and do not force tab switching.
- Show the detected subject, current question, options, match status, answer when available, confidence/provenance, and source.
- Support one correct option, multiple correct options, free-text answers, and other formats only where the source adapter can reliably interpret them.
- Offer a compact all-question view with found/not-found/review states; expand details only when requested.
- Keep the original test page unchanged. The extension presents a parallel view and must not silently alter answers or submit the test.
- When automatic extraction misses text/options, allow the user to select/correct the question text, add missing options, and retry matching.

## 2. Answer lookup and trust model

### Source approved by an administrator
- An administrator-maintained allowlist defines trusted source domains/adapters and the permitted capabilities for each source.
- For approved sources, use available questions, options, answer keys, explanations, and test results directly according to that source's configured adapter and access rules; do not require manual approval for every imported item.
- Trusting a site enables automated ingestion from that site but does not mean every piece of content is infallible. Preserve provenance and distinguish an answer explicitly marked correct by the source from a student's selected answer.
- Site-specific rules can limit supported subject areas, question formats, and fields that may be imported.

### Unknown or not-yet-approved source
- Searching for an answer on an unknown source may still be attempted where technically and legally accessible.
- Content discovered there is beta/untrusted: keep it in a review queue and do not automatically promote it to the trusted main bank or allow it to override a trusted answer.
- The administrator can approve/reject the source and review queued content.

### Lookup priority
1. Match the MEDBIOHIM question bank, accounting for wording normalization and option permutations.
2. Query approved external sources/adapters.
3. Attempt other accessible discovery paths, clearly labelling provenance and confidence.
4. If no defensible answer is found, display “Answer not found” rather than inventing one.

Similar questions should be matched cautiously: compare the stem, options, question type, subject/topic, and source context; do not merge questions solely because their wording is similar.

## 3. First-time test and learning pipeline

When a test is encountered for the first time:
1. Detect the subject and extract the question stem and options where possible.
2. Search the existing MEDBIOHIM bank and configured sources.
3. If the question is new, create a candidate record containing the original stem, normalized search text, options, option order, question type, subject/topic (with confidence), source URL/domain, observed time, and extraction status.
4. If the correct answer is unknown, save the candidate with an explicitly empty/unknown answer and a “waiting for result/review” status. Never infer correctness from the student's choice alone.
5. Continue looking for the source's end-of-test review, answer key, explanations, or per-question feedback after the test finishes, where available and accessible.
6. Match result feedback back to the captured question and options; store the answer and evidence only when the source actually supports the conclusion.
7. If only a score is shown and the site does not reveal which answers are correct, retain the question as unresolved. A score alone is not evidence for each individual answer.
8. If a result cannot be captured, keep the candidate queued for later manual review or a future matching attempt.
9. Deduplicate safely and retain provenance/history rather than destructively replacing original records.

This pipeline should work across subjects and supported test formats, not only histology or one named website. Use source-specific adapters because third-party sites expose different markup, question navigation, and result screens.

## 4. Answer status model

Suggested distinct states:
- **New candidate** — first seen, not yet classified/verified.
- **Answer unknown** — question/options captured; no supported key yet.
- **Answer found, unverified** — candidate answer discovered but evidence/quality review remains.
- **Verified answer** — backed by a source-provided answer key/feedback or explicit administrator verification; record the evidence.
- **Trusted source** — source/domain approved by an administrator; this is a source state, not itself a per-answer correctness claim.
- **Beta review** — content from an unapproved source.
- **Rejected / duplicate / merged** — reviewed disposition with a history entry.

Keep “student selected answer,” “site says correct answer,” “external candidate answer,” and “administrator-confirmed answer” as distinct fields or evidence types.

## 5. Admin panel, journal and editing

Add or connect an administrator workflow for the full ingestion lifecycle:
- Source allowlist/registry with approval, disable/revoke, supported subjects, supported formats, and adapter capability notes.
- Ingestion journal listing each addition, update, answer discovery, verification, rejection, duplicate merge, and source approval.
- Sort/filter by newest/oldest date, subject, source/domain, status, answer state, question type, and operation type.
- Search by question text, source URL, test/session and record identifier.
- Full editing of imported question stem, options, correct answers, explanation, subject/topic associations, source metadata and status, with validation.
- Review of before/after values, who/what changed the record (extension, adapter, student-provided correction, administrator), timestamp, and reason.
- View duplicate candidates and merge them without losing the original provenance or audit history.
- Bulk actions may be added later but must show a preview and require confirmation for destructive changes.
- Access to admin mutations must be enforced server-side; hiding UI controls is not authorization.

## 6. Security, privacy and reliability

- Use least-privilege browser permissions. Prefer user-initiated extraction and narrowly scoped adapters over broad access to every site.
- Never place Supabase service-role keys, backend secrets, or other privileged credentials in the extension package.
- Use authenticated MEDBIOHIM API routes for writes and enforce user/admin permissions on the server.
- Do not bypass paywalls, access controls, login requirements, anti-bot protections, or other technical restrictions.
- Avoid storing session cookies, passwords, full private pages, or unrelated personal data. Store only the question/test information needed for the stated learning workflow.
- Sanitize external text and treat page content as untrusted input.
- Add retry-safe ingestion and duplicate protection before enabling automated writes. Result pages may be revisited, so answer extraction must be idempotent.
- Keep source provenance and timestamps so questionable answers can be traced and corrected.

## 7. Implementation approach and acceptance gates

Build on the existing `integrations/browser-extension/` MVP and preserve its current quick links. Do not create a separate parallel question database or invent backend routes without checking existing API and schema.

Recommended staged delivery:
1. Inspect current extension manifest, popup, permissions, tests and existing MEDBIOHIM search/import APIs.
2. Build a minimal compact panel and robust question/option extraction for a small adapter set, with manual correction.
3. Connect read-only matching to the existing question bank and display source/confidence/status.
4. Add trusted-source registry and beta review queue, reusing existing admin/data models where possible.
5. Add candidate ingestion, test-completion/result extraction, answer evidence and idempotency.
6. Add the admin journal, editing, filters, audit history and safe duplicate merging.
7. Validate against representative pages and question formats; test unknown source, trusted source, missing options, reordered options, repeat visits, result page with key, score-only result, permission denial, authentication expiry and network failure.

Do not claim the extension is implemented, tests pass, or live third-party sites work until each gate is actually executed. The repository's GitHub Actions runner allocation has previously failed before steps; that is an independent verification blocker.

## 8. Explicitly agreed product decisions

- The extension must determine the subject, with manual correction if uncertain.
- During tests it always attempts answer lookup and can show results in a compact side panel.
- A first-seen question with no known key is saved as a candidate and waits for post-test evidence; the student's own selected option is not treated as the key.
- An administrator-approved source is used automatically within its configured capabilities; every individual item from a trusted source does not need manual approval.
- Content from unknown sources remains beta/untrusted until source/content review permits promotion.
- The admin panel needs a complete dated journal, filtering/sorting and editing of imported content and source approvals.
- The extension can show a parallel test-with-answers view when answers are found, but it must not silently alter or submit the original test.
- Preserve the compact UI and current extension functionality; extend the existing implementation rather than creating unnecessary branches or parallel systems.
