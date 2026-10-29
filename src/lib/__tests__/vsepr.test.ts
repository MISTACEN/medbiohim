import { describe, expect, it } from "vitest";
import { analyzeVsepr } from "@/lib/chemistry/vsepr";

type Atom = { z?: number; chg?: number; impHs?: number };
type Bond = { atoms: [number, number]; bo?: number };

/** Минимальный UST-JSON в том же виде, что отдаёт RDKit get_json(). */
function ust(atoms: Atom[], bonds: Bond[] = []) {
  return JSON.stringify({
    defaults: { atom: { z: 6, chg: 0, impHs: 0 }, bond: { bo: 1 } },
    molecules: [{ atoms, bonds }],
  });
}

function atom(json: string, index: number, aromatic: number[] = []) {
  return analyzeVsepr(json, aromatic).atoms.find((item) => item.index === index);
}

describe("VSEPR", () => {
  it("вода, аммиак и метан: тетраэдрическая серия", () => {
    const water = atom(ust([{ z: 8, impHs: 2 }]), 0);
    expect(water).toMatchObject({ stericNumber: 4, lonePairs: 2, geometry: "угловая", hybridization: "sp³" });

    const ammonia = atom(ust([{ z: 7, impHs: 3 }]), 0);
    expect(ammonia).toMatchObject({ stericNumber: 4, lonePairs: 1, geometry: "тригонально-пирамидальная" });

    const methane = atom(ust([{ z: 6, impHs: 4 }]), 0);
    expect(methane).toMatchObject({ stericNumber: 4, lonePairs: 0, geometry: "тетраэдрическая", angles: "109,5°" });
  });

  it("кратные связи: CO₂ линейна, формальдегид плоский", () => {
    const co2 = ust([{ z: 6 }, { z: 8 }, { z: 8 }], [
      { atoms: [0, 1], bo: 2 }, { atoms: [0, 2], bo: 2 },
    ]);
    expect(atom(co2, 0)).toMatchObject({ stericNumber: 2, hybridization: "sp", geometry: "линейная" });
    expect(atom(co2, 1)).toBeUndefined(); // терминальный атом — не центр

    const formaldehyde = ust([{ z: 6, impHs: 2 }, { z: 8 }], [{ atoms: [0, 1], bo: 2 }]);
    expect(atom(formaldehyde, 0)).toMatchObject({ stericNumber: 3, hybridization: "sp²", geometry: "тригональная плоская" });
  });

  it("гипервалентность: SF₆, PCl₅, XeF₄", () => {
    const sf6 = ust([{ z: 16 }, ...Array.from({ length: 6 }, () => ({ z: 9 }))],
      Array.from({ length: 6 }, (_, i) => ({ atoms: [0, i + 1] as [number, number] })));
    expect(atom(sf6, 0)).toMatchObject({ stericNumber: 6, geometry: "октаэдрическая", hybridization: "sp³d²" });

    const pcl5 = ust([{ z: 15 }, ...Array.from({ length: 5 }, () => ({ z: 17 }))],
      Array.from({ length: 5 }, (_, i) => ({ atoms: [0, i + 1] as [number, number] })));
    expect(atom(pcl5, 0)).toMatchObject({ stericNumber: 5, geometry: "тригонально-бипирамидальная" });

    const xef4 = ust([{ z: 54 }, ...Array.from({ length: 4 }, () => ({ z: 9 }))],
      Array.from({ length: 4 }, (_, i) => ({ atoms: [0, i + 1] as [number, number] })));
    expect(atom(xef4, 0)).toMatchObject({ stericNumber: 6, lonePairs: 2, geometry: "квадратная плоская" });
  });

  it("заряд: NH₄⁺ тетраэдричен", () => {
    expect(atom(ust([{ z: 7, chg: 1, impHs: 4 }]), 0)).toMatchObject({ lonePairs: 0, geometry: "тетраэдрическая" });
  });

  it("ароматика: пиррол не получает ложную пирамиду", () => {
    const benzene = ust(
      Array.from({ length: 6 }, () => ({ impHs: 1 })),
      [
        { atoms: [0, 1] }, { atoms: [1, 2], bo: 2 }, { atoms: [2, 3] },
        { atoms: [3, 4], bo: 2 }, { atoms: [4, 5] }, { atoms: [5, 0], bo: 2 },
      ],
    );
    expect(atom(benzene, 0, [0, 1, 2, 3, 4, 5])).toMatchObject({ aromatic: true, hybridization: "sp²", geometry: "плоская (ароматическая)" });

    const pyrrole = ust(
      [{ impHs: 1 }, { impHs: 1 }, { impHs: 1 }, { z: 7, impHs: 1 }, { impHs: 1 }],
      [{ atoms: [0, 1] }, { atoms: [1, 2], bo: 2 }, { atoms: [2, 3] }, { atoms: [3, 4] }, { atoms: [4, 0], bo: 2 }],
    );
    expect(atom(pyrrole, 3, [0, 1, 2, 3, 4])).toMatchObject({ aromatic: true, lonePairs: null, hybridization: "sp²" });
  });

  it("пропускает металлы, а не выдумывает геометрию", () => {
    const complex = analyzeVsepr(ust([{ z: 26 }, ...Array.from({ length: 6 }, () => ({ z: 7 }))],
      Array.from({ length: 6 }, (_, i) => ({ atoms: [0, i + 1] as [number, number] }))));
    expect(complex.atoms).toHaveLength(0);
    expect(complex.notes.join(" ")).toMatch(/вне модели/);
  });
});
