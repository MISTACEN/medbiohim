/**
 * Общий слой интерфейса MEDBIOHIM (этап D).
 *
 * Точка входа для новых экранов: `import { Button, Badge, Modal, Tabs } from "@/components/ui"`.
 * Глубокие импорты (`@/components/ui/Skeleton`) остаются рабочими — их 40+ по
 * репозиторию, и переписывать их ради красоты импорта не нужно.
 *
 * Баррель — это ещё и контракт: `test/ui-barrel.test.mjs` требует, чтобы каждый
 * компонент каталога был отсюда виден. Иначе половина экранов незаметно
 * импортирует файлы, которых нет в реестре общего слоя.
 */
export { Badge, BADGE_TONES, badgeClasses, type BadgeTone } from "./Badge";
export { Button, ButtonLink, buttonClasses, type ButtonLinkProps, type ButtonProps, type ButtonSize, type ButtonStyleOptions, type ButtonVariant } from "./Button";
export { useConfirm, type ConfirmOptions } from "./ConfirmDialog";
export { DataTable, type DataTableColumn } from "./DataTable";
export { EmptyState } from "./EmptyState";
export { ErrorState } from "./ErrorState";
export { Field, FieldInput, FieldTextarea } from "./Field";
export { Modal, type ModalLevel, type ModalRole, type ModalSize } from "./Modal";
export { Tabs, type TabItem, type TabVariant } from "./Tabs";
export { SkeletonCard, SkeletonCards, SkeletonList, SkeletonTable, SkeletonText } from "./Skeleton";
export { LoadingBar } from "./LoadingBar";
export { GlobalLoadingBar } from "./GlobalLoadingBar";
export { RadialProgress } from "./RadialProgress";
export { ServiceNoticeBanner } from "./ServiceNoticeBanner";
export { Confetti } from "./Confetti";
