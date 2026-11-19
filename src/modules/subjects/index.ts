/**
 * Публичная поверхность модуля «предметы».
 *
 * Снаружи (`src/app`, `src/components`) импортируется только этот баррель —
 * правило проверяет `test/module-boundaries.test.mjs`.
 */
export {
  SUBJECT_SUBMODULES,
  SUBMODULE_SLUGS,
  getSubmodule,
  requireSubmodule,
  submoduleForSubject,
  submoduleTab,
} from "./registry";
export type { SubjectSubmodule, SubjectSubmoduleTab } from "./registry";
