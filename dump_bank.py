import json

d = json.load(open(r'public/content/physiology/krov-endokrin.json', encoding='utf-8'))
qs = d['banks'][0]['questions']
with open('site_bank.txt', 'w', encoding='utf-8') as f:
    for q in qs:
        f.write(f"#{q['number']} [{q['answer']}] {q['text']}\n")
        for i, o in enumerate(q['options'], 1):
            f.write(f"    {i}) {o}\n")
        f.write('\n')
print('written', len(qs))
# find endocrine boundary candidates
for i, q in enumerate(qs):
    if 'Специфические регуляторы' in q['text']:
        print('endocrine starts at index', i, 'number', q['number'])
        break
print('numbers:', [q['number'] for q in qs[:12]], '...', [q['number'] for q in qs[-6:]])
