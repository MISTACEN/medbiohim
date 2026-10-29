import type { Metadata } from "next";
import { PeriodicTable } from "@/components/chemistry/PeriodicTable";

export const metadata: Metadata = {
  title: "Периодическая таблица элементов",
  description:
    "Интерактивная таблица 118 химических элементов: поиск по номеру, символу и названию, фильтр по категориям, карточка элемента. Данные — из проверяемого публичного снимка с указанием источника.",
};

export default function ChemistryElementsPage() {
  return <PeriodicTable />;
}
