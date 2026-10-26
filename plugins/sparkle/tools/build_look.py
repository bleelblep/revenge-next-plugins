"""Rebuild the unicorn's look-behind turn from the original idle artwork.

Run python tools/build_look.py --preview, then python tools/build_sprites.py.
Compose flat front, profile and rear drawings with per-pose pixel offsets. The
fringe narrows in stepped drawings as the rear hair comes round the side.
The mane uses the original pink pixels, without an added black outline.
All frames keep the idle cell, rainbow anchor and native pixel grid.
"""
import argparse
from collections import deque
from pathlib import Path

from PIL import Image, ImageDraw

HERE = Path(__file__).resolve().parent.parent
CELL = (118, 145)
FPS = 16
NEAREST = Image.Resampling.NEAREST


def character(image):
    """Separate the connected character from the floating decorative sparkles."""
    opaque = {(x, y) for y in range(image.height) for x in range(image.width)
              if image.getpixel((x, y))[3] > 0}
    components = []
    while opaque:
        first = opaque.pop()
        component = {first}
        queue = deque([first])
        while queue:
            x, y = queue.popleft()
            for point in ((x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1)):
                if point in opaque:
                    opaque.remove(point)
                    component.add(point)
                    queue.append(point)
        components.append(component)
    result = Image.new('RGBA', image.size)
    for point in max(components, key=len):
        result.putpixel(point, image.getpixel(point))
    return result


def rear_head(front, idle):
    head = front.copy()
    face = idle.getpixel((45, 44))
    # Reuse the rounded, fluffy crown's texture for the hair down the back.
    # Only pink pixels are sampled: neither black outline nor pale face patches
    # from the old hand-drawn rear polygon can enter the mane.
    hair_rows = []
    for y in range(18, 34):
        row = [idle.getpixel((x, y)) for x in range(33, 65)]
        row = [p for p in row if p[3] and p[0] > 180 and p[2] > 140
               and p[0] > p[1] * 1.15 and p[2] > p[1] * 1.1]
        if row:
            hair_rows.append(row)
    assert hair_rows
    for y in range(15, head.height):
        for x in range(head.width):
            if head.getpixel((x, y))[3]:
                head.putpixel((x, y), face)
    # A broad crown tapers into soft tufts down the neck, not a straight stripe.
    for y in range(17, head.height):
        half = 21 if y < 35 else round(21 - (y - 35) * 0.42)
        half += (0, 0, 1, 1, 0, -1)[(y // 2) % 6]
        centre = 29 + (0 if y < 38 else (1, 1, 0, -1, -1, 0)[(y // 4) % 6])
        row = hair_rows[min(len(hair_rows) - 1, (y - 17) * len(hair_rows) // 46)]
        for x in range(centre - half, centre + half + 1):
            if 0 <= x < head.width and head.getpixel((x, y))[3]:
                tx = min(len(row) - 1, (x - centre + half) * len(row) // (half * 2 + 1))
                head.putpixel((x, y), row[tx])
    return head


def flat_head(source, width, fringe_width, fringe_dx, horn_dx):
    """Three flat cutouts, positioned on integer pixels for each drawn pose.

    The face, crown and horn have independent drawings/widths. No curved-surface
    mapping, perspective, lighting, or depth calculations are used.
    """
    out = Image.new('RGBA', source.size)
    face = source.crop((0, 35, source.width, source.height))
    out.paste(face.resize((width, face.height), NEAREST), ((58 - width) // 2, 35))
    crown = source.crop((0, 15, source.width, 35))
    out.paste(crown.resize((fringe_width, crown.height), NEAREST),
              ((58 - fringe_width) // 2 + fringe_dx, 15))
    horn = source.crop((0, 0, source.width, 15))
    out.paste(horn, (horn_dx, 0))
    return out


def build():
    idle = Image.open(HERE / 'sprites/idle/idle_01.png').convert('RGBA')
    clean = character(idle)
    base = Image.new('RGBA', CELL)
    base.paste(idle, (14, 24))
    background = base.copy()
    # Keep the surrounding stars and the rainbow in place while the pet pivots.
    for y in range(89):
        for x in range(idle.width):
            if clean.getpixel((x, y))[3]:
                background.putpixel((x + 14, y + 24), (0, 0, 0, 0))
    front = clean.crop((20, 0, 78, 63))
    body = clean.crop((20, 63, 79, 89))
    rear = rear_head(front, idle)
    walk = character(Image.open(HERE / 'sprites/walk_hover/walk_hover_01.png').convert('RGBA'))
    profile = walk.crop((14, 4, 75, 61)).resize((58, 63), NEAREST)
    # Use the original horn for consistent height between the drawn viewpoints.
    profile.paste(front.crop((0, 0, 58, 15)), (0, 0))
    # source, face width, fringe width, fringe offset, horn offset, shoulder width.
    # Hand-set 2D key poses: the fringe contracts before the profile drawing,
    # then the rear crown expands. Shoulders follow a couple of frames later.
    specs = [
        (front, 58, 57, 0, 0, 59), (front, 57, 55, 1, 1, 59),
        (front, 55, 52, 2, 2, 58), (front, 52, 49, 3, 3, 56),
        (profile, 50, 46, 3, 4, 53), (profile, 47, 43, 3, 5, 50),
        (profile, 44, 40, 2, 5, 47), (profile, 44, 42, 0, 4, 45),
        (rear, 46, 44, -2, 3, 46), (rear, 48, 47, -2, 2, 48),
        (rear, 51, 50, -1, 1, 51), (rear, 54, 53, -1, 0, 54),
        (rear, 56, 56, 0, 0, 57), (rear, 58, 58, 0, 0, 59),
    ]
    poses = [base]
    for source, width, fringe_width, fringe_dx, horn_dx, body_width in specs:
        frame = background.copy()
        torso = body.resize((body_width, body.height), NEAREST)
        frame.alpha_composite(torso, (34 + (body.width - body_width) // 2, 87))
        turned = flat_head(source, width, fringe_width, fringe_dx, horn_dx)
        frame.alpha_composite(turned, (34, 24))
        poses.append(frame)
    order = list(range(len(poses))) + [len(poses) - 1] * 5 + list(range(len(poses) - 2, -1, -1))
    frames = [poses[index].copy() for index in order]
    assert frames[0].tobytes() == frames[-1].tobytes() == base.tobytes()
    assert len({frame.tobytes() for frame in frames}) >= 13
    for frame in frames:
        assert frame.size == CELL
        assert frame.crop((0, 113, 118, 145)).tobytes() == base.crop((0, 113, 118, 145)).tobytes()
        assert frame.getbbox()[1] == base.getbbox()[1]
    for index, frame in enumerate(frames, 1):
        frame.save(HERE / f'sprites/look/look_{index:02}.png', optimize=True)
    print(f'Wrote {len(frames)} look frames, {len(poses)} poses, {len(frames) / FPS:.2f}s at {FPS} fps')
    return base, frames


def preview(base, frames):
    pairs = []
    sheet = Image.new('RGB', (118 * 5, 165 * ((len(frames) + 5) // 5)), '#302b3e')
    for index, frame in enumerate([base] + frames):
        x, y = (index % 5) * 118, (index // 5) * 165
        ImageDraw.Draw(sheet).text((x + 5, y + 4), 'Original idle' if index == 0 else f'Turn {index:02}', fill='white')
        sheet.paste(frame, (x, y + 20), frame)
    sheet.resize((sheet.width * 2, sheet.height * 2), NEAREST).save(HERE / 'art/look_preview.png')
    for frame in frames:
        pair = Image.new('RGB', (236, 165), '#302b3e')
        draw = ImageDraw.Draw(pair)
        draw.text((6, 4), 'Original idle', fill='white')
        draw.text((124, 4), 'Look behind', fill='white')
        pair.paste(base, (0, 20), base)
        pair.paste(frame, (118, 20), frame)
        pairs.append(pair.resize((708, 495), NEAREST))
    pairs[0].save(HERE / 'art/look_preview.gif', save_all=True, append_images=pairs[1:],
                  duration=1000 // FPS, loop=0, disposal=2)
    print('Wrote art/look_preview.png and art/look_preview.gif')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--preview', action='store_true')
    args = parser.parse_args()
    base, frames = build()
    if args.preview:
        preview(base, frames)
