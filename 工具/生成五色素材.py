"""从花园原画导出五色 WebP。默认处理全部主题，也可传入一个主题名和相对 PNG 路径。"""
import argparse
import re
from pathlib import Path

from PIL import Image, ImageColor

STATIC = Path(__file__).resolve().parents[1] / 'MindGarden' / 'static'
THEMES = STATIC / 'garden' / 'themes'
INKS = ('ink', 'leaf', 'paper', 'sand', 'accent')


def inks_for(theme):
    css = (STATIC / 'css' / 'print_palette.css').read_text(encoding='utf-8')
    rule = re.search(r'html\[data-theme="' + re.escape(theme) + r'"\]\s*\{([^}]+)', css)
    return [ImageColor.getrgb(re.search(r'--mg-' + ink + r':\s*(#[\da-fA-F]{6})', rule[1])[1])
            for ink in INKS]


def fixed_palette(colors):
    swatch = Image.new('P', (1, 1))
    swatch.putpalette([channel for color in colors for channel in color] + list(colors[0]) * 251)
    return swatch


def export(source, dest, colors):
    with Image.open(source) as image:
        rgba = image.convert('RGBA')
        # 抖动用五种油墨的疏密表现水面和树冠的层次。透明边缘随原图保留。
        indexed = rgba.convert('RGB').quantize(palette=fixed_palette(colors), dither=Image.Dither.FLOYDSTEINBERG)
        result = indexed.convert('RGB')
        result.putalpha(rgba.getchannel('A'))
        dest.parent.mkdir(parents=True, exist_ok=True)
        result.save(dest, lossless=True, method=4)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('theme', nargs='?', choices=['cute', 'fresh', 'ugly'])
    parser.add_argument('asset', nargs='?', type=Path)
    args = parser.parse_args()
    for theme in [args.theme] if args.theme else ['cute', 'fresh', 'ugly']:
        root = THEMES / theme
        images = [root / args.asset] if args.asset else sorted(
            path for directory in ('depth', 'parallax', 'near') for path in (root / directory).glob('*.png'))
        for image in images:
            dest = root / 'print' / image.relative_to(root).with_suffix('.webp')
            export(image, dest, inks_for(theme))
        print(f'{theme}: {len(images)}')


if __name__ == '__main__':
    main()
