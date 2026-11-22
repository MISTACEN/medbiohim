import json

d = json.load(open(r'public/content/physiology/krov-endokrin.json', encoding='utf-8'))
raw = json.dumps(d, ensure_ascii=False)
print('Специфические регуляторы' in raw)
print('гормоны' in raw.lower())
for l in d['lessons']:
    t = l.get('tests')
    print(l['id'], 'tests:', type(t), (len(t) if hasattr(t,'__len__') else t))
    if isinstance(t, list) and t:
        print('   sample:', json.dumps(t[0], ensure_ascii=False)[:300])
print('bank numbers first/last:', d['banks'][0]['questions'][0]['number'], d['banks'][0]['questions'][-1]['number'])
print('stats:', d['stats'])
