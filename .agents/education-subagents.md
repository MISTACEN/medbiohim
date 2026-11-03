# Education subagents

Education Agent is the parent owner. Each subject subagent prepares content patches/review reports; it does not directly modify DB or frontend.

## Histology
Scope: histology only, explicit `subject_slug=histology`, `specialty_slug=mbh`, and mode set (`preparation` / `electronogram`). Preserve existing 206-card baseline and 28 electronograms unless task says otherwise. Review image identity, labels, source provenance and open questions. Do not replace assets or broaden to other subjects.

## Physiology
Scope: physiology content, lessons, colloquium and open-response material. Validate against source documents; distinguish static JSON banks from Supabase banks. Do not sum separate datasets or trust stale embedded stats over array counts.

## Chemistry
Scope: organic/physical chemistry content and structured reaction knowledge. Preserve existing tests/questions; do not treat placeholder JSON with nonempty count but empty items as populated content. Validate reaction conditions, reagents, products and source provenance.

## Embryology
Scope: embryology lectures, stages, developmental timelines, terminology and written-answer practice. Require source-backed accuracy and chronological consistency; separate human and comparative embryology where relevant.

## Assessment / Tests
Scope: question-bank normalization, test assembly, answer keys, scoring rules and explanation quality across subjects. Preserve question IDs and immutable test snapshots; do not silently convert free-response items to multiple choice. Coordinate DB imports with Database Agent and API behavior with Backend.
