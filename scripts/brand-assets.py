#!/usr/bin/env python3
"""
Сборка брендовых ассетов из исходников, присланных дизайнером.

    python3 scripts/brand-assets.py <иконка.png> <лого.png>

Источник истины — присланные PNG. Скрипт лежит в репозитории, чтобы при
следующем обновлении логотипа не пришлось вспоминать, как получены
производные файлы (фавикон, apple-touch-icon, вариант для светлого фона).

Что генерируется в public/:
    favicon.png          192x192, прозрачный фон
    apple-touch-icon.png 180x180, фон #0A0A0A (iOS не любит прозрачность:
                         подставляет свой фон, и лайм на нём может утонуть)
    logo.png             лого как прислано — для тёмного фона
    logo-on-light.png    словесная часть перекрашена в #0A0A0A

Почему не SVG: присланная иконка — растр, а дуга в ней не описывается
концентрическим кольцом, поэтому «честная» векторизация без обводки
контуров дала бы искажение формы. Растеризатора SVG (potrace/cairosvg) в
окружении нет, проверить вектор пиксельным сравнением нельзя — поэтому
работаем с растром. Если у дизайнера есть SVG — он предпочтительнее,
тогда этот скрипт можно упростить.
"""

import sys
from pathlib import Path

from PIL import Image

INK = (10, 10, 10)  # ink-900 из tailwind.config.js
# Словесная часть лого начинается правее лаймового знака. Знак занимает
# x 0..97 в исходнике 680px, поэтому 110 — безопасная граница.
WORDMARK_X = 110


def is_lime(r: int, g: int, b: int) -> bool:
    """Лаймовый акцент #DEFE00 / #E7FE17 — его перекрашивать нельзя."""
    return g > 200 and r > 180 and b < 80


def sharpen_alpha(img: Image.Image, gain: float = 1.6) -> Image.Image:
    """
    Подтягивает края после увеличения.

    Иконка — плоская фигура с резкими границами. При апскейле LANCZOS
    даёт мягкий градиент по краю и фигура выглядит замыленной. Прогоняем
    альфу через S-образную кривую вокруг 0.5: полупрозрачные пиксели
    расходятся к 0 и 255, край становится резче, но сглаживание
    сохраняется — в отличие от простого порога, который дал бы «лестницу».
    """
    r, g, b, a = img.split()
    lut = []
    for v in range(256):
        t = v / 255.0
        t = (t - 0.5) * gain + 0.5
        lut.append(max(0, min(255, round(t * 255))))
    return Image.merge('RGBA', (r, g, b, a.point(lut)))


def trim(img: Image.Image) -> Image.Image:
    """Снимает прозрачные поля, чтобы отступы задавались нами, а не исходником."""
    bbox = img.split()[3].getbbox()
    return img.crop(bbox) if bbox else img


def square(img: Image.Image, pad_ratio: float, bg=None) -> Image.Image:
    """Вписывает арт в квадрат с полем, опционально на сплошном фоне."""
    w, h = img.size
    side = max(w, h)
    pad = round(side * pad_ratio)
    size = side + pad * 2
    canvas = Image.new('RGBA', (size, size), (*bg, 255) if bg else (0, 0, 0, 0))
    canvas.paste(img, ((size - w) // 2, (size - h) // 2), img)
    return canvas


def main() -> int:
    if len(sys.argv) != 3:
        print(__doc__)
        return 1

    icon_src, logo_src = Path(sys.argv[1]), Path(sys.argv[2])
    out = Path(__file__).resolve().parent.parent / 'public'
    for p in (icon_src, logo_src):
        if not p.is_file():
            print(f'нет файла: {p}')
            return 1

    icon = trim(Image.open(icon_src).convert('RGBA'))
    print(f'иконка: арт-бокс {icon.size[0]}x{icon.size[1]}')

    # Фавикон: небольшое поле, иначе фигура липнет к краю вкладки.
    fav = square(icon, 0.06).resize((192, 192), Image.LANCZOS)
    sharpen_alpha(fav).save(out / 'favicon.png')
    print('  -> favicon.png 192x192')

    # apple-touch-icon: поле больше (iOS сам скругляет углы и подрезает край),
    # фон непрозрачный.
    apple = square(icon, 0.16, bg=INK).resize((180, 180), Image.LANCZOS)
    apple.convert('RGB').save(out / 'apple-touch-icon.png')
    print('  -> apple-touch-icon.png 180x180 на #0A0A0A')

    logo = Image.open(logo_src).convert('RGBA')
    logo.save(out / 'logo.png')
    print(f'лого: {logo.size[0]}x{logo.size[1]} -> logo.png (тёмный фон, как прислано)')

    # Присланный лого белый: на светлой панели логина он был бы невидим.
    # Перекрашиваем только текст, лаймовый знак оставляем как есть.
    light = logo.copy()
    px = light.load()
    changed = 0
    for y in range(light.size[1]):
        for x in range(WORDMARK_X, light.size[0]):
            r, g, b, a = px[x, y]
            if a == 0 or is_lime(r, g, b):
                continue
            px[x, y] = (*INK, a)  # альфу сохраняем -> сглаживание живо
            changed += 1
    light.save(out / 'logo-on-light.png')
    print(f'  -> logo-on-light.png (перекрашено {changed} пикселей текста в #0A0A0A)')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
