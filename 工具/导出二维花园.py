"""使用本地原稿重建网页插画。运行网站只需已经导出的 WebP 图片。"""
import argparse
from io import BytesIO
from pathlib import Path
from zipfile import ZipFile

import numpy as np
from PIL import Image, ImageDraw, ImageFilter


ROOT = Path(__file__).resolve().parents[1]
STATIC = ROOT / "MindGarden/static"
SOURCE = STATIC / "garden/themes"
DEST = STATIC / "garden/illustrated"
MASTER = (3584, 2016)
SIZE = (1920, 1080)
RESAMPLE = Image.Resampling.LANCZOS
LAYERS = dict(sky="parallax/layer-1-sky", gallery="depth/far-gallery", journal="depth/mid-sakura",
              ground="parallax/layer-4-ground", candy="depth/near-candy", fountain="depth/near-fountain")
PACKAGE = "归档/上传旧快照/网页上传用/MindGarden/static/"


def save(image, path):
    image.save(path, quality=91, method=4)


def read_old(archive, name):
    with archive.open(name) as file:
        return Image.open(BytesIO(file.read())).convert("RGBA")


def cottage(archive, theme):
    if theme != "cute":
        return read_old(archive, PACKAGE + f"garden/themes/{theme}/depth/near-candy.png")
    original = read_old(archive, "归档/开发工作稿/工作稿/素材/cute对齐前备份/near-candy.png")
    def bounds(image):
        return image.getchannel("A").point(lambda a: 255 if a > 10 else 0).getbbox()
    left, top, right, bottom = bounds(cottage(archive, "fresh"))
    stamp = original.crop(bounds(original))
    stamp.thumbnail((right-left, bottom-top), RESAMPLE)
    sheet = Image.new("RGBA", MASTER)
    sheet.alpha_composite(stamp, ((left+right-stamp.width)//2, bottom-stamp.height))
    return sheet


def moonlight(image, sky=False):
    rgb = np.asarray(image.convert("RGB"), dtype=np.float32)
    value = rgb @ np.array([.30, .58, .12], dtype=np.float32)
    keys = [0, 56, 125, 194, 255]
    palette = [[29,29,48],[50,49,73],[91,88,116],[154,148,170],[223,213,218]]
    if sky:
        palette = [[29,35,63],[33,42,76],[44,62,99],[69,86,126],[104,118,158]]
    tones = np.stack([np.interp(value, keys, channel) for channel in zip(*palette)], axis=2)
    color = np.clip(tones + (rgb-value[:,:,None])*(.09 if sky else .48), 0, 255).astype("uint8")
    result = Image.fromarray(color).convert("RGBA")
    result.putalpha(image.getchannel("A"))
    return result


def sky_and_orb(image, theme):
    w, h = SIZE
    cx, cy, r = {"cute": (2728,363,99), "fresh": (3086,496,57), "ugly": (2870,478,140)}[theme]
    x, y, radius = [round(n * w / MASTER[0]) for n in (cx,cy,r)]
    sprite = Image.new("RGBA", SIZE)
    if theme == "ugly":
        # Use the cloud-bearing side of the original paper sky, away from its printed sun.
        sky = moonlight(image.crop((0,0,round(w*.67),h)).resize(SIZE,RESAMPLE), sky=True)
        rng = np.random.default_rng(391)
        stars = ImageDraw.Draw(sky)
        for _ in range(102):
            sx, sy = int(rng.integers(w)), int(rng.integers(round(h*.58)))
            length = int(rng.choice([1,1,1,2,3]))
            stars.ellipse((sx-length,sy-length,sx+length,sy+length), fill="#d1cbd2")
            if length == 3:
                stars.line((sx,sy-6,sx,sy+6),fill="#e8d9c3",width=1)
        moon = Image.open(STATIC/"garden/lobby/moon.webp").convert("RGBA").resize((radius*2,radius*2),RESAMPLE)
        sprite.alpha_composite(moon,(x-radius,y-radius))
        return sky,sprite
    # Separate the printed sun from its paper. A feathered piece of adjacent
    # sky sits under it, so dragging the light never reveals a second sun.
    extent = int(radius * (1.82 if theme == "cute" else 2.5))
    region = (x-extent,y-extent,x+extent,y+extent)
    patch = image.crop((x-3*extent,y-extent,x-extent,y+extent))
    mask = Image.new("L",patch.size)
    padding = max(3,int(extent*.15))
    ImageDraw.Draw(mask).ellipse((padding,padding,2*extent-padding,2*extent-padding),fill=255)
    mask = mask.filter(ImageFilter.GaussianBlur(padding/2))
    sky = image.copy()
    sky.paste(patch,region,mask)
    sun = image.crop(region)
    sun.putalpha(mask)
    sprite.alpha_composite(sun,region[:2])
    return sky,sprite


def export(archive, theme):
    folder = DEST/theme
    folder.mkdir(parents=True, exist_ok=True)
    picture = Image.new("RGBA", SIZE)
    # Only the morning cottage lacks a surviving separate door painting. Crop
    # the native masters before web resizing so that its close-up keeps the ink.
    door_crop = tuple(round(n * MASTER[0] / SIZE[0]) for n in (143, 428, 938, 958))
    morning_door = Image.new("RGBA", (1440, 960)) if theme == "cute" else None
    for key, asset in LAYERS.items():
        source = cottage(archive,theme) if key == "candy" else Image.open(SOURCE/theme/(asset+".png")).convert("RGBA")
        if morning_door is not None:
            morning_door.alpha_composite(source.crop(door_crop).resize(morning_door.size, RESAMPLE))
        layer = source.resize(SIZE,RESAMPLE)
        if key == "sky":
            layer, orb = sky_and_orb(layer,theme)
            save(layer.convert("RGB"),folder/"sky.webp")
            save(orb,folder/"orb.webp")
            picture.alpha_composite(layer)
            picture.alpha_composite(orb)
        else:
            if theme == "ugly":
                layer = moonlight(layer)
            save(layer,folder/(key+".webp"))
            picture.alpha_composite(layer)
    save(picture.convert("RGB"),folder/"entrance.webp")
    for key in ("candy","journal","gallery","fountain"):
        if key == "candy" and morning_door is not None:
            detail = morning_door
        elif key == "candy":
            detail = read_old(archive,PACKAGE+f"garden/themes/{theme}/near/candy_main.png")
        else:
            detail = Image.open(SOURCE/theme/"near"/(key+"_main.png")).convert("RGBA")
        if theme == "ugly":
            detail = moonlight(detail)
        detail.thumbnail((1440,960),RESAMPLE)
        save(detail.convert("RGB"),folder/(key+"-detail.webp"))
    # These same original interiors appear after entering the four landmarks.
    for key, name in [("desk","desk_bg"),("hall","fountain_hall"),("wall","gallery_wall")]:
        interior = Image.open(SOURCE/theme/"near"/(name+".png")).convert("RGBA")
        interior.thumbnail((1600,1000),RESAMPLE)
        save((moonlight(interior) if theme == "ugly" else interior).convert("RGB"),folder/(key+".webp"))
    room_name = "candy/room.png" if theme == "cute" else f"candy/themes/{theme}/room.png"
    room = read_old(archive,PACKAGE+room_name)
    room.thumbnail((1536,1024),RESAMPLE)
    save((moonlight(room) if theme == "ugly" else room).convert("RGB"),folder/"room.webp")


if __name__ == "__main__":
    cli = argparse.ArgumentParser(description=__doc__)
    cli.add_argument("--archive", type=Path, default=ROOT / "数据备份/旧版项目资料.zip",
                     help="项目历史原稿 ZIP 的本地路径")
    archive_path = cli.parse_args().archive
    if not archive_path.is_file():
        cli.exit(1, "未找到历史原稿 ZIP。运行网页可直接使用 static/garden/illustrated/ "
                    "中的成图。要复原历史小屋，请用 --archive 指定已有原稿包；"
                    "使用自己的插画请参阅 文档/素材来源/二维花园.md。\n")
    with ZipFile(archive_path) as archive:
        for style in ["cute","fresh","ugly"]:
            export(archive,style)
