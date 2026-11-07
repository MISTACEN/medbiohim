# Универсальные хим. структуры в контенте

Один `ChemicalFigure` — лекции, тесты, билеты, практика.

## Лекции

````markdown
```chem
query: benzene
representation: skeletal
caption: Бензол
```

```chem
{"query":"glucose","representation":"fischer"}
```

```chem
{"query":"aspirin","representation":"3d"}
```

```chem
photoUrl: https://cdn.example.com/aspirin-scan.jpg
caption: Скан из учебника
```
````

## Вопросы / ответы

- `[chem:benzene]`
- `[chem query="glucose" rep="fischer"]`
- `[chem query="benzene" rep="3d"]`

## 3D

`representation: 3d` → **3Dmol.js** (CDN), SDF из PubChem.
Стили: stick / line / sphere · вращение · drag/zoom.

## React

```tsx
import { ChemicalFigure, ChemRichText, Mol3DView } from "@/components/chemistry";
<ChemicalFigure spec={{ query: "aspirin", representation: "3d" }} />
```

## Приоритет 2D

1. photoUrl / imageUrl
2. RDKit SVG / PubChem PNG
3. проекции Fischer…
