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
photoUrl: https://cdn.example.com/aspirin-scan.jpg
caption: Скан из учебника
```
````

## Вопросы / ответы

- `[chem:benzene]`
- `[chem query="glucose" rep="fischer"]`
- fenced `chem` блок в тексте

## React

```tsx
import { ChemicalFigure, ChemRichText } from "@/components/chemistry";
<ChemicalFigure spec={{ query: "aspirin", representation: "skeletal" }} />
<ChemRichText text={question.text} />
```

## Приоритет

1. photoUrl / imageUrl (фото формулы)
2. resolve → RDKit SVG / PubChem PNG
3. проекции Fischer…
