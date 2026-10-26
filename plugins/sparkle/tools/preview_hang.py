"""Standalone flat-2D upside-down unicorn concept. Does NOT build plugin assets.

Run from the plugin folder: python tools/preview_hang.py
Writes art/hang_preview.gif and art/hang_preview.png for review only.
The drawing faces upside down already; no runtime rotation or 3D projection.
"""
from pathlib import Path

from PIL import Image, ImageDraw

from build_look import character

HERE = Path(__file__).resolve().parent.parent
CELL = (118, 145)
NEAREST = Image.Resampling.NEAREST
FRAME_MS = 125
COUNT = 24
BAR_Y = 35


def pink_only(image):
    out = Image.new('RGBA', image.size)
    for y in range(image.height):
        for x in range(image.width):
            p = image.getpixel((x, y))
            r, g, b, a = p
            if a and r > 180 and b > 140 and r > g * 1.15 and b > g * 1.1:
                out.putpixel((x, y), p)
    return out


def blink(head, idle, closed):
    """Edit eyes before flipping the head, using pink rather than extra black ink."""
    if not closed:
        return head
    head = head.copy()
    for left in (15, 36):
        for y in range(38, 44):
            for x in range(left, left + 7):
                head.putpixel((x, y), idle.getpixel((45 + x % 3, 44)))
        draw = ImageDraw.Draw(head)
        draw.line((left + 1, 41, left + 5, 41), fill=idle.getpixel((43, 30)), width=2)
    return head


def build():
    idle = Image.open(HERE / 'sprites/idle/idle_01.png').convert('RGBA')
    clean = character(idle)
    head = clean.crop((20, 0, 78, 63))
    # Rear hooves stay hooked on the ledge. Forehooves move independently.
    body = clean.crop((20, 63, 79, 89)).transpose(Image.Transpose.ROTATE_180)
    hooks = body.crop((0, 0, 59, 12))
    chest = body.crop((16, 12, 43, 26))
    left_paw = body.crop((0, 12, 16, 26))
    right_paw = body.crop((43, 12, 59, 26))
    # Reuse the rainbow's actual stripe colours. Its root stays at the hip,
    # while a flat stepped ribbon drops to the side under gravity.
    ribbon = clean.crop((36, 90, 64, 117)).resize((15, 64), NEAREST)
    fringe = pink_only(head.crop((14, 18, 44, 34))).transpose(Image.Transpose.ROTATE_180)
    sway = [0, 0, 1, 1, 2, 2, 2, 2, 1, 1, 0, 0,
            0, -1, -1, -2, -2, -2, -2, -1, -1, 0, 0, 0]
    kick = [0, 0, 0, 1, 2, 1, 0, 0, 0, 0, 0, 0,
            0, 0, 1, 2, 1, 0, 0, 0, 0, 0, 0, 0]
    frames = []
    for i in range(COUNT):
        canvas = Image.new('RGBA', CELL)
        dx = sway[i]
        lag = sway[(i - 2) % COUNT]
        # The stripe bends are hand-set pixel offsets, with more movement at
        # the loose tip. There is no perspective or per-frame lighting.
        for row in range(ribbon.height):
            bend = min(10, row // 3) + int(lag * row / ribbon.height)
            canvas.paste(ribbon.crop((0, row, 15, row + 1)), (73 + bend, 43 + row))
        canvas.alpha_composite(hooks, (34, 36))
        canvas.alpha_composite(chest, (50, 48))
        left_dy = kick[i] if i < 12 else 0
        right_dy = kick[i] if i >= 12 else 0
        canvas.alpha_composite(left_paw, (34 + dx, 48 + left_dy))
        canvas.alpha_composite(right_paw, (77 + dx, 48 + right_dy))
        inverted = blink(head, idle, i in (9, 10)).transpose(Image.Transpose.ROTATE_180)
        canvas.alpha_composite(inverted, (34 + dx, 62))
        # Dangling mane tips use only original pink hair pixels. The narrow
        # tufts follow the sway a beat later, leaving the golden horn visible.
        for x, width, height in ((43, 8, 18), (72, 7, 16)):
            tuft = fringe.resize((width, height), NEAREST)
            canvas.alpha_composite(tuft, (x + lag, 99))
        frames.append(canvas)
    assert frames[0].tobytes() == frames[-1].tobytes()
    assert len({frame.tobytes() for frame in frames}) >= 10
    for frame in frames:
        assert frame.getbbox()[0] > 0 and frame.getbbox()[2] < CELL[0]
        assert frame.getbbox()[3] < CELL[1]
        assert frame.crop((34, 36, 93, 48)).tobytes() == frames[0].crop((34, 36, 93, 48)).tobytes()
    return frames


def background():
    image = Image.new('RGB', CELL, '#302b3e')
    draw = ImageDraw.Draw(image)
    draw.rectangle((0, 28, 117, BAR_Y), fill='#696075')
    draw.line((0, BAR_Y, 117, BAR_Y), fill='#b5a9c8')
    return image


def preview(frames):
    # One shared palette avoids colours flickering between frames in the GIF.
    canvases = []
    for frame in frames:
        image = background()
        image.paste(frame, (0, 0), frame)
        canvases.append(image)
    atlas = Image.new('RGB', (CELL[0] * COUNT, CELL[1]))
    for i, image in enumerate(canvases):
        atlas.paste(image, (i * CELL[0], 0))
    palette = atlas.quantize(colors=255)
    gif = [image.quantize(palette=palette, dither=Image.Dither.NONE).resize(
        (CELL[0] * 4, CELL[1] * 4), NEAREST) for image in canvases]
    gif[0].save(HERE / 'art/hang_preview.gif', save_all=True, append_images=gif[1:],
                duration=FRAME_MS, loop=0, disposal=2, optimize=False)
    samples = (0, 4, 9, 14, 17, 21)
    sheet = Image.new('RGB', (CELL[0] * 3, (CELL[1] + 18) * 2), '#302b3e')
    for i, index in enumerate(samples):
        x, y = (i % 3) * CELL[0], (i // 3) * (CELL[1] + 18)
        sheet.paste(canvases[index], (x, y + 18))
        ImageDraw.Draw(sheet).text((x + 5, y + 3), f'Pose {index + 1:02}', fill='white')
    sheet.resize((sheet.width * 3, sheet.height * 3), NEAREST).save(HERE / 'art/hang_preview.png')
    saved = Image.open(HERE / 'art/hang_preview.gif')
    assert saved.is_animated
    duration = sum(saved.seek(i) or saved.info['duration'] for i in range(saved.n_frames))
    assert 2800 <= duration <= 3000
    print(f'Preview only: {COUNT} frames, {duration}ms, pinned hooves, blink, paw wiggle and dangling hair/rainbow.')
    print('Wrote art/hang_preview.gif and art/hang_preview.png. No plugin assets generated.')


if __name__ == '__main__':
    preview(build())
