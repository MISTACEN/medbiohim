insert into public.chemical_topics (slug,name,discipline,description) values
('general-chemistry','Общая химия','general','Атомное строение, связь, стехиометрия, растворы и основные закономерности.'),
('inorganic-chemistry','Неорганическая химия','inorganic','Элементы, соединения, комплексы, ОВР и качественный анализ.'),
('organic-chemistry','Органическая химия','organic','Углеводороды, функциональные группы, реакции, механизмы и номенклатура.'),
('physical-chemistry','Физическая химия','physical','Термодинамика, равновесие, кинетика, электрохимия и растворы.'),
('analytical-chemistry','Аналитическая химия','analytical','Титриметрия, спектроскопия, хроматография и количественный анализ.'),
('biochemistry','Биохимия','biochemistry','Аминокислоты, белки, углеводы, липиды, нуклеотиды и биохимические реакции.'),
('stereochemistry','Стереохимия','organic','R/S, E/Z, D/L, проекции и конформации.')
on conflict (slug) do update set name=excluded.name, discipline=excluded.discipline, description=excluded.description;

insert into public.chemical_functional_groups (name,smarts,description) values
('Hydroxyl','[OX2H]','Гидроксильная группа'),
('Carbonyl','[CX3]=[OX1]','Карбонильная группа'),
('Carboxyl','C(=O)[OX2H1]','Карбоксильная группа'),
('Amino','[NX3;H2,H1,H0]','Аминогруппа'),
('Amide','C(=O)N','Амидная группа'),
('Ester','C(=O)O','Эстерная группа'),
('Ether','[OD2]([#6])[#6]','Эфирная связь'),
('Halogen','[F,Cl,Br,I]','Галогеновый заместитель')
on conflict (name) do update set smarts=excluded.smarts, description=excluded.description;
