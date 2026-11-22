import json, sys, io

p = r'public/content/physiology/krov-endokrin.json'
d = json.load(open(p, encoding='utf-8'))
bank = d['banks'][0]
print('bank title:', bank['title'])
qs = bank['questions']
print('count:', len(qs))
from collections import Counter
lens = Counter(len(q['options']) for q in qs)
print('options count dist:', dict(lens))
ans = Counter(q['answer'] for q in qs)
print('answer values:', dict(ans))
print('keys sample:', list(qs[0].keys()))
for q in qs[:3]:
    print(json.dumps(q, ensure_ascii=False)[:400])
print('--- lessons ---')
for l in d['lessons']:
    print(l['id'], l['title'], 'keys:', list(l.keys()))
