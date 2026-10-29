# -*- coding: utf-8 -*-
import io
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "ocr")

args = sys.argv[1:]
if not args:
    print("usage: peek.py <dir-or-file> [n]")
    raise SystemExit(1)

if args[0].isdigit() and not os.path.exists(os.path.join(OUT, args[0])):
    # аргумент приходит из bash в мojibake — принимаем индекс каталога
    dirs = sorted(d for d in os.listdir(OUT) if os.path.isdir(os.path.join(OUT, d)))
    idx = int(args[0])
    if idx >= len(dirs):
        print("нет каталога с индексом", idx, "| есть:", dirs)
        raise SystemExit(1)
    print("#", idx, "=", dirs[idx])
    args[0] = dirs[idx]

target = os.path.join(OUT, args[0]) if not os.path.isabs(args[0]) else args[0]
n = int(args[1]) if len(args) > 1 else 3

if os.path.isdir(target):
    for i in range(1, n + 1):
        p = os.path.join(target, "page-%02d.txt" % i)
        if os.path.exists(p):
            t = io.open(p, encoding="utf-8", errors="ignore").read()
            print("=" * 20, os.path.basename(target), "page", i, "len", len(t))
            print(t[:1200])
        else:
            print("=" * 20, "нет", p)
else:
    t = io.open(target, encoding="utf-8", errors="ignore").read()
    print("len", len(t))
    print(t[:4000])
