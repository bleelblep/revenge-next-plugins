"""Source-preserving pose edits. Translation/rotation remain owned by Pet.kt.

Small silhouette deformations provide anticipation and recovery without inventing
anatomy or adding projectiles. All frames retain a shared cell and foot anchor.
"""
import math
from PIL import Image, ImageDraw

# Hand-mapped face landmarks in the original source cells, before the 4px pad.
# Eye boxes exclude outlines, hats and highlights outside the eye sockets.
RIGS = {
    'ghost': ((14, 13, 18, 18), (20, 13, 24, 18), (19, 20)),
    'classic_ghost': ((30, 11, 34, 16), (35, 11, 39, 16), (35, 19)),
    'dark_ghost': ((30, 11, 34, 16), (35, 11, 39, 16), (35, 19)),
}
WITCH_RIG = ((14, 17, 16, 20), (19, 17, 21, 20), (18, 22))


def rig_for(pid):
    return WITCH_RIG if pid.startswith('witch_ghost_') else RIGS.get(pid)


def expression(frame, rig, mood, gaze=0):
    """Redraw only the mapped sockets using nearby source body/eye colours."""
    out = frame.copy()
    draw = ImageDraw.Draw(out)
    for eye, (x0, y0, x1, y1) in enumerate(rig[:2]):
        x0, y0, x1, y1 = x0+4, y0+4, x1+4, y1+4
        body = frame.getpixel((x0, y1+1))
        ink = max((frame.getpixel((x,y)) for y in range(y0,y1) for x in range(x0,x1)),
                  key=lambda c: sum((c[k]-body[k])**2 for k in range(3)))
        draw.rectangle((x0,y0,x1-1,y1-1), fill=body)
        mid = (y0+y1)//2
        if mood == 'sleep':
            draw.line((x0,mid,x1-1,mid), fill=ink)
        elif mood == 'happy':
            # A small upward arch, not the old rectangular closed-eye block.
            draw.line([(x0,mid+1),((x0+x1-1)//2,mid-1),(x1-1,mid+1)], fill=ink)
        elif mood == 'sad':
            # Inner corners lifted, outer corners drooping; distinct from sleep.
            draw.line((x0,mid+(1 if eye == 0 else -1),x1-1,mid+(-1 if eye == 0 else 1)),fill=ink)
        elif mood == 'dizzy':
            draw.line((x0,y0,x1-1,y1-1),fill=ink)
            draw.line((x1-1,y0,x0,y1-1),fill=ink)
        else:
            width = max(1, x1-x0-2)
            xx = max(x0,min(x1-width,(x0+x1-width)//2+gaze))
            draw.rectangle((xx,y0,xx+width-1,y1-1),fill=ink)
    if mood in ('blow','startle','happy','sad'):
        mx,my = rig[2]; mx+=4; my+=4
        x0,y0,x1,y1 = rig[0]
        body = frame.getpixel((x0+4,y1+5))
        ink = max((frame.getpixel((x+4,y+4)) for y in range(y0,y1) for x in range(x0,x1)),
                  key=lambda c: sum((c[k]-body[k])**2 for k in range(3)))
        if mood == 'happy':
            draw.line([(mx-2,my-1),(mx-1,my),(mx+1,my),(mx+2,my-1)],fill=ink)
        elif mood == 'sad':
            draw.line([(mx-2,my+1),(mx-1,my),(mx+1,my),(mx+2,my+1)],fill=ink)
        else:
            draw.ellipse((mx-1,my-1,mx+1,my+1),fill=ink)
    return out


def sway(frame, phase, amount=1, split=None):
    """Ripple the lower shroud while leaving the face/hat stationary."""
    out = Image.new('RGBA',frame.size)
    box=frame.getbbox()
    if split is None:
        split=box[1]+(box[3]-box[1])*3//4
    for y in range(frame.height):
        dx = round(math.sin(phase+(y-split)*0.45)*amount) if y>=split else 0
        out.alpha_composite(frame.crop((0,y,frame.width,y+1)),(dx,y))
    return out


def pose(frame, height_delta=0, width_delta=0):
    box = frame.getbbox()
    assert box
    x0, y0, x1, y1 = box
    w, h = x1 - x0, y1 - y0
    nw, nh = max(1, w + width_delta), max(1, h + height_delta)
    x = x0 - (nw - w) // 2
    y = y1 - nh
    assert x >= 0 and y >= 0 and x + nw <= frame.width and y1 <= frame.height
    out = Image.new('RGBA', frame.size)
    out.alpha_composite(frame.crop(box).resize((nw, nh), Image.Resampling.NEAREST), (x, y))
    return out


def cat_walk(frame):
    """Eight-frame Santa gait: four source-coloured legs, opposite diagonal pairs.

    Coordinates refer to the padded 32px standing cell. Preserve the entire
    head, hat, torso and tail; rebuild only the bottom four rows of the legs.
    """
    outline = frame.getpixel((12, 33))
    fur = frame.getpixel((13, 33))
    frames = []
    # Contact -> passing (lifted) -> opposite contact -> grounded return.
    # The cats face right: a paw on the ground pushes back (+1 -> -1), then lifts and swings
    # forward. (Until 0.16.1 the signs were the other way round, so the legs walked backwards.)
    steps = [(-1,0),(0,-1),(1,-1),(1,0),(1,0),(0,0),(-1,0),(-1,0)]
    for phase in range(8):
        out = frame.copy()
        draw = ImageDraw.Draw(out)
        draw.rectangle((11,32,27,35),fill=(0,0,0,0))
        for leg,x in enumerate((13,17,21,25)):
            dx,dy = steps[(phase + (4 if leg in (1,2) else 0)) % 8]
            # Each limb stays connected to its hip; the paw traces a small arc.
            draw.line([(x,31),(x+dx,33+dy),(x+dx,34+dy)],fill=outline,width=3)
            draw.line([(x,31),(x+dx,33+dy)],fill=fur,width=1)
        frames.append(out)
    return frames


def ghost_motion(idle, rig, step, witch):
    """Pose changes have readable wind-up/settle; travel stays in Pet.kt."""
    split = rig[2][1] + 6
    def shroud(frame, phase, amplitude=1):
        return sway(frame,phase,amplitude*step,split)
    startled = expression(idle,rig,'startle')
    startle = [idle.copy(), pose(idle,-step,step), pose(startled,step,0),
               startled.copy(), startled.copy(), expression(idle,rig,'look'), idle.copy(),idle.copy()]
    takeoff = [idle.copy(),pose(idle,-step,step),pose(idle,-step,step),
               pose(idle,step,-step),pose(idle,step,-step),idle.copy(),idle.copy(),idle.copy()]
    hang = [shroud(expression(idle,rig,'look',g),i*math.tau/12)
            for i,g in enumerate([0,0,1,1,1,0,0,0,-1,-1,-1,0])]
    spin = [shroud(pose(idle,0,-step),i*math.tau/8) for i in range(8)]
    outro = [idle.copy(),pose(idle,-step,step),pose(idle,step,-step)] + [
        shroud(pose(idle,step,-step),i*math.pi/3) for i in range(5)]
    # Bend only the pointed hat tip, leaving the brim and face registered.
    if witch:
        for frames in (startle,takeoff,hang,spin,outro):
            for i,frame in enumerate(frames):
                dx = [0,0,-1,0,1,0,0,0][i%8]
                if dx:
                    tip=frame.crop((0,0,frame.width,15))
                    ImageDraw.Draw(frame).rectangle((0,0,frame.width,14),fill=(0,0,0,0))
                    frame.alpha_composite(tip,(dx,0))
    return dict(startle=startle,takeoff=takeoff,hang=hang,spin=spin,outro=outro)


def add_motion(pid, clips):
    # Pad every source frame identically, including jumps and resting poses.
    for key, frames in list(clips.items()):
        padded = []
        for frame in frames:
            out = Image.new('RGBA', (frame.width + 8, frame.height + 8))
            out.alpha_composite(frame, (4, 4))
            padded.append(out)
        clips[key] = padded
    idle = clips['idle'][0]
    # One source pixel at 16/32px, two at 64px: restrained movement at native scale.
    step = 2 if idle.width > 64 else 1
    def cycle(frame, offsets):
        return [pose(frame, dy * step, dx * step) for dy, dx in offsets]
    clips['startle'] = cycle(idle, [(0,0),(-1,1),(1,-1),(1,-1),(0,0),(0,0)])
    clips['happy'] = cycle(idle, [(0,0),(-1,1),(0,0),(1,0),(0,0),(0,0)])
    clips['takeoff'] = cycle(idle, [(0,0),(-1,1),(-1,1),(1,-1),(0,0),(0,0)])
    # Rest breathing uses a complete original resting pose, with no whole-pet bob.
    rest = clips['rest'][0]
    if 'sleep' not in clips:
        clips['rest'] = cycle(rest, [(0,0),(0,0),(-1,0),(-1,0),(0,0),(0,0)])
    clips['sad'] = cycle(rest, [(0,0),(0,0),(-1,0),(-1,0),(0,0),(0,0)])
    clips['charge'] = cycle(idle, [(0,0),(0,0),(1,0),(1,0),(0,0),(0,0)])
    # Puff anticipation/recovery only; live bubbles are emitted by the runtime.
    clips['blow'] = cycle(idle, [(0,0),(0,0),(-1,1),(-1,1),(0,0),(0,0)])
    # Dedicated stationary poses: Pet owns travel, rotation and ceiling inversion.
    clips['hang'] = cycle(idle, [(1,-1),(1,-1),(0,0),(0,0)])
    clips['spin'] = cycle(idle, [(-1,1),(0,0),(1,-1),(0,0)])
    clips['outro'] = cycle(idle, [(0,0),(-1,1),(1,-1),(1,-1)])
    clips['look'] = cycle(clips.get('sit', [idle])[0], [(0,0),(0,0),(1,0),(1,0),(0,0),(0,0)])
    clips['dizzy'] = [sway(idle,i*math.pi/4,step) for i in range(8)]
    clips['fidget'] = clips.get('lick1', cycle(idle, [(0,0),(1,0),(0,0),(-1,0)]))
    # 18 frames at the engine's 8fps: inhale, three puffs at 6/10/12, recovery.
    clips['blow'] = cycle(idle, [(0,0),(0,0),(1,0),(1,0),(-1,1),(-1,1),
        (0,0),(0,0),(-1,1),(-1,1),(0,0),(-1,1),(0,0),(0,0),(0,0),(0,0),(0,0),(0,0)])
    rig = rig_for(pid)
    if rig:
        for key,mood,n in [('rest','sleep',12),('sad','sad',8),('happy','happy',8),
                           ('startle','startle',6),('dizzy','dizzy',8),('reaction','happy',8)]:
            face=expression(idle,rig,mood)
            clips[key]=[sway(face,i*math.tau/n,step,rig[2][1]+6) for i in range(n)]
        clips['look']=[expression(idle,rig,'look',g) for g in [0,0,-1,-1,-1,0,1,1,1,0,0,0]]
        clips['blow']=[expression(idle,rig,'blow') if 4<=i<=12 else idle.copy() for i in range(18)]
        clips['hang']=[sway(expression(idle,rig,'look'),i*math.pi/4,step,rig[2][1]+6) for i in range(8)]
        # Mood silhouettes, rather than the same rippling shroud for both emotions.
        happy = expression(idle,rig,'happy')
        sad = expression(idle,rig,'sad')
        clips['happy'] = cycle(happy, [(0,0),(-1,1),(0,0),(1,0),(1,0),(0,0),(0,0),(0,0)])
        clips['sad'] = cycle(sad, [(-1,0),(-1,0),(-2,1),(-2,1),(-2,1),(-1,0),(-1,0),(-1,0)])
        clips.update(ghost_motion(idle,rig,step,pid.startswith('witch_ghost_')))
    # All three Christmas cats share one sheet layout, so they all get the drawn walk: the sheet has
    # no walk row, and Elf and Reindeer used to walk with the pounce row.
    if pid.startswith('christmas_'):
        clips['walk'] = cat_walk(idle)
        # No baked-in source jump displacement: Pet supplies the arc.
        clips['takeoff'] = cycle(idle, [(0,0),(-2,1),(-2,1),(1,-1),(1,-1),(0,0),(0,0),(0,0)])
    return clips
