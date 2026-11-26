"""Paint the four branch cutouts in each of the garden's original foliage atlases."""
from math import cos, pi, sin
from pathlib import Path
from random import Random

from PIL import Image, ImageDraw


SIZE = 448
SS = 2
OUT = Path(__file__).resolve().parents[1] / 'MindGarden' / 'static' / 'garden' / 'botany'


def mix(a, b, t):
    t = max(0, min(1, t))
    return tuple(round(x * (1 - t) + y * t) for x, y in zip(a, b))


def draw_spray(flowering, seed):
    rng = Random(seed)
    im = Image.new('RGBA', (SIZE * SS, SIZE * SS))
    d = ImageDraw.Draw(im)

    def polygon(vertices, color):
        d.polygon([(round(x * SS), round(y * SS)) for x, y in vertices], fill=color)

    def stroke(points, width, color):
        d.line([(round(x * SS), round(y * SS)) for x, y in points],
               fill=color, width=max(1, round(width * SS)), joint='curve')

    dark = (129, 75, 99) if flowering else (42, 72, 73)
    half = (218, 147, 171) if flowering else (89, 127, 91)
    pale = (255, 224, 231) if flowering else (178, 193, 114)
    base = (219 + rng.uniform(-15, 15), 389)
    sprays = []
    for i in range(9):
        angle = -2.52 + i / 8 * 1.94 + rng.uniform(-.15, .15)
        spread = sin(i / 8 * pi)
        length = rng.uniform(145, 185) + 92 * spread
        start = (base[0] + rng.uniform(-22, 22), base[1] - rng.uniform(4, 32))
        tip = (start[0] + cos(angle) * length, start[1] + sin(angle) * length)
        mid = (start[0] * .56 + tip[0] * .44 + rng.uniform(-13, 13),
               start[1] * .56 + tip[1] * .44 + rng.uniform(-7, 14))
        stroke([base, start, mid, tip], rng.uniform(1.4, 2.6), mix(dark, half, .20))
        for j in range(4, 13):
            t = j / 13 + rng.uniform(-.025, .025)
            fork = (start[0] * (1 - t) + tip[0] * t, start[1] * (1 - t) + tip[1] * t)
            side = j % 2 * 2 - 1
            shoot = angle + side * rng.uniform(.52, 1.20)
            ahead = rng.uniform(25, 61) * (1 - t * .25)
            centre = (fork[0] + cos(shoot) * ahead, fork[1] + sin(shoot) * ahead)
            stroke([fork, centre], rng.uniform(.7, 1.3), mix(dark, half, .35))
            sprays.append((centre, shoot, rng.uniform(12, 24), rng.uniform(-.20, .24)))

    def flower(x, y, r, turn, color, light):
        squash = rng.uniform(.58, .95)
        petals = 5
        contour = []
        for k in range(petals):
            for step, size in [(0, .44), (.23, .98), (.46, .82), (.62, 1.04), (.89, .68)]:
                a = turn + (k + step) * 2 * pi / petals
                contour.append((x + cos(a) * r * size, y + sin(a) * r * size * squash))
        polygon(contour, color)
        if r > 3.4 and rng.random() < .57:
            a = turn + (rng.randrange(5) + .47) * 2 * pi / 5
            stroke([(x, y), (x + cos(a) * .69 * r, y + sin(a) * .69 * r * squash)],
                   .7, mix(color, light, .56))
            d.point((round(x * SS), round(y * SS)), fill=mix(dark, (189, 131, 102), .44))

    def blade(x, y, r, turn, color, light):
        dx, dy = cos(turn) * r, sin(turn) * r
        w = rng.uniform(.22, .38)
        polygon([(x - dx, y - dy), (x - dx * .25 - w * dy, y - dy * .25 + w * dx),
                 (x + dx * .44 - w * dy * .74, y + dy * .44 + w * dx * .74),
                 (x + dx, y + dy), (x + dx * .13 + w * dy, y + dy * .13 - w * dx)],
                color)
        if rng.random() < .24:
            stroke([(x - dx * .5, y - dy * .5), (x + dx * .75, y + dy * .75)], .6, light)

    # Overpaint from the lower, cooler pendant sprays towards the sunny upper boughs.
    sprays.sort(key=lambda s: -s[0][1] + 20 * sin(s[0][0] / 32))
    for (x, y), tangent, reach, value in sprays:
        shade = .47 + .58 * (230 - y) / 220 + value + .11 * sin(x * .038 + seed)
        local = mix(dark, half, .42 + shade * .48)
        for k in range(45 if flowering else 39):
            a = rng.uniform(0, 2 * pi)
            radius = reach * rng.random() ** .59
            xx = x + cos(a) * radius * 1.17
            yy = y + sin(a) * radius * .76
            sample = shade + rng.uniform(-.30, .35) - (yy - y) / reach * .24
            color = mix(local, pale, .16 + .81 * sample)
            if k < 7 and rng.random() < .25:
                color = mix(local, dark, .15)
            radius = rng.uniform(2.5, 6.4) if flowering else rng.uniform(5, 11)
            if flowering:
                flower(xx, yy, radius, a, color, pale)
            else:
                blade(xx, yy, radius, tangent + rng.uniform(-1.5, 1.4), color, pale)

    return im.resize((SIZE, SIZE), Image.Resampling.LANCZOS)


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    for flowering, name in [(True, 'sakura'), (False, 'zelkova')]:
        atlas = Image.new('RGBA', (2 * SIZE, 2 * SIZE))
        for i in range(4):
            tile = draw_spray(flowering, 9207 + i * 73 + int(flowering) * 4)
            atlas.paste(tile, (i % 2 * SIZE, i // 2 * SIZE))
        atlas.save(OUT / (name + '.webp'), lossless=True, method=6)
    paint_bark().save(OUT / 'cherry-bark.webp', lossless=True, method=6)


def paint_bark():
    import numpy as np
    size = 768
    rng = Random(27912)
    yy, xx = np.mgrid[0:size, 0:size] * (2 * pi / size)
    ribbon = (np.sin(3 * xx + .75 * np.cos(yy) + .3) * .34 +
              np.sin(7 * xx + .9 * np.sin(2 * yy) - 1) * .21 +
              np.cos(12 * xx - .53 * np.cos(yy)) * .14 +
              np.sin(2 * yy + 1.9 * np.sin(xx)) * .14)
    grain = np.random.default_rng(63).normal(0, 1.7, (size, size))
    base = np.array([126., 97., 99.])
    pixels = (base + ribbon[:, :, None] * np.array([27, 21, 22]) +
              grain[:, :, None]).clip(0, 255).astype('uint8')
    im = Image.fromarray(pixels, 'RGB')
    d = ImageDraw.Draw(im)

    def wrapped(points, fill):
        for sx in (-size, 0, size):
            for sy in (-size, 0, size):
                d.polygon([(x + sx, y + sy) for x, y in points], fill=fill)

    # The fine, horizontal lenticels are the identifying mark on cherry bark.
    # Long narrow marks alternate with small pale cork pores and broken seams.
    for i in range(1750):
        x, y = rng.randrange(size), rng.randrange(size)
        r = rng.uniform(1.3, 6) if i < 1550 else rng.uniform(7, 20)
        h = rng.uniform(.5, 1.6)
        col = tuple(pixels[y, x])
        tint = mix(col, (66, 51, 59), rng.uniform(.32, .78))
        angle = rng.uniform(-.12, .12) + .07 * cos(x * pi * 2 / size)
        off = r * angle
        wrapped([(x-r, y+off), (x-r*.33, y-.32*h), (x+r*.37, y-h),
                 (x+r, y-off), (x+r*.28, y+h*.68), (x-r*.55, y+h)], tint)
        if r>3 and rng.random()<.62:
            wrapped([(x-r*.76,y+off+h),(x-r*.2,y+h*.8),(x+r*.62,y+h-off),
                     (x+r*.15,y+1.8*h)],mix(col,(203,171,153),rng.uniform(.26,.65)))
    for i in range(36):
        x,y=rng.randrange(size),rng.randrange(size)
        h=rng.uniform(9,49);wave=rng.uniform(1.1,3.7)
        seg=[(x+wave*sin(j*.7+i),y+j*h/5) for j in range(6)]
        wrapped(seg+[(a+rng.uniform(.5,1.7),b) for a,b in reversed(seg)],(107,81,86))
    return im


if __name__ == '__main__':
    main()
