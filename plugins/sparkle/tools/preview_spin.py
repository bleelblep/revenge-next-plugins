"""Standalone Sparkle 2D tumble concept; writes previews, not plugin sprites.

Run python tools/preview_spin.py from the plugin folder.
The original unicorn is drawn on a flat canvas, with tucked hooves and a
lagging rainbow. All rotations are in the image plane, with nearest pixels.
"""
from pathlib import Path

from PIL import Image, ImageDraw

from build_look import character

HERE = Path(__file__).resolve().parent.parent
SIZE = (160, 160)
CENTRE = (80, 76)
NEAREST = Image.Resampling.NEAREST
# Clockwise tumble: anticipation, a full revolution, overshoot, settle.
# angle, hoof tuck (0..3), rainbow bend, duration in milliseconds
POSES = [
    (0, 0, 0, 350), (-4, 0, 0, 90), (-8, 1, -1, 90), (-8, 2, -2, 90),
    (0, 3, -2, 70), (20, 3, -3, 70), (45, 3, -4, 70), (75, 3, -5, 70),
    (105, 3, -5, 70), (135, 3, -5, 70), (165, 3, -5, 70), (195, 3, -5, 70),
    (225, 3, -5, 70), (255, 3, -5, 70), (285, 3, -5, 70), (310, 3, -4, 70),
    (335, 3, -4, 70), (355, 2, -3, 80), (368, 2, -2, 90), (372, 1, -1, 90),
    (366, 0, 1, 100), (358, 0, 2, 110), (356, 0, 1, 110), (360, 0, 0, 400),
]


# Full limb cutouts, including the raised front hoof tips and hind hoof edges.
# The inner edges meet the torso; translations overlap that join when tucked.
LIMBS = (
    ((19, 59, 36, 73), 3, 1),
    ((63, 61, 79, 73), -3, 1),
    ((24, 78, 38, 90), 3, -1),
    ((64, 78, 76, 90), -3, -1),
)


def clear_limbs(image):
    image = image.copy()
    draw = ImageDraw.Draw(image)
    for (left, top, right, bottom), _, _ in LIMBS:
        draw.rectangle((left, top, right - 1, bottom - 1), fill=(0, 0, 0, 0))
    return image


def spin_face(source):
    """Closed smile and inward-looking pupils, using the original face colours."""
    face = source.copy()
    # Remove the open mouth with adjacent coat pixels, then draw a closed smile.
    for y in range(48, 59):
        for x in range(39, 61):
            face.putpixel((x, y), source.getpixel((33 + x % 3, y)))
    draw = ImageDraw.Draw(face)
    lip = source.getpixel((43, 30))
    draw.line([(44, 52), (46, 54), (53, 54), (55, 52)], fill=lip, width=2)
    # Both pupils point inward (cross-eyed, not X-shaped eyes).
    for left in (35, 56):
        for y in range(38, 44):
            for x in range(left, left + 7):
                face.putpixel((x, y), source.getpixel((45 + x % 3, 44)))
    draw.rectangle((39, 39, 41, 43), fill=(0, 0, 0, 255))
    draw.rectangle((56, 39, 58, 43), fill=(0, 0, 0, 255))
    draw.point((40, 39), fill=(255, 255, 255, 255))
    draw.point((57, 39), fill=(255, 255, 255, 255))
    return face


def tucked_body(source, amount):
    body = source.crop((0, 0, source.width, 89))
    if not amount:
        return body
    body = clear_limbs(body)
    for box, dx, dy in LIMBS:
        limb = source.crop(box)
        body.alpha_composite(limb, (box[0] + dx * amount, box[1] + dy * amount))
    return body


def build():
    original = Image.open(HERE / 'sprites/idle/idle_01.png').convert('RGBA')
    source = character(original)
    dizzy_source = spin_face(source)
    rainbow_source = clear_limbs(source)
    # No hoof pixels may leak into the moving rainbow underlay.
    for box, _, _ in LIMBS:
        assert rainbow_source.crop(box).getbbox() is None
    frames = []
    for angle, tuck, bend, _ in POSES:
        drawing = Image.new('RGBA', SIZE)
        # Root stays attached to the body, while the end drags behind the spin.
        for y in range(85, source.height):
            offset = int(bend * (y - 85) / (source.height - 86))
            row = rainbow_source.crop((0, y, source.width, y + 1))
            drawing.paste(row, (31 + offset, 15 + y))
        expression = dizzy_source if angle not in (0, 360) or tuck else source
        drawing.alpha_composite(tucked_body(expression, tuck), (31, 15))
        if tuck:
            # Vacated outer hoof tips must be transparent before rotation.
            for box in ((19, 59, 22, 63), (76, 61, 79, 65),
                        (24, 85, 27, 89), (73, 85, 76, 89)):
                moved = tuple(value + (31 if i % 2 == 0 else 15) for i, value in enumerate(box))
                assert drawing.crop(moved).getbbox() is None, ('hoof remnants', tuck, box)
        frame = drawing.rotate(-angle, resample=NEAREST, center=CENTRE)
        bounds = frame.getbbox()
        assert bounds and bounds[0] > 1 and bounds[1] > 1
        assert bounds[2] < SIZE[0] - 1 and bounds[3] < SIZE[1] - 1
        frames.append(frame)
    assert frames[0].tobytes() == frames[-1].tobytes()
    assert len({f.tobytes() for f in frames}) >= 20
    return frames


def preview(frames):
    scenes = []
    for frame in frames:
        scene = Image.new('RGB', SIZE, '#302b3e')
        scene.paste(frame, (0, 0), frame)
        scenes.append(scene)
    atlas = Image.new('RGB', (SIZE[0] * len(scenes), SIZE[1]))
    for i, scene in enumerate(scenes):
        atlas.paste(scene, (i * SIZE[0], 0))
    palette = atlas.quantize(colors=255)
    gif = [scene.quantize(palette=palette, dither=Image.Dither.NONE).resize((480, 480), NEAREST)
           for scene in scenes]
    gif[0].save(HERE / 'art/spin_preview.gif', save_all=True, append_images=gif[1:],
                duration=[pose[3] for pose in POSES], loop=0, disposal=2, optimize=False)
    samples = (0, 3, 6, 9, 12, 15, 19, 23)
    labels = ('Idle', 'Tuck / wind-up', 'Start tumble', 'Upside down',
              'Coming round', 'Uncurl', 'Wobble', 'Settle')
    sheet = Image.new('RGB', (160 * 4, 180 * 2), '#302b3e')
    for i, (index, label) in enumerate(zip(samples, labels)):
        x, y = (i % 4) * 160, (i // 4) * 180
        sheet.paste(scenes[index], (x, y + 20))
        ImageDraw.Draw(sheet).text((x + 6, y + 4), label, fill='white')
    sheet.resize((1280, 720), NEAREST).save(HERE / 'art/spin_preview.png')
    saved = Image.open(HERE / 'art/spin_preview.gif')
    assert saved.is_animated
    duration = sum(saved.seek(i) or saved.info['duration'] for i in range(saved.n_frames))
    assert duration == sum(p[3] for p in POSES)
    print(f'PASS: {len(frames)} frames, {duration}ms, complete flat 2D tumble, no clipping, seamless endpoints.')
    print('Preview only: art/spin_preview.gif and art/spin_preview.png')


if __name__ == '__main__':
    preview(build())
