"""Embed approved unicorn motion and matching Nyan poses, with per-frame timing.

Run python tools/build_motion.py. Outputs MotionData.kt and Nyan GIF previews.
Separate cells let the spinning artwork keep its full size without clipping or
changing any existing animation's anchors.
"""
import base64
import io
from pathlib import Path
from PIL import Image, ImageDraw
import preview_spin as unicorn_spin
import preview_hang as unicorn_hang
import preview_nyan_poses as nyan

HERE = Path(__file__).resolve().parent.parent
NEAREST = Image.Resampling.NEAREST


def nyan_pose(tuck=0, blink=False, crossed=False, tail=0):
    c = nyan.Canvas()
    c.part(tail % 6, 'tail')
    for i in range(1, 5):
        c.part(0, f'leg{i}', dy=-tuck)
    c.part(0, 'body')
    c.part(0, 'head')
    c.part(0, 'cheekL')
    c.part(0, 'cheekR')
    if blink:
        nyan.closed_eyes(c, 0, 0)
    elif crossed:
        for name in ('eyeL', 'eyeR'):
            x, y, _, _ = c.box(name)
            for j in range(2):
                for i in range(2):
                    c.set(x + i, y + j, nyan.GREY)
            c.set(x + (1 if name == 'eyeL' else 0), y, nyan.BLACK)
            c.set(x + (1 if name == 'eyeL' else 0), y + 1, nyan.BLACK)
    image = Image.new('RGBA', (nyan.CW, nyan.CH))
    for (x, y), colour in c.px.items():
        image.putpixel((x, y), tuple(int(colour[k:k + 2], 16) for k in (1, 3, 5)) + (255,))
    return image


def nyan_spin():
    frames = []
    for i in range(6):
        canvas = Image.new('RGBA', (54, 54))
        pose = nyan_pose(tuck=2, crossed=True, tail=i)
        canvas.alpha_composite(pose, (7, 10))
        frames.append(canvas)
    return frames


def unicorn_spin_pose():
    source = unicorn_spin.character(Image.open(HERE / 'sprites/idle/idle_01.png').convert('RGBA'))
    body = unicorn_spin.tucked_body(unicorn_spin.spin_face(source), 3)
    rainbow = unicorn_spin.clear_limbs(source)
    frames = []
    for bend in (-2, -3, -4, -3, -2, -1):
        canvas = Image.new('RGBA', (160, 160))
        for y in range(85, source.height):
            dx = int(bend * (y - 85) / (source.height - 86))
            canvas.paste(rainbow.crop((0, y, source.width, y + 1)), (31 + dx, 15 + y))
        canvas.alpha_composite(body, (31, 15))
        frames.append(canvas)
    return frames


def nyan_hang():
    frames = []
    for i in range(24):
        image = nyan_pose(blink=i in (9, 10), tail=(i // 3) % 6).transpose(Image.Transpose.ROTATE_180)
        # Fix the gripping paws at the ceiling while the head/body wriggles.
        out = Image.new('RGBA', image.size)
        dx = (0, 1, 1, 0, -1, -1, 0, 0)[i // 3]
        out.alpha_composite(image, (dx, 0))
        draw = ImageDraw.Draw(out)
        for x in (11, 24):
            draw.rectangle((x, 0, x + 3, 4), fill=nyan.BLACK)
            draw.rectangle((x + 1, 1, x + 2, 3), fill=nyan.GREY)
        frames.append(out)
    # Settle on precisely the starting pose for a clean loop.
    frames[-1] = frames[0].copy()
    return frames


def nyan_actions():
    base = nyan_pose()
    jump = []
    for tuck, squash in ((0, 0), (1, 2), (2, 1), (2, -1), (2, -1), (1, 0), (0, 2), (0, 0)):
        pose = nyan_pose(tuck=tuck)
        image = Image.new('RGBA', base.size)
        # Compress the stance before takeoff and on landing; flight height is
        # supplied by Pet's hop, so the sprite doesn't add a second jump arc.
        if squash:
            box = pose.getbbox()
            part = pose.crop(box)
            part = part.resize((part.width, part.height - squash), NEAREST)
            image.alpha_composite(part, (box[0], box[3] - part.height))
        else:
            image = pose
        jump.append(image)
    shake = []
    for dx, dy in ((0, 0), (-1, 0), (1, 0), (-2, 1), (2, 0), (-1, 0), (1, 0), (0, 0)):
        image = Image.new('RGBA', base.size)
        image.alpha_composite(nyan_pose(blink=bool(dx), tail=abs(dx)), (dx, dy))
        shake.append(image)
    look = []
    head_names = ('head', 'cheekL', 'cheekR', 'eyeL', 'eyeR')
    # A flat head-turn: face narrows to profile, looks left over the pastry,
    # pauses, then retraces. Body and all four paws remain facing forward.
    for width, reverse in ((1., False), (.85, False), (.65, False), (.65, True),
                           (.85, True), (1., True), (1., True), (1., True),
                           (.85, True), (.65, True), (.65, False), (.85, False), (1., False)):
        c = nyan.Canvas()
        c.part(0, 'tail')
        for n in ('leg1', 'leg2', 'leg3', 'leg4', 'body'):
            c.part(0, n)
        image = Image.new('RGBA', base.size)
        for (x, y), colour in c.px.items():
            image.putpixel((x, y), tuple(int(colour[k:k + 2], 16) for k in (1, 3, 5)) + (255,))
        h = nyan.Canvas()
        for n in head_names:
            h.part(0, n)
        layer = Image.new('RGBA', base.size)
        for (x, y), colour in h.px.items():
            layer.putpixel((x, y), tuple(int(colour[k:k + 2], 16) for k in (1, 3, 5)) + (255,))
        box = layer.getbbox()
        part = layer.crop(box)
        if reverse:
            part = part.transpose(Image.Transpose.FLIP_LEFT_RIGHT)
        part = part.resize((round(part.width * width), part.height), NEAREST)
        image.alpha_composite(part, (box[0] + (box[2] - box[0] - part.width) // 2 - (2 if reverse else 0), box[1]))
        look.append(image)
    outro = []
    for i, dy in enumerate((0, 0, 1, 1, 0, -1, -2, -3, -4, -4)):
        image = Image.new('RGBA', base.size)
        image.alpha_composite(nyan_pose(tuck=min(2, i // 3), blink=i in (1, 2), tail=i % 6), (0, dy))
        # A raised front paw waves before the departure tuck.
        if i in (1, 2, 3, 4):
            d = ImageDraw.Draw(image)
            y = 15 - (i % 2) * 2
            d.rectangle((35, y, 37, y + 4), fill=nyan.BLACK)
            d.rectangle((36, y + 1, 36, y + 3), fill=nyan.GREY)
        outro.append(image)
    return [('nyan_jump', jump, [60] * 8, 0, 0),
            ('nyan_shake', shake, [60] * 8, 0, 0),
            ('nyan_look', look, [100] * 13, 0, 0),
            ('nyan_outro', outro, [90] * 10, 0, 0)]


def preview(name, frames, durations, scale):
    scenes = []
    for frame in frames:
        bg = Image.new('RGB', frame.size, '#302b3e')
        bg.paste(frame, (0, 0), frame)
        scenes.append(bg.resize((frame.width * scale, frame.height * scale), NEAREST))
    scenes[0].save(HERE / f'art/{name}_preview.gif', save_all=True, append_images=scenes[1:],
                   duration=durations, loop=0, disposal=2)


def main():
    spin_times = [80] * 6
    # Offsets are in the look's existing logical cell, keeping the sprite size.
    motions = [
        ('unicorn_spin', unicorn_spin_pose(), spin_times, -17, 9),
        ('unicorn_hang', unicorn_hang.build(), [125] * 24, 0, -36),
        ('nyan_spin', nyan_spin(), spin_times, -7, -10),
        ('nyan_hang', nyan_hang(), [125] * 24, 0, 0),
    ] + nyan_actions()
    lines = ['// GENERATED by tools/build_motion.py -- do not edit.', 'package com.bleelblep.sparkle',
             '', 'internal object MotionData {',
             '\tclass Strip(val w: Int, val h: Int, val dx: Int, val dy: Int, val times: IntArray, val png: String)',
             '\tval strips = mapOf(']
    for name, frames, durations, dx, dy in motions:
        w, h = frames[0].size
        sheet = Image.new('RGBA', (w * len(frames), h))
        for i, frame in enumerate(frames):
            assert frame.size == (w, h)
            sheet.paste(frame, (i * w, 0))
        buf = io.BytesIO()
        sheet.quantize(colors=128, method=Image.Quantize.FASTOCTREE).save(buf, 'PNG', optimize=True)
        encoded = base64.b64encode(buf.getvalue()).decode()
        assert len(encoded) < 60000
        times = ', '.join(map(str, durations))
        lines.append(f'\t\t"{name}" to Strip({w}, {h}, {dx}, {dy}, intArrayOf({times}), "{encoded}"),')
        if name.startswith('nyan'):
            preview(name, frames, durations, 8)
        print(f'{name}: {len(frames)} frames, {sum(durations)}ms, {w}x{h}')
    lines += ['\t)', '}', '']
    (HERE / 'src/main/kotlin/com/bleelblep/sparkle/MotionData.kt').write_text('\n'.join(lines), encoding='utf-8')


if __name__ == '__main__':
    main()
