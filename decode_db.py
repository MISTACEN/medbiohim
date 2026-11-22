import re, collections

raw = open('metodichka_db.xml', 'rb').read()
print('first bytes', raw[:16])
if raw[:2] in (b'\xff\xfe', b'\xfe\xff'):
    t = raw.decode('utf-16')
elif raw[:1] == b'\x00':
    t = raw.decode('utf-16-be')
elif len(raw) > 1 and raw[1:2] == b'\x00':
    t = raw.decode('utf-16-le')
else:
    t = raw.decode('utf-8', 'replace')

print('len chars', len(t))
roles = collections.Counter(re.findall(r"role='([^']+)'", t))
print(roles)
open('metodichka_db_decoded.xml', 'w', encoding='utf-8').write(t)
print(t[:400])
