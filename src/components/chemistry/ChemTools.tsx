"use client";

import { useMemo, useState, type ReactNode } from "react";
import { FlaskConical, Info } from "lucide-react";
import {
  kaFromPka,
  isWaterLimited,
  phBuffer,
  phStrongAcid,
  phStrongBase,
  phWeakAcid,
  stockVolume,
} from "@/lib/chemistry/solutions";

type Tool = "dilution" | "ph";

function Field({
  label,
  value,
  onChange,
  unit,
  step = "any",
}: {
  label: string;
  value: string;
  onChange: (next: string) => void;
  unit?: string;
  step?: string;
}) {
  return (
    <label className="block">
      <span className="text-xs font-medium text-[var(--muted)]">{label}</span>
      <span className="mt-1 flex items-center gap-2">
        <input
          type="number"
          inputMode="decimal"
          step={step}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="w-full rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm"
        />
        {unit ? <span className="shrink-0 text-xs text-[var(--muted)]">{unit}</span> : null}
      </span>
    </label>
  );
}

function Result({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] px-4 py-3 text-sm">
      {children}
    </div>
  );
}

export default function ChemTools() {
  const [tool, setTool] = useState<Tool>("dilution");

  const [c1, setC1] = useState("1");
  const [c2, setC2] = useState("0.1");
  const [v2, setV2] = useState("100");

  const [acidC, setAcidC] = useState("0.01");
  const [baseC, setBaseC] = useState("0.01");
  const [weakPka, setWeakPka] = useState("4.76");
  const [weakC, setWeakC] = useState("0.1");
  const [bufferPka, setBufferPka] = useState("4.76");
  const [bufferAcid, setBufferAcid] = useState("0.1");
  const [bufferBase, setBufferBase] = useState("0.1");

  const dilution = useMemo(
    () => stockVolume(Number(c1), Number(c2), Number(v2)),
    [c1, c2, v2],
  );

  const phAcid = useMemo(() => phStrongAcid(Number(acidC)), [acidC]);
  const phBase = useMemo(() => phStrongBase(Number(baseC)), [baseC]);
  const weakKa = useMemo(() => kaFromPka(Number(weakPka)), [weakPka]);
  const phWeak = useMemo(
    () => (weakKa.ok ? phWeakAcid(weakKa.value, Number(weakC)) : weakKa),
    [weakKa, weakC],
  );
  const bufferKa = useMemo(() => kaFromPka(Number(bufferPka)), [bufferPka]);
  const phBuf = useMemo(
    () =>
      bufferKa.ok
        ? phBuffer(bufferKa.value, Number(bufferAcid), Number(bufferBase))
        : bufferKa,
    [bufferKa, bufferAcid, bufferBase],
  );

  return (
    <div className="space-y-4">
      <div className="flex gap-1 rounded-xl border border-[var(--border)] p-1">
        {(
          [
            ["dilution", "Разведение"],
            ["ph", "pH растворов"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setTool(id)}
            aria-pressed={tool === id}
            className={[
              "flex-1 rounded-lg px-3 py-2 text-sm font-semibold",
              tool === id ? "bg-[var(--primary)] text-white" : "hover:bg-[var(--primary-soft)]",
            ].join(" ")}
          >
            {label}
          </button>
        ))}
      </div>

      {tool === "dilution" ? (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="C₁ исходного раствора" unit="моль/л" value={c1} onChange={setC1} />
            <Field label="C₂ нужного раствора" unit="моль/л" value={c2} onChange={setC2} />
            <Field label="V₂ нужного объёма" unit="мл" value={v2} onChange={setV2} />
          </div>
          {dilution.ok ? (
            <Result>
              <p>
                Взять <b>{dilution.value.stockVolumeMl.toFixed(2)} мл</b> исходного раствора и
                довести растворителем до <b>{Number(v2).toFixed(2)} мл</b>.
              </p>
              <p className="mt-1 text-xs text-[var(--muted)]">
                Объём растворителя ≈ {dilution.value.solventVolumeMl.toFixed(2)} мл.
              </p>
            </Result>
          ) : (
            <Result>
              <p className="text-[var(--status-warn-fg)]">{dilution.error}</p>
            </Result>
          )}
          <p className="flex items-start gap-2 text-xs leading-5 text-[var(--muted)]">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            C₁V₁ = C₂V₂ предполагает аддитивность объёмов и полную диссоциацию. Для точных
            работ объём доводят в мерной колбе, а не суммой миллилитров.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-3 rounded-2xl border border-[var(--border)] p-4">
              <p className="text-sm font-semibold">Сильные электролиты</p>
              <Field label="C(HCl)" unit="моль/л" value={acidC} onChange={setAcidC} />
              <Result>
                pH = {phAcid.ok ? phAcid.value.toFixed(2) : phAcid.error}
              </Result>
              {isWaterLimited(Number(acidC)) ? (
                <p className="text-[11px] leading-4 text-[var(--muted)]">
                  Концентрация сравнима с вкладом воды — он учтён в расчёте.
                </p>
              ) : null}
              <Field label="C(NaOH)" unit="моль/л" value={baseC} onChange={setBaseC} />
              <Result>
                pH = {phBase.ok ? phBase.value.toFixed(2) : phBase.error}
              </Result>
              {isWaterLimited(Number(baseC)) ? (
                <p className="text-[11px] leading-4 text-[var(--muted)]">
                  Концентрация сравнима с вкладом воды — он учтён в расчёте.
                </p>
              ) : null}
            </div>

            <div className="space-y-3 rounded-2xl border border-[var(--border)] p-4">
              <p className="text-sm font-semibold">Слабая кислота</p>
              <Field label="pKa" value={weakPka} onChange={setWeakPka} step="0.01" />
              <Field label="C кислоты" unit="моль/л" value={weakC} onChange={setWeakC} />
              <Result>pH = {phWeak.ok ? phWeak.value.toFixed(2) : phWeak.error}</Result>
            </div>
          </div>

          <div className="space-y-3 rounded-2xl border border-[var(--border)] p-4">
            <p className="text-sm font-semibold">Буфер (Гендерсон–Хассельбах)</p>
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="pKa" value={bufferPka} onChange={setBufferPka} step="0.01" />
              <Field label="[HA]" unit="моль/л" value={bufferAcid} onChange={setBufferAcid} />
              <Field label="[A⁻]" unit="моль/л" value={bufferBase} onChange={setBufferBase} />
            </div>
            <Result>
              pH = {phBuf.ok ? phBuf.value.toFixed(2) : phBuf.error}
              {phBuf.ok ? (
                <span className="ml-2 text-xs text-[var(--muted)]">
                  (буфер работает в пределах ±1 от pKa)
                </span>
              ) : null}
            </Result>
          </div>

          <p className="flex items-start gap-2 text-xs leading-5 text-[var(--muted)]">
            <FlaskConical className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            pH считается с автоионизацией воды (Kw = 10⁻¹⁴), поэтому разбавленные растворы не
            дают невозможных значений. Модель не учитывает активности, ионную силу и температуру;
            для точных измерений нужен pH-метр и калибровка.
          </p>
        </div>
      )}
    </div>
  );
}
