#!/usr/bin/env python3
"""Gera a arte bloqueada (monocromática) de uma insígnia a partir da colorida.

Receita extraída das artes que já existiam (paleta de 15/09/2026):
cinza Rec.601 (o mesmo do convert('L') do Pillow) e alfa a 55% do original.
Assim a bloqueada fica apagada na grade sem sumir.

Uso:  python3 scripts/bloquear-insignia.py public/insignias/<chave>-128.png [...]
      python3 scripts/bloquear-insignia.py --todas
Escreve <chave>-bloqueada-128.png ao lado da entrada.
"""
import sys
from pathlib import Path
from PIL import Image

ALFA = 0.55
RAIZ = Path(__file__).resolve().parent.parent / 'public' / 'insignias'


def bloquear(origem: Path) -> Path:
    destino = origem.with_name(origem.name.replace('-128.png', '-bloqueada-128.png'))
    img = Image.open(origem).convert('RGBA')
    if img.size != (128, 128):
        img = img.resize((128, 128), Image.LANCZOS)
    cinza = img.convert('L').convert('RGBA')
    cinza.putalpha(img.getchannel('A').point(lambda a: round(a * ALFA)))
    cinza.save(destino, optimize=True)
    return destino


def main(argv):
    if argv and argv[0] == '--todas':
        alvos = sorted(p for p in RAIZ.glob('*-128.png') if '-bloqueada-' not in p.name)
    else:
        alvos = [Path(a) for a in argv]
    if not alvos:
        print(__doc__)
        return 1
    for origem in alvos:
        print('->', bloquear(origem).name)
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
