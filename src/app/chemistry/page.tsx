"use client";

import { FormEvent, useState } from "react";
import type { ChemicalMolecule } from "@/lib/chemistry/types";

export default function ChemistryPage() {
  const [query, setQuery] = useState("benzene");
  const [molecule, setMolecule] = useState<ChemicalMolecule | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function resolve(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/chemistry/resolve?query=${encodeURIComponent(query)}`);
      const data = await response.json();
      if (!response.ok || data.error) throw new Error(data.error || "Не удалось найти вещество");
      setMolecule(data.molecule);
    } catch (e) {
      setMolecule(null);
      setError(e instanceof Error ? e.message : "Не удалось найти вещество");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto max-w-5xl space-y-8 p-6">
      <header>
        <p className="text-sm font-medium opacity-70">MedBioHim · Chemistry Beta</p>
        <h1 className="mt-2 text-3xl font-bold">Химический движок</h1>
        <p className="mt-2 max-w-3xl opacity-80">
          Поиск по названию и получение проверяемой структуры с указанием источника.
          Дальше этот объект будет использоваться для 2D/3D, стереохимии, реакций и задач.
        </p>
      </header>

      <form onSubmit={resolve} className="flex flex-col gap-3 sm:flex-row">
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Например: benzene, glucose, aspirin"
          className="min-w-0 flex-1 rounded-xl border px-4 py-3"
        />
        <button
          type="submit"
          disabled={loading}
          className="rounded-xl border px-5 py-3 font-medium disabled:opacity-50"
        >
          {loading ? "Поиск…" : "Найти"}
        </button>
      </form>

      {error && <p className="rounded-xl border p-4 text-sm">{error}</p>}

      {molecule && (
        <section className="grid gap-6 rounded-2xl border p-6 md:grid-cols-[minmax(0,1fr)_1.2fr]">
          <div className="flex min-h-72 items-center justify-center rounded-xl border bg-white p-4">
            {molecule.image2dUrl ? (
              // The source image is supplied by PubChem and is intentionally not re-uploaded.
              <img
                src={molecule.image2dUrl}
                alt={`Структурная формула ${molecule.name}`}
                className="max-h-72 max-w-full object-contain"
              />
            ) : (
              <span className="text-sm opacity-60">2D representation unavailable</span>
            )}
          </div>

          <div className="space-y-3">
            <h2 className="text-2xl font-semibold">{molecule.name}</h2>
            {molecule.formula && <p><strong>Формула:</strong> {molecule.formula}</p>}
            {molecule.molecularWeight && <p><strong>Молярная масса:</strong> {molecule.molecularWeight}</p>}
            {molecule.isomericSmiles && <p className="break-all text-sm"><strong>SMILES:</strong> {molecule.isomericSmiles}</p>}
            {molecule.inchikey && <p className="break-all text-sm"><strong>InChIKey:</strong> {molecule.inchikey}</p>}
            <div className="rounded-xl border p-4 text-sm">
              <p><strong>Источник:</strong> PubChem / NCBI</p>
              {molecule.cid && <p><strong>CID:</strong> {molecule.cid}</p>}
              {molecule.provenance.sourceUrl && (
                <a
                  className="mt-2 inline-block underline"
                  href={molecule.provenance.sourceUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  Открыть источник
                </a>
              )}
            </div>
          </div>
        </section>
      )}

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {["2D / SVG", "3D", "Fischer / Haworth / Newman", "Реакции и механизмы"].map((item) => (
          <div key={item} className="rounded-xl border p-4">
            <p className="font-medium">{item}</p>
            <p className="mt-1 text-sm opacity-60">Следующий beta-слой</p>
          </div>
        ))}
      </section>
    </main>
  );
}
