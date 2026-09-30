"use client";

import { FormEvent, useState } from "react";
import type { ChemicalMolecule } from "@/lib/chemistry/types";

const representations = [
  ["2D", "2D structural image", true],
  ["3D", "3D conformer record", true],
  ["Fischer", "Fischer projection", false],
  ["Haworth", "Haworth projection", false],
  ["Newman", "Newman projection", false],
  ["Chair", "Chair conformation", false],
] as const;

export default function ChemistryPage() {
  const [query, setQuery] = useState("benzene");
  const [molecule, setMolecule] = useState<ChemicalMolecule | null>(null);
  const [representation, setRepresentation] = useState("2D");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function resolve(event?: FormEvent) {
    event?.preventDefault();
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/chemistry/resolve?query=${encodeURIComponent(query)}`);
      const data = await response.json();
      if (!response.ok || data.error) throw new Error(data.error || "Не удалось найти вещество");
      if (!data.molecule) throw new Error("Вещество не найдено");
      setMolecule(data.molecule);
      setRepresentation("2D");
    } catch (e) {
      setMolecule(null);
      setError(e instanceof Error ? e.message : "Не удалось найти вещество");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto max-w-6xl space-y-8 p-6">
      <header>
        <p className="text-sm font-medium opacity-70">MedBioHim · Химия</p>
        <h1 className="mt-2 text-3xl font-bold">Химический справочник</h1>
        <p className="mt-2 max-w-3xl opacity-80">
          Поиск вещества по названию, SMILES или InChI. Один объект ChemicalMolecule — для
          уроков, задач и будущих структурных редакторов (Фишер, Newman, кресло).
        </p>
      </header>

      <form onSubmit={resolve} className="flex flex-col gap-3 sm:flex-row">
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="benzene, glucose, aspirin, SMILES:CCO, InChI=..."
          className="min-w-0 flex-1 rounded-xl border px-4 py-3"
          aria-label="Химический запрос"
        />
        <button type="submit" disabled={loading} className="rounded-xl border px-5 py-3 font-medium disabled:opacity-50">
          {loading ? "Поиск…" : "Найти"}
        </button>
      </form>

      {error && <p role="alert" className="rounded-xl border p-4 text-sm">{error}</p>}

      {molecule && (
        <section className="space-y-5 rounded-2xl border p-6">
          <div className="flex flex-wrap gap-2">
            {representations.map(([key, label, available]) => (
              <button
                key={key}
                type="button"
                disabled={!available}
                onClick={() => setRepresentation(key)}
                className="rounded-lg border px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-40"
                title={available ? label : "Renderer в разработке (эксперименты на ветке beta)"}
              >
                {key}
              </button>
            ))}
          </div>

          <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_1.2fr]">
            <div className="flex min-h-80 items-center justify-center rounded-xl border bg-white p-4">
              {representation === "2D" && molecule.image2dUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={molecule.image2dUrl}
                  alt={`Структурная формула ${molecule.name}`}
                  className="max-h-80 max-w-full object-contain"
                />
              ) : representation === "3D" && molecule.image3dUrl ? (
                <div className="space-y-3 p-6 text-center">
                  <p className="font-medium">3D conformer доступен</p>
                  <a className="underline" href={molecule.image3dUrl} target="_blank" rel="noreferrer">
                    Открыть SDF
                  </a>
                </div>
              ) : (
                <span className="text-sm opacity-60">Представление будет сгенерировано из canonical structure.</span>
              )}
            </div>

            <div className="space-y-3">
              <h2 className="text-2xl font-semibold">{molecule.name}</h2>
              {molecule.formula && <p><strong>Формула:</strong> {molecule.formula}</p>}
              {molecule.molecularWeight && <p><strong>Молекулярная масса:</strong> {molecule.molecularWeight}</p>}
              {molecule.isomericSmiles && <p className="break-all text-sm"><strong>Isomeric SMILES:</strong> {molecule.isomericSmiles}</p>}
              {molecule.inchi && <p className="break-all text-sm"><strong>InChI:</strong> {molecule.inchi}</p>}
              {molecule.inchikey && <p className="break-all text-sm"><strong>InChIKey:</strong> {molecule.inchikey}</p>}
              <div className="rounded-xl border p-4 text-sm">
                <p><strong>Источник:</strong> PubChem / NCBI</p>
                {molecule.cid && <p><strong>CID:</strong> {molecule.cid}</p>}
                {molecule.provenance.retrievedAt && (
                  <p><strong>Получено:</strong> {new Date(molecule.provenance.retrievedAt).toLocaleString()}</p>
                )}
                {molecule.provenance.sourceUrl && (
                  <a className="mt-2 inline-block underline" href={molecule.provenance.sourceUrl} target="_blank" rel="noreferrer">
                    Открыть источник
                  </a>
                )}
              </div>
            </div>
          </div>
        </section>
      )}
    </main>
  );
}
