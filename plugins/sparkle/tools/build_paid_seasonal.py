"""Build purchased ToffeeCraft pets from local ZIPs (sources are never extracted into the repo).

Usage: python tools/build_paid_seasonal.py --archives PATH
Existing seasonal IDs stay stable. New pets are appended and their picker metadata is generated.
"""
import argparse
import io
import json
import zipfile
from pathlib import Path
from PIL import Image
import build_seasonal as base
from seasonal_motion import add_motion, rig_for
from ghost_moods import ghost_clips

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--archives', type=Path, required=True)
args = parser.parse_args()
records = []


def image(archive, member):
    with zipfile.ZipFile(args.archives / archive) as z:
        return Image.open(io.BytesIO(z.read(member))).convert('RGBA')


def row(archive, member, cell, y=0, count=None):
    im = image(archive, member)
    assert im.width % cell == 0 and im.height % cell == 0, member
    frames = [im.crop((x * cell, y * cell, (x + 1) * cell, (y + 1) * cell))
              for x in range(count or im.width // cell)]
    while frames and not frames[-1].getbbox():
        frames.pop()
    assert frames and all(f.getbbox() for f in frames), member
    return frames


def add(pid, label, pack, name, clips, replace=None):
    pet = (pid, label, clips)
    if replace is None:
        index = len(base.PETS)
        base.PETS.append(pet)
    else:
        index = replace
        base.PETS[index] = pet
    records.append(dict(id=15 + index, label=label, pack=pack, kind='seasonal',
                        defaultName=name, bubbles='bubbles', leaves='heads off'))


def strips(archive, folder, cell, mapping):
    return {key: row(archive, folder + file, cell) for key, file in mapping.items()}


# The Mini Ghost has every mood already (tools/ghost_moods.py), at native pixels, scaled by a whole number.
GHOST_CLIPS, GHOST_MOUTH = ghost_clips(args.archives)
add('ghost', 'Mini Ghost', 'halloween', 'Boo', GHOST_CLIPS, replace=0)
base.INTEGER_SCALE.add('ghost')
for pid, label, archive, folder, prefix in [
    ('classic_ghost', 'Classic Ghost', 'GhostPaidPack.zip', 'GhostPaidPack/', 'Ghost'),
    ('dark_ghost', 'Dark Ghost', 'DarkGhostPaid.zip', 'DarkGhostPaid/', ''),
]:
    add(pid, label, 'halloween', 'Wisp' if prefix else 'Shade', strips(archive, folder, 64, {
        'idle': prefix + 'Idle.png', 'walk': prefix + 'Fly.png',
        'lick1': prefix + 'Idle2.png',
    }))
for colour in ['Purple', 'Orange', 'Green', 'Blue', 'Red']:
    add('witch_ghost_' + colour.lower(), colour + ' Witch Ghost', 'halloween', 'Hex',
        strips('PaidGhostWitch.zip', 'PaidGhostWitch/' + colour + 'Hat/', 32, {
            'idle': 'Idle.png', 'walk': 'Fly.png', 'run': 'Dash.png', 'jump': 'Jump.png',
            'lick1': 'EyeRotate.png',
        }))
add('cotton_boo', 'Cotton Boo', 'halloween', 'Cotton', {
    key: row('CottonBooPaid.zip', 'CottonBooPaid/cottonboo.png', 32, y)
    for key, y in {'idle': 0, 'walk': 5, 'jump': 6, 'sit': 8, 'sleep': 9, 'lick1': 1}.items()
})
add('vampire_cat', 'Vampire Cat', 'halloween', 'Fang', {
    key: row('CatPackHalloweenPAID.zip', 'CatPackHalloweenPAID/draculacats.png', 32, y)
    for key, y in {'idle': 0, 'walk': 2, 'jump': 3, 'voice': 4, 'sleep': 5,
                   'lick1': 6, 'lick2': 7, 'sit': 10}.items()
})
for costume, label, name in [('RedShortXmasHat', 'Santa Cat', 'Holly'),
                              ('GreenLongXmasHat', 'Elf Cat', 'Jingle'),
                              ('DeerHat', 'Reindeer Cat', 'Cocoa')]:
    add('christmas_' + costume.lower(), label, 'christmas', name, {
        key: row('Christmas Mega Bundle.zip',
                 'Christmas Mega Bundle/ChristmasCats/' + costume + '/GoldCollar.png', 32, y)
        for key, y in {'idle': 0, 'walk': 1, 'jump': 7, 'sleep': 8, 'sit': 9, 'lick1': 5}.items()
    })
for colour, short, name in [('LightBrown', 'Brown', 'Maple'), ('DarkBrown', 'DarkBrown', 'Chestnut'),
                             ('White', 'White', 'Pearl')]:
    add('chicken_' + colour.lower(), colour.replace('Brown', ' brown') + ' Chicken', 'thanksgiving', name,
        strips('PaidPack.zip', 'PaidPack/CHICKEN/', 16, {
            'idle': 'Idle/' + colour + 'ChickenIdle-Sheet.png',
            'walk': 'Walking/' + colour + 'ChickenWalking-Sheet.png',
            'sleep': 'Sleeping/' + colour + 'ChickenSleeping.png',
            'sit': 'Sitting/Sitting' + short + '.png',
            'peck': 'Eating/' + colour + 'ChickenEating-Sheet.png',
        }))
add('chick', 'Chick', 'thanksgiving', 'Pip', strips('PaidPack.zip', 'PaidPack/Chick/', 16, {
    'idle': 'IdleChick.png', 'walk': 'RunningChick.png', 'sleep': 'SleepingChick.png',
}))

def pad4(frames):
    """The 4 px border add_motion gives every frame, for rows added after it."""
    out = []
    for f in frames:
        padded = Image.new('RGBA', (f.width + 8, f.height + 8))
        padded.alpha_composite(f, (4, 4))
        out.append(padded)
    return out


def centred(frames):
    """Each frame moved sideways (whole pixels) so its drawing is centred where the first one's is."""
    def mid(f):
        b = f.getbbox()
        return (b[0] + b[2]) // 2
    target = mid(frames[0])
    out = []
    for f in frames:
        moved = Image.new('RGBA', f.size)
        moved.paste(drop_specks(f), (target - mid(f), 0), drop_specks(f))
        out.append(moved)
    return out


def drop_specks(frame, smallest=4):
    """The frame without drawn bits of under [smallest] pixels (a neighbour's leg poking into the cell)."""
    out = frame.copy()
    px = out.load()
    w, h = out.size
    seen = set()
    for y in range(h):
        for x in range(w):
            if px[x, y][3] == 0 or (x, y) in seen:
                continue
            blob, stack = [], [(x, y)]
            seen.add((x, y))
            while stack:
                cx, cy = stack.pop()
                blob.append((cx, cy))
                for nx in (cx - 1, cx, cx + 1):
                    for ny in (cy - 1, cy, cy + 1):
                        if 0 <= nx < w and 0 <= ny < h and (nx, ny) not in seen and px[nx, ny][3]:
                            seen.add((nx, ny))
                            stack.append((nx, ny))
            if len(blob) < smallest:
                for bx, by in blob:
                    px[bx, by] = (0, 0, 0, 0)
    return out


def waddle(idle, pad=4):
    """The Vampire Cat's walk, drawn here: its sheet has none (row 2 is lying under its cape, row 3 a
    leap), and the cat is drawn sitting and facing you. So it waddles the way front-facing sprites
    walk: a front leg and the opposite hind foot step together, then the other pair; the body sways a
    pixel toward each step and bobs as the feet lift; the idle frames keep the tail swishing.

    Leg boxes are in the source cell (draculacats.png row 0), offset by add_motion's [pad]:
    front legs x 5-8 and 10-12 from row 23, hind feet x 0-4 and 13-17 from row 26.
    """
    LEFT_FRONT, RIGHT_FRONT = (5, 23, 9, 32), (10, 23, 13, 32)
    LEFT_HIND, RIGHT_HIND = (0, 26, 5, 32), (13, 26, 18, 32)
    # Per frame: (left front, right front, left hind, right hind) lift in pixels, body sway, bob.
    steps = [
        ((0, 0, 0, 0), 0, 0),
        ((2, 0, 0, 1), 1, -1),
        ((1, 0, 0, 1), 1, 0),
        ((0, 0, 0, 0), 0, 0),
        ((0, 0, 0, 0), 0, 0),
        ((0, 2, 1, 0), -1, -1),
        ((0, 1, 1, 0), -1, 0),
        ((0, 0, 0, 0), 0, 0),
    ]

    def lift(frame, box, dy):
        if not dy:
            return
        x0, y0, x1, y1 = (v + pad for v in box)
        part = frame.crop((x0, y0, x1, y1))
        frame.paste((0, 0, 0, 0), (x0, y0, x1, y1))
        frame.alpha_composite(part, (x0, y0 - dy))

    out = []
    for i, (lifts, sway, bob) in enumerate(steps):
        f = idle[i % len(idle)].copy()
        # The cape and body first, then the legs over them, so a lifted leg tucks under the cape's edge.
        for box, dy in zip((LEFT_FRONT, RIGHT_FRONT, LEFT_HIND, RIGHT_HIND), lifts):
            lift(f, box, dy)
        moved = Image.new('RGBA', f.size)
        moved.paste(f, (sway, bob), f)
        out.append(moved)
    return out


XMAS_COSTUMES = {'christmas_redshortxmashat': 'RedShortXmasHat', 'christmas_greenlongxmashat': 'GreenLongXmasHat',
                 'christmas_deerhat': 'DeerHat'}
CHICKEN_HURT = {'chicken_lightbrown': 'Brown', 'chicken_darkbrown': 'DarkBrown', 'chicken_white': 'White'}


def pack_rows(pid):
    """Animations the packs draw that the first build left to generated poses (reviewed 2026-10-18).

    One rule per pack, so every colour or costume of it gets the same. Combat stays out: hurt's red
    frames and every attack frame from the shot onwards.
    """
    if pid.startswith('witch_ghost_'):
        folder = 'PaidGhostWitch/' + pid.rsplit('_', 1)[1].capitalize() + 'Hat/'
        return {
            'outro': row('PaidGhostWitch.zip', folder + 'Die.png', 32),          # melts away under its hat
            'look': row('PaidGhostWitch.zip', folder + 'EyeRotate.png', 32),     # rolls its eyes round
            'reaction': row('PaidGhostWitch.zip', folder + 'Dash.png', 32),      # star eyes
        }
    if pid in ('classic_ghost', 'dark_ghost'):
        archive, folder, prefix = (('GhostPaidPack.zip', 'GhostPaidPack/', 'Ghost') if pid == 'classic_ghost'
                                   else ('DarkGhostPaid.zip', 'DarkGhostPaid/', ''))
        idle = row(archive, folder + prefix + 'Idle.png', 64)
        attack = row(archive, folder + prefix + 'Attack.png', 64)
        gasp = attack[:9]   # the mouth opens wide; the shot only appears from frame 9
        # 18 frames at 8 fps, the small 'o' on the engine's bubble releases (6, 10, 12).
        o, oo = attack[4], attack[5]
        blow = [idle[0], idle[1], idle[2], attack[3], o, oo, oo, o, o, oo, oo, o, oo, attack[3],
                idle[3 % len(idle)], idle[4 % len(idle)], idle[5 % len(idle)], idle[0]]
        return {
            'outro': row(archive, folder + prefix + 'DieIdle.png', 64),         # sinks into a puddle
            'startle': gasp + [gasp[-1]] * 3 + gasp[::-1][:5],
            'blow': blow,
        }
    if pid == 'cotton_boo':
        def sheet(y):
            return row('CottonBooPaid.zip', 'CottonBooPaid/cottonboo.png', 32, y)
        # It used to cry for every reaction: the crying row was its "lick1".
        # Happy stays the generated bounce: the user preferred it to the pack's blush row (2026-10-18).
        return {'sad': sheet(1), 'lick1': sheet(3), 'fidget': sheet(3), 'lick2': sheet(4), 'reaction': sheet(6)}
    if pid == 'vampire_cat':
        def sheet(y):
            return row('CatPackHalloweenPAID.zip', 'CatPackHalloweenPAID/draculacats.png', 32, y)
        # It leaves flying like a bat (the user's pick over ducking into its box), its cape spread (row 3,
        # frames lined up on one centre: they drift sideways in their cells). The leaving animation plays
        # once, so three wingbeats of it. Its walk is drawn in the loop below (waddle()).
        fly = centred(sheet(3))
        return {'startle': sheet(11), 'outro': fly * 3}   # hisses when startled
    if pid in XMAS_COSTUMES:
        def sheet(y):
            return row('Christmas Mega Bundle.zip',
                       'Christmas Mega Bundle/ChristmasCats/' + XMAS_COSTUMES[pid] + '/GoldCollar.png', 32, y)
        lie = sheet(3)
        # Frames 9-13 are the lying-low part (the Reindeer sheet has a stray 16th cell, one antler pixel).
        return {'sad': lie[9:14] + lie[12:9:-1], 'lick2': sheet(4)}   # lies down low; a stretch
    if pid in CHICKEN_HURT:
        flinch = row('PaidPack.zip', 'PaidPack/CHICKEN/Hurt/ChikenHurt' + CHICKEN_HURT[pid] + '.png', 16)[:4]
        return {'startle': flinch + flinch[::-1]}
    return {}


# Use explicit, non-combat poses for pet behaviours. A resting pose is preferable
# to playing a walk/attack cycle when sad or charging. Keep source poses intact.
paid_ids = {r['id'] - 15 for r in records}
for index in paid_ids:
    pid, label, clips = base.PETS[index]
    if pid == 'ghost':
        base.MOUTHS[pid] = GHOST_MOUTH
        continue
    # Engine-owned trajectories use our stationary takeoff poses; unused source
    # jumps would otherwise enlarge the union bounds and shrink the visible pet.
    clips.pop('jump', None)
    clips['rest'] = clips.get('sleep', clips.get('sit', [clips['idle'][0]]))
    clips['reaction'] = clips.get('voice', clips.get('lick1', clips['idle']))
    # Sleep poses already contain Zs in the Christmas and Cotton Boo sources.
    # Hurt's red damage frames and attack projectiles are deliberately not imported.
    if pid.startswith('chicken_'):
        clips['reaction'] = clips['idle']
    motion = add_motion(pid, clips)
    # Added rows are trimmed to the box the pet already uses: the build scales that box to the pet's
    # size, so a wider row (the Dark Ghost's attack wisps reach past its outline) would shrink it.
    boxes = [f.getbbox() for fs in motion.values() for f in fs if f.getbbox()]
    keep = (min(b[0] for b in boxes), min(b[1] for b in boxes), max(b[2] for b in boxes), max(b[3] for b in boxes))
    for key, frames in pack_rows(pid).items():
        trimmed = []
        for f in pad4(frames):
            out = Image.new('RGBA', f.size)
            out.alpha_composite(f.crop(keep), keep[:2])
            trimmed.append(out)
        motion[key] = trimmed
    if pid == 'vampire_cat':
        # No walk row in its sheet (row 2 is lying under its cape, row 3 a leap): a drawn waddle instead.
        motion['walk'] = waddle(motion['idle'])
    base.PETS[index] = (pid, label, motion)
    rig = rig_for(pid)
    if rig:
        base.MOUTHS[pid] = tuple(v+4 for v in rig[2])

# Every pet at a whole-number scale (build_seasonal.INTEGER_SCALE), so no pixels come out lumpy.
base.INTEGER_SCALE.update(pid for pid, _, _ in base.PETS)
base.main()
generated = base.KT.read_text(encoding='utf-8')
generated = generated.replace('// GENERATED by tools/build_seasonal.py from art/seasonal/src -- do not edit by hand.',
    '// GENERATED by tools/build_paid_seasonal.py -- do not edit by hand.')
generated = generated.replace('// Sources: art/seasonal/src (Ghost CC0, Turkeys CC0, Snowman CC-BY 3.0, Flappy Dragon CC0).',
    '// Includes purchased ToffeeCraft artwork (project use only; not a reusable asset pack).\n'
    '// Legacy sources: Turkeys CC0, Snowman CC-BY 3.0, Flappy Dragon CC0.')
base.KT.write_text(generated, encoding='utf-8')
path = base.ROOT / 'js' / 'seasonalPets.ts'
path.write_text('// Generated by tools/build_paid_seasonal.py.\nexport const SEASONAL_PETS = '
                + json.dumps(records, indent=2) + ' as const\n', encoding='utf-8')
print('Generated', len(records), 'purchased pets and matching picker metadata')

# Purchased pets: art lives in assets/paid-pets.bin, never in source (tools/split_paid.py).
import split_paid
split_paid.main()
