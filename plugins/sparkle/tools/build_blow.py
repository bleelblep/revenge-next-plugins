"""Build the bubble animation from the original unicorn, not the alternate bubble sheet.

Run from the plugin folder: python tools/build_blow.py
Then run tools/build_sprites.py to embed the PNGs in the native plugin.
Pass --preview to also write art/blow_preview.png and art/blow_preview.gif.

The idle drawing is copied at its native resolution and normal bottom-centred anchor.
The original head leans toward the wand in 2D; cheeks expand during inhalation
and the head follows each exhale. The wand, breath and bubbles are sprite overlays.
Release positions come from Sprites.kt so the drawn bubbles meet the live effects.
"""
import argparse
import pathlib
import re

from PIL import Image, ImageDraw
from build_look import character

HERE = pathlib.Path(__file__).resolve().parent.parent
CELL = (118, 145)
FRAMES = 19
INK = (0, 0, 0, 255)
FACE = (254, 235, 247, 255)
PINK = (240, 137, 204, 255)
GOLD = (248, 202, 87, 255)
LIGHT = (255, 244, 183, 255)


def idle_cell():
    source = Image.open(HERE / 'sprites/idle/idle_01.png').convert('RGBA')
    cell = Image.new('RGBA', CELL)
    cell.paste(source, ((CELL[0] - source.width) // 2, CELL[1] - source.height))
    return cell


def wand(draw, lift):
    # The right raised hoof is at (88, 89). Lift the ring up beside the muzzle.
    x, y = 94, 93 - lift
    draw.line([(88, 91), (x, y + 5)], fill=INK, width=4)
    draw.line([(88, 90), (x, y + 5)], fill=GOLD, width=2)
    # Stepped, hollow pixel ring: no smoothing or fractional coordinates.
    outline = [(x - 2, y - 5), (x + 2, y - 5), (x + 5, y - 2),
               (x + 5, y + 2), (x + 2, y + 5), (x - 2, y + 5),
               (x - 5, y + 2), (x - 5, y - 2), (x - 2, y - 5)]
    draw.line(outline, fill=INK, width=3)
    draw.line(outline, fill=GOLD, width=1)
    draw.line([(x - 2, y - 4), (x + 1, y - 4)], fill=LIGHT, width=1)


def blowing_head(source, idle, puff, exhale):
    head = source.copy()
    # Replace the smile with neighbouring coat pixels rather than a flat patch.
    for y in range(48, 59):
        for x in range(19, 41):
            head.putpixel((x, y), idle.getpixel((33 + (x % 3), y)))
    draw = ImageDraw.Draw(head)
    lip = idle.getpixel((43, 30))
    mouth = [(35, 50), (38, 50), (39, 51), (39, 54), (38, 55),
             (35, 55), (34, 54), (34, 51)]
    draw.polygon(mouth, fill=lip)
    draw.rectangle((36, 51, 37, 54 if exhale else 53), fill=PINK)
    # A cheek inflation is a row-wise silhouette change, not a circle painted on
    # the face. The original upper head and hairstyle stay intact.
    if puff:
        for y in range(44, 59):
            occupied = [x for x in range(head.width) if head.getpixel((x, y))[3]]
            left, right = min(occupied), max(occupied) + 1
            amount = puff if 48 <= y <= 55 else max(0, puff - 1)
            row = head.crop((left, y, right, y + 1))
            row = row.resize((row.width + amount * 2, 1), Image.Resampling.NEAREST)
            head.paste(row, (left - amount, y))
    return head


def sparkle(draw, x, y, colour):
    draw.line((x - 3, y, x + 3, y), fill=colour, width=1)
    draw.line((x, y - 3, x, y + 3), fill=colour, width=1)
    draw.point((x, y), fill=LIGHT)


def build():
    kotlin = (HERE / 'src/main/kotlin/com/bleelblep/sparkle/Sprites.kt').read_text(encoding='utf-8')
    releases = [(int(f), float(x), float(y), float(s), int(v)) for f, x, y, s, v in
                re.findall(r'BlowRelease\((\d+), ([\d.]+)f, ([\d.]+)f, ([\d.]+)f, (\d+)\)', kotlin)]
    assert [r[0] for r in releases] == [6, 10, 12], 'Update the growth timing with the releases'
    base = idle_cell()
    idle = Image.open(HERE / 'sprites/idle/idle_01.png').convert('RGBA')
    clean = character(idle)
    front = clean.crop((20, 0, 78, 63))
    background = base.copy()
    for y in range(63):
        for x in range(clean.width):
            if clean.getpixel((x, y))[3]:
                background.putpixel((x + 14, y + 24), (0, 0, 0, 0))
    frames = []
    lifts = [None, 0, 8] + [16] * 11 + [12, 8, 0, None, None]
    # Flat pixel offsets: inhale, lean towards the wand, release, recover.
    head_offsets = [(0, 0), (0, 0), (0, -1), (1, -1), (1, -1),
                    (1, 0), (2, 1), (1, 0), (1, -1), (1, 0),
                    (2, 1), (1, 0), (2, 1), (1, 0), (1, 0),
                    (0, -1), (0, 0), (0, 0), (0, 0)]
    puffs = [0, 0, 0, 1, 2, 2, 0, 0, 1, 2, 0, 2, 0, 0, 0, 0, 0, 0, 0]
    for index, lift in enumerate(lifts):
        exhale = index in (6, 10, 12)
        frame = background.copy()
        head = blowing_head(front, idle, puffs[index], exhale) if 3 <= index <= 12 else front
        dx, dy = head_offsets[index]
        frame.alpha_composite(head, (34 + dx, 24 + dy))
        if index in (0, 17, 18):
            frame = base.copy()
        draw = ImageDraw.Draw(frame)
        if 3 <= index <= 12:
            if index % 2:
                draw.line((79, 77, 84, 77), fill=LIGHT, width=1)
                draw.point((86, 76), fill=LIGHT)
        if lift is not None:
            wand(draw, lift)
        # Last attached frame uses the exact size/centre of the next live bubble.
        # On the release frame that bubble is absent, avoiding double drawing.
        for (release, cx, cy, size, variant), start in zip(releases, (3, 7, 11)):
            if start <= index < release:
                progress = (index - start + 1) / (release - start)
                width = round(size * progress)
                bubble = Image.open(HERE / f'fx/bubble_{variant + 1}.png').convert('RGBA')
                bubble = bubble.resize((width, round(width * bubble.height / bubble.width)),
                                       Image.Resampling.NEAREST)
                # Grow outward from the ring, reaching the release centre exactly.
                x = round(cx - size / 2)
                y = round(cy + size / 2 - bubble.height)
                assert x >= 0 and y >= 0 and x + bubble.width <= CELL[0]
                assert y + bubble.height <= CELL[1]
                frame.alpha_composite(bubble, (x, y))
        if 13 <= index <= 16:
            sparkle(draw, 100, 56 - (index - 13) * 2, GOLD)
            sparkle(draw, 24, 78 + (index % 2) * 3, PINK)
        frames.append(frame)
    assert len(frames) == FRAMES
    assert frames[0].tobytes() == frames[-1].tobytes() == base.tobytes()
    out = HERE / 'sprites/blow'
    for index, frame in enumerate(frames, 1):
        frame.save(out / f'blow_{index:02d}.png', optimize=True)
    print(f'Wrote {len(frames)} matching unicorn frames at {CELL[0]}x{CELL[1]}')
    return base, frames


def preview(base, frames):
    # Show the reference beside every animation frame on a neutral backdrop.
    pairs = []
    for frame in frames:
        pair = Image.new('RGB', (CELL[0] * 2, CELL[1] + 20), '#302b3e')
        draw = ImageDraw.Draw(pair)
        draw.text((8, 4), 'Original idle', fill='white')
        draw.text((CELL[0] + 8, 4), 'Bubble animation', fill='white')
        pair.paste(base, (0, 20), base)
        pair.paste(frame, (CELL[0], 20), frame)
        pairs.append(pair.resize((pair.width * 3, pair.height * 3), Image.Resampling.NEAREST))
    pairs[0].save(HERE / 'art/blow_preview.gif', save_all=True, append_images=pairs[1:],
                  duration=[500] + [125] * 17 + [500], loop=0, disposal=2)
    sheet = Image.new('RGB', (CELL[0] * 5, (CELL[1] + 20) * 4), '#302b3e')
    draw = ImageDraw.Draw(sheet)
    for index, frame in enumerate([base] + frames):
        x, y = (index % 5) * CELL[0], (index // 5) * (CELL[1] + 20)
        draw.text((x + 5, y + 4), 'Original idle' if index == 0 else f'Blow {index:02}', fill='white')
        sheet.paste(frame, (x, y + 20), frame)
    sheet.resize((sheet.width * 2, sheet.height * 2), Image.Resampling.NEAREST).save(
        HERE / 'art/blow_preview.png')
    print('Wrote art/blow_preview.png and art/blow_preview.gif')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--preview', action='store_true')
    args = parser.parse_args()
    base, frames = build()
    if args.preview:
        preview(base, frames)
