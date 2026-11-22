import re, sys

t = open('metodichka_db_decoded.xml', encoding='utf-8').read()
print('chars', len(t))

for m in re.finditer('Эталоны', t):
    print('offset', m.start(), 'line', t.count('\n', 0, m.start()) + 1)

# also count questions in test sections
print('----')
for pat in ['Итоговый тест', 'Тестовые задания по физиологии крови', 'Тестовые задания по физиологии гемостаза']:
    idxs = [m.start() for m in re.finditer(re.escape(pat), t)]
    print(pat, idxs[:5])
