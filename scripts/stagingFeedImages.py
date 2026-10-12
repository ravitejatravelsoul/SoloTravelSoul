"""Generates the staging demo-feed photos locally (no third-party images).

    python scripts/stagingFeedImages.py <spec.json> <out_dir>

spec.json: {"images": [{"name", "scene", "label", "seed"}], "avatars": [{"name", "initials", "seed"}]}
Every photo carries a small "DEMO" label. Output is deterministic for a given seed.
"""
import json
import math
import os
import random
import sys

from PIL import Image, ImageDraw, ImageFilter, ImageFont

W, H = 1080, 1350


def font(size):
    for f in ('C:/Windows/Fonts/segoeuib.ttf', 'C:/Windows/Fonts/arialbd.ttf', 'C:/Windows/Fonts/arial.ttf'):
        if os.path.exists(f):
            return ImageFont.truetype(f, size)
    return ImageFont.load_default()


def lerp(a, b, t):
    return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3))


def gradient(top, bottom, h=H, w=W):
    img = Image.new('RGB', (w, h))
    d = ImageDraw.Draw(img)
    for y in range(h):
        d.line([(0, y), (w, y)], fill=lerp(top, bottom, y / (h - 1)))
    return img


SKIES = {
    'dawn': ((255, 183, 140), (255, 236, 205)),
    'day': ((92, 160, 230), (196, 226, 250)),
    'dusk': ((60, 48, 110), (250, 150, 110)),
    'golden': ((250, 170, 90), (255, 225, 160)),
    'night': ((8, 14, 40), (30, 40, 80)),
    'mist': ((190, 200, 205), (230, 235, 235)),
}


def ridge(d, r, base, amp, color, rough=6, step=12):
    pts = [(0, H)]
    y = base
    for x in range(0, W + step, step):
        y += r.uniform(-rough, rough)
        y = min(max(y, base - amp), base + amp)
        pts.append((x, y - amp * 0.5 * math.sin(x / W * math.pi * r.uniform(0.8, 1.6))))
    pts.append((W, H))
    d.polygon(pts, fill=color)


def peaks(d, r, base, color, n=4, height=420):
    pts = [(0, H), (0, base)]
    xs = sorted(r.uniform(0, W) for _ in range(n))
    for x in xs:
        h = r.uniform(height * 0.6, height)
        pts += [(x - r.uniform(120, 260), base), (x, base - h), (x + r.uniform(120, 260), base)]
    pts += [(W, base), (W, H)]
    d.polygon(pts, fill=color)


def sun(img, r, x, y, rad, color):
    glow = Image.new('L', img.size, 0)
    ImageDraw.Draw(glow).ellipse([x - rad * 3, y - rad * 3, x + rad * 3, y + rad * 3], fill=140)
    glow = glow.filter(ImageFilter.GaussianBlur(rad))
    img = Image.composite(Image.new('RGB', img.size, color), img, glow)
    ImageDraw.Draw(img).ellipse([x - rad, y - rad, x + rad, y + rad], fill=color)
    return img


def water(img, top, color_a, color_b, r):
    d = ImageDraw.Draw(img)
    for y in range(top, H):
        t = (y - top) / max(1, H - top)
        d.line([(0, y), (W, y)], fill=lerp(color_a, color_b, t))
    for _ in range(140):
        y = r.randint(top + 4, H - 4)
        x = r.randint(0, W)
        ln = r.randint(20, 120)
        d.line([(x, y), (x + ln, y)], fill=lerp(color_a, (255, 255, 255), 0.35), width=2)


def scene_city(r):
    img = gradient(*SKIES[r.choice(['dusk', 'golden'])])
    img = sun(img, r, r.randint(200, 880), 520, 70, (255, 214, 150))
    d = ImageDraw.Draw(img)
    x = -20
    while x < W:
        bw = r.randint(60, 150)
        bh = r.randint(220, 620)
        col = lerp((40, 36, 60), (90, 70, 90), r.random())
        d.rectangle([x, H - 260 - bh, x + bw, H], fill=col)
        if r.random() < 0.3:
            d.polygon([(x, H - 260 - bh), (x + bw / 2, H - 320 - bh), (x + bw, H - 260 - bh)], fill=lerp(col, (160, 70, 50), 0.6))
        for wy in range(H - 240 - bh, H - 280, 34):
            for wx in range(x + 10, x + bw - 14, 26):
                if r.random() < 0.45:
                    d.rectangle([wx, wy, wx + 12, wy + 18], fill=(255, 210, 120))
        x += bw + r.randint(4, 18)
    d.rectangle([0, H - 280, W, H], fill=(36, 30, 46))
    return img


def scene_harbor(r):
    img = gradient(*SKIES['dawn'])
    img = sun(img, r, r.randint(300, 800), 600, 60, (255, 230, 190))
    d = ImageDraw.Draw(img)
    ridge(d, r, 700, 40, (150, 110, 120), rough=4)
    water(img, 760, (230, 170, 150), (90, 90, 130), r)
    d = ImageDraw.Draw(img)
    for i in range(5):
        bx = r.randint(60, W - 200)
        by = r.randint(860, 1200)
        d.polygon([(bx, by), (bx + 160, by), (bx + 130, by + 40), (bx + 30, by + 40)], fill=(60, 40, 50))
        d.line([(bx + 80, by), (bx + 80, by - 150)], fill=(60, 40, 50), width=5)
        d.polygon([(bx + 84, by - 145), (bx + 84, by - 10), (bx + 150, by - 20)], fill=(250, 240, 230))
    return img


def scene_street(r):
    wall_colors = [(70, 120, 190), (230, 200, 150), (200, 90, 70), (120, 170, 200), (240, 230, 210)]
    img = gradient(*SKIES['day'])
    d = ImageDraw.Draw(img)
    # perspective street
    d.polygon([(0, 0), (380, 300), (380, H - 420), (0, H)], fill=r.choice(wall_colors))
    d.polygon([(W, 0), (700, 300), (700, H - 420), (W, H)], fill=r.choice(wall_colors))
    d.polygon([(0, H), (380, H - 420), (700, H - 420), (W, H)], fill=(170, 160, 150))
    for i in range(14):
        y = H - 420 + i * 30
        d.line([(380 - i * 27, y), (700 + i * 27, y)], fill=(150, 140, 130), width=2)
    for side in (0, 1):
        for k in range(5):
            t = k / 5
            x0 = 40 + t * 300 if side == 0 else W - 40 - t * 300
            h = 220 * (1 - t * 0.7)
            y0 = 260 + t * 100
            w = 70 * (1 - t * 0.6)
            xa, xb = (x0, x0 + w) if side == 0 else (x0 - w, x0)
            d.rectangle([xa, y0, xb, y0 + h], fill=(40, 50, 70))
            d.rectangle([xa - 6, y0 + h, xb + 6, y0 + h + 12], fill=(220, 220, 220))
            if r.random() < 0.6:
                d.ellipse([xa + 4, y0 + h - 30, xb - 4, y0 + h + 10], fill=r.choice([(220, 60, 90), (240, 170, 40), (80, 160, 80)]))
    return img


def scene_forest(r):
    img = gradient(*SKIES['mist'])
    d = ImageDraw.Draw(img)
    for layer in range(5):
        t = layer / 4
        col = lerp((170, 190, 180), (30, 70, 50), t)
        for _ in range(9 + layer * 3):
            x = r.randint(-50, W + 50)
            h = 500 + layer * 180 + r.randint(-80, 80)
            w = 90 + layer * 40
            base = H - 200 + layer * 30
            d.polygon([(x, base - h), (x - w, base), (x + w, base)], fill=col)
        d.rectangle([0, H - 200 + layer * 30, W, H], fill=lerp(col, (20, 40, 30), 0.4))
    return img.filter(ImageFilter.GaussianBlur(1.2))


def scene_aurora(r):
    img = gradient(*SKIES['night'])
    d = ImageDraw.Draw(img)
    for _ in range(260):
        x, y = r.randint(0, W), r.randint(0, 900)
        s = r.choice([1, 1, 2])
        d.ellipse([x, y, x + s, y + s], fill=(240, 240, 255))
    band = Image.new('RGB', (W, H), (0, 0, 0))
    bd = ImageDraw.Draw(band)
    for k in range(3):
        y0 = 260 + k * 140 + r.randint(-40, 40)
        pts = [(x, y0 + 120 * math.sin(x / r.uniform(160, 260) + k)) for x in range(0, W + 20, 20)]
        for i in range(len(pts) - 1):
            bd.line([pts[i], pts[i + 1]], fill=(60, 255, 150) if k != 1 else (120, 255, 200), width=60)
    band = band.filter(ImageFilter.GaussianBlur(40))
    img = Image.composite(Image.new('RGB', (W, H), (90, 255, 170)), img, band.convert('L').point(lambda v: int(v * 0.7)))
    d = ImageDraw.Draw(img)
    peaks(d, r, H - 260, (12, 16, 30), n=4, height=320)
    d.rectangle([0, H - 260, W, H], fill=(10, 14, 24))
    return img


def scene_beach(r, dark=False):
    img = gradient(*(SKIES['mist'] if dark else SKIES[r.choice(['day', 'golden'])]))
    if not dark:
        img = sun(img, r, r.randint(200, 880), 420, 60, (255, 240, 200))
    water(img, 640, (80, 90, 100) if dark else (60, 150, 200), (40, 60, 80) if dark else (20, 90, 150), r)
    d = ImageDraw.Draw(img)
    sand = (30, 30, 34) if dark else (235, 210, 160)
    pts = [(0, H), (0, 960)]
    for x in range(0, W + 40, 40):
        pts.append((x, 940 + 50 * math.sin(x / 210 + r.random())))
    pts += [(W, H)]
    d.polygon(pts, fill=sand)
    for x in range(0, W, 6):
        y = 940 + 50 * math.sin(x / 210)
        d.line([(x, y - 6), (x + 6, y - 6)], fill=(245, 245, 245), width=4)
    if dark:
        for k in range(3):
            x = 700 + k * 90
            d.polygon([(x, 640), (x + 30, 380 - k * 60), (x + 70, 640)], fill=(20, 20, 24))
    return img


def scene_mountain(r):
    img = gradient(*SKIES[r.choice(['day', 'dawn'])])
    d = ImageDraw.Draw(img)
    peaks(d, r, 900, (110, 120, 150), n=5, height=560)
    peaks(d, r, 1020, (70, 90, 110), n=4, height=380)
    ridge(d, r, 1160, 50, (50, 80, 60))
    return img


def scene_lake(r):
    img = gradient(*SKIES[r.choice(['dawn', 'day'])])
    d = ImageDraw.Draw(img)
    peaks(d, r, 700, (90, 110, 140), n=4, height=420)
    ridge(d, r, 720, 30, (40, 80, 60))
    top = img.crop((0, 0, W, 740)).transpose(Image.FLIP_TOP_BOTTOM)
    refl = Image.blend(top, Image.new('RGB', top.size, (40, 90, 120)), 0.4).crop((0, 0, W, H - 740))
    img.paste(refl, (0, 740))
    d = ImageDraw.Draw(img)
    if r.random() < 0.7:  # lone tree
        x = r.randint(420, 660)
        d.line([(x, 860), (x, 600)], fill=(40, 30, 20), width=10)
        for i in range(30):
            a = r.uniform(-math.pi, 0)
            ln = r.randint(40, 130)
            d.line([(x, 640 + r.randint(0, 120)), (x + ln * math.cos(a), 640 + ln * math.sin(a))], fill=(40, 30, 20), width=4)
    for _ in range(60):
        y = r.randint(760, H)
        x = r.randint(0, W)
        d.line([(x, y), (x + r.randint(30, 90), y)], fill=(200, 220, 230), width=1)
    return img


def scene_temple(r):
    img = gradient(*SKIES['dawn'])
    d = ImageDraw.Draw(img)
    ridge(d, r, 1000, 40, (90, 110, 80))
    cx = r.randint(420, 660)
    for lvl in range(4):
        w = 360 - lvl * 70
        y = 980 - lvl * 150
        d.rectangle([cx - w / 2 + 30, y - 100, cx + w / 2 - 30, y], fill=(140, 40, 30))
        d.polygon([(cx - w / 2 - 50, y - 100), (cx, y - 160), (cx + w / 2 + 50, y - 100)], fill=(50, 40, 40))
    d.line([(cx, 380), (cx, 300)], fill=(50, 40, 40), width=8)
    for _ in range(40):  # maple leaves
        x, y = r.randint(0, W), r.randint(0, 500)
        d.ellipse([x, y, x + 60, y + 40], fill=r.choice([(220, 80, 50), (240, 140, 60), (200, 50, 50)]))
    d.rectangle([0, 1000, W, H], fill=(120, 140, 100))
    d.polygon([(cx - 60, 1000), (cx + 60, 1000), (cx + 260, H), (cx - 260, H)], fill=(200, 190, 170))
    return img


def scene_lanterns(r):
    img = gradient(*SKIES['night'])
    d = ImageDraw.Draw(img)
    d.rectangle([0, 820, W, H], fill=(30, 26, 30))
    for i in range(6):
        x = i * 190 - 20
        d.rectangle([x, 520, x + 170, 820], fill=lerp((200, 160, 60), (150, 90, 40), r.random()))
        d.polygon([(x - 20, 520), (x + 85, 450), (x + 190, 520)], fill=(70, 40, 30))
    glow = Image.new('L', (W, H), 0)
    gd = ImageDraw.Draw(glow)
    lamps = []
    for row in range(3):
        for _ in range(9):
            x, y = r.randint(20, W - 20), 140 + row * 130 + r.randint(-30, 30)
            lamps.append((x, y, r.choice([(240, 80, 60), (250, 170, 60), (240, 210, 90), (220, 60, 120)])))
            gd.ellipse([x - 70, y - 70, x + 70, y + 70], fill=150)
    glow = glow.filter(ImageFilter.GaussianBlur(40))
    img = Image.composite(Image.new('RGB', (W, H), (255, 170, 80)), img, glow)
    d = ImageDraw.Draw(img)
    for x, y, c in lamps:
        d.line([(x, y - 60), (x, 0)], fill=(60, 50, 40), width=2)
        d.ellipse([x - 32, y - 45, x + 32, y + 45], fill=c)
    water(img, 1050, (60, 50, 50), (20, 20, 30), r)
    return img


def scene_terraces(r):
    img = gradient(*SKIES['day'])
    d = ImageDraw.Draw(img)
    peaks(d, r, 700, (100, 110, 130), n=4, height=420)
    for k in range(10):
        y = 640 + k * 75
        col = lerp((120, 160, 80), (70, 120, 50), k / 10)
        pts = [(0, H)] + [(x, y + 25 * math.sin(x / 180 + k)) for x in range(0, W + 30, 30)] + [(W, H)]
        d.polygon(pts, fill=col)
        d.line([(x, y + 25 * math.sin(x / 180 + k)) for x in range(0, W + 30, 30)], fill=(150, 130, 100), width=6)
    return img


def scene_market(r):
    img = gradient((250, 225, 190), (230, 190, 150))
    d = ImageDraw.Draw(img)
    stripes = [(220, 70, 60), (240, 180, 60), (60, 130, 170), (110, 160, 90), (200, 90, 140)]
    for i in range(4):
        x = i * 280 - 20
        c1, c2 = r.sample(stripes, 2)
        for s in range(8):
            d.polygon([(x + s * 36, 240), (x + s * 36 + 36, 240), (x + s * 40 + 40, 420), (x + s * 40, 420)], fill=c1 if s % 2 else c2)
        d.rectangle([x + 10, 420, x + 300, 980], fill=(110, 80, 60))
        for _ in range(40):
            bx, by = r.randint(x + 20, x + 280), r.randint(460, 940)
            d.ellipse([bx, by, bx + 40, by + 40], fill=r.choice(stripes + [(250, 230, 120), (170, 60, 40)]))
    d.rectangle([0, 980, W, H], fill=(190, 150, 110))
    for _ in range(60):
        x = r.randint(0, W)
        y = r.randint(1000, H)
        d.ellipse([x, y, x + 50, y + 18], fill=(170, 130, 90))
    return img


def scene_desert(r):
    img = gradient(*SKIES['golden'])
    img = sun(img, r, r.randint(300, 800), 520, 80, (255, 245, 210))
    d = ImageDraw.Draw(img)
    for k in range(5):
        base = 760 + k * 120
        col = lerp((230, 160, 90), (190, 100, 50), k / 4)
        pts = [(0, H)] + [(x, base - 90 * math.sin(x / r.uniform(150, 260) + k * 1.3)) for x in range(0, W + 20, 20)] + [(W, H)]
        d.polygon(pts, fill=col)
    for i in range(4):  # camel line
        x = 300 + i * 70
        d.ellipse([x, 800, x + 50, 830], fill=(60, 40, 30))
        d.line([(x + 10, 830), (x + 10, 860)], fill=(60, 40, 30), width=4)
        d.line([(x + 40, 830), (x + 40, 860)], fill=(60, 40, 30), width=4)
    return img


def scene_karst(r):
    img = gradient(*SKIES['mist'])
    d = ImageDraw.Draw(img)
    for layer in range(3):
        col = lerp((170, 185, 190), (50, 80, 70), layer / 2)
        for _ in range(4 + layer):
            x = r.randint(-80, W)
            w = r.randint(140, 260)
            h = r.randint(300, 620) - layer * 60
            base = 820 + layer * 40
            d.rounded_rectangle([x, base - h, x + w, base], radius=70, fill=col)
    water(img, 860, (150, 170, 170), (60, 90, 90), r)
    d = ImageDraw.Draw(img)
    d.polygon([(420, 1080), (640, 1080), (610, 1110), (450, 1110)], fill=(200, 80, 40))
    return img


def scene_church(r):
    img = scene_mountain(r)
    d = ImageDraw.Draw(img)
    cx = r.randint(360, 720)
    d.rectangle([cx - 90, 1000, cx + 90, 1120], fill=(120, 100, 80))
    d.rectangle([cx - 30, 900, cx + 30, 1000], fill=(110, 90, 70))
    d.polygon([(cx - 45, 900), (cx, 830), (cx + 45, 900)], fill=(70, 60, 50))
    d.polygon([(cx - 110, 1000), (cx, 950), (cx + 110, 1000)], fill=(80, 65, 55))
    return img


def scene_mountain_sea(r):
    img = gradient(*SKIES['dusk'])
    img = sun(img, r, r.randint(150, 400), 760, 60, (255, 200, 140))
    d = ImageDraw.Draw(img)
    d.polygon([(380, 800), (480, 420), (980, 410), (1080, 520), (1080, 800)], fill=(60, 50, 80))
    water(img, 800, (230, 140, 120), (40, 40, 80), r)
    d = ImageDraw.Draw(img)
    d.polygon([(0, H), (0, 1060), (300, 1120), (600, 1240), (700, H)], fill=(40, 34, 50))
    return img


SCENES = {
    'city': scene_city, 'harbor': scene_harbor, 'street': scene_street, 'forest': scene_forest, 'aurora': scene_aurora,
    'beach': scene_beach, 'beach_dark': lambda r: scene_beach(r, dark=True), 'mountain': scene_mountain, 'lake': scene_lake,
    'temple': scene_temple, 'lanterns': scene_lanterns, 'terraces': scene_terraces, 'market': scene_market,
    'desert': scene_desert, 'karst': scene_karst, 'church': scene_church, 'mountain_sea': scene_mountain_sea,
}


def label(img, text):
    d = ImageDraw.Draw(img, 'RGBA')
    f = font(30)
    tw = d.textlength(text, font=f)
    x, y = 28, H - 76
    d.rounded_rectangle([x, y, x + tw + 36, y + 48], radius=24, fill=(0, 0, 0, 120))
    d.text((x + 18, y + 7), text, font=f, fill=(255, 255, 255, 235))


def avatar(initials, seed, size=512):
    r = random.Random(seed)
    a = (r.randint(40, 200), r.randint(60, 200), r.randint(90, 220))
    b = (r.randint(150, 255), r.randint(100, 220), r.randint(60, 200))
    img = gradient(a, b, h=size, w=size)
    d = ImageDraw.Draw(img)
    f = font(int(size * 0.36))
    tw = d.textlength(initials, font=f)
    d.text(((size - tw) / 2, size * 0.27), initials, font=f, fill=(255, 255, 255))
    f2 = font(int(size * 0.07))
    t2 = 'DEMO'
    d.text(((size - d.textlength(t2, font=f2)) / 2, size * 0.78), t2, font=f2, fill=(255, 255, 255))
    return img


def main():
    spec = json.load(open(sys.argv[1], encoding='utf8'))
    out = sys.argv[2]
    os.makedirs(out, exist_ok=True)
    for it in spec['images']:
        r = random.Random(it['seed'])
        img = SCENES[it['scene']](r)
        label(img, it['label'])
        img.save(os.path.join(out, it['name']), 'JPEG', quality=84, optimize=True)
    for av in spec['avatars']:
        avatar(av['initials'], av['seed']).save(os.path.join(out, av['name']), 'JPEG', quality=88, optimize=True)
    print(f"{len(spec['images'])} photos, {len(spec['avatars'])} avatars")


if __name__ == '__main__':
    main()
