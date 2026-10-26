"""The Mini Ghost's animations: the 32 Pixel Ghost pack's own, plus moods drawn from its frames.

Used by build_paid_seasonal.py in place of seasonal_motion.add_motion for the ghost. The pack gives
idle, fly (walk), jump (takeoff) and die (outro). Every other mood is a pixel edit of the pack's idle
frames at their native 32 x 32: the eyes (pure black #000000, never the #3a3a3c outline) are redrawn,
a mouth or blush added, and the body moved in whole pixels. Nothing is resized here; the build
scales the ghost by a whole number afterwards (build_seasonal.INTEGER_SCALE).

Hurt (red flash) and Attack (fireball) are left out: they read as combat, not a pet.

Prototyped with a preview page (all moods, before and after) on 2026-10-18.
"""
import io
import math
import zipfile
from pathlib import Path

from PIL import Image

CELL = 32
INK = (0, 0, 0, 255)
BODY = (255, 255, 255, 255)
BLUSH = (255, 170, 190, 255)
TEAR = (120, 200, 255, 255)
SHINE = (255, 255, 255, 255)
GLOW = (255, 244, 170, 255)
GASP = (60, 40, 50, 255)


def _sheet(archives: Path, name: str):
	with zipfile.ZipFile(archives / '32PixelGhost.zip') as z:
		im = Image.open(io.BytesIO(z.read(f'SHEETS/{name}-Sheet.png'))).convert('RGBA')
	frames = [im.crop((i * CELL, 0, (i + 1) * CELL, CELL)) for i in range(im.width // CELL)]
	return [f for f in frames if f.getbbox()]


# ---- Pixel helpers ------------------------------------------------------------------------------

def _is_ink(p):
	return p[3] and p[:3] == (0, 0, 0)


def eyes(frame):
	"""The two eye boxes (x0, y0, x1, y1, inclusive): pure-black blobs of 4+ pixels, left then right."""
	px = frame.load()
	seen, boxes = set(), []
	for y in range(CELL):
		for x in range(CELL):
			if not _is_ink(px[x, y]) or (x, y) in seen:
				continue
			stack, blob = [(x, y)], []
			seen.add((x, y))
			while stack:
				cx, cy = stack.pop()
				blob.append((cx, cy))
				for nx, ny in ((cx + 1, cy), (cx - 1, cy), (cx, cy + 1), (cx, cy - 1)):
					if 0 <= nx < CELL and 0 <= ny < CELL and (nx, ny) not in seen and _is_ink(px[nx, ny]):
						seen.add((nx, ny))
						stack.append((nx, ny))
			if len(blob) >= 4:
				xs, ys = [p[0] for p in blob], [p[1] for p in blob]
				boxes.append((min(xs), min(ys), max(xs), max(ys)))
	boxes.sort()
	return boxes[:2]


def _erase_eyes(frame):
	out = frame.copy()
	px = out.load()
	for y in range(CELL):
		for x in range(CELL):
			if _is_ink(px[x, y]):
				px[x, y] = BODY
	return out


def _dots(frame, points, colour=INK):
	px = frame.load()
	for x, y in points:
		if 0 <= x < CELL and 0 <= y < CELL:
			px[x, y] = colour
	return frame


def face(frame, kind, phase=0, dx=0, dy=0):
	"""The eyes redrawn as [kind], in the eye boxes of [frame]."""
	boxes = eyes(frame)
	out = _erase_eyes(frame)
	for side, (x0, y0, x1, y1) in enumerate(boxes):
		mirror = side == 1

		def at(u, v):
			return (x1 - u if mirror else x0 + u, y0 + v)

		if kind == 'open':          # the pack's own eye, moved by dx/dy; phase 1 adds a highlight
			src = frame.load()
			pts = [(x + dx, y + dy) for y in range(y0, y1 + 1) for x in range(x0, x1 + 1) if _is_ink(src[x, y])]
			_dots(out, pts)
			if phase:
				_dots(out, [(x0 + 1 + dx, y0 + 1 + dy)], SHINE)
		elif kind == 'closed':      # asleep: a soft downward curve
			_dots(out, [at(0, 2), at(1, 3), at(2, 3), at(3, 2)])
		elif kind == 'happy':       # ^ ^
			_dots(out, [at(0, 3), at(1, 2), at(1, 1), at(2, 1), at(2, 2), at(3, 3)])
		elif kind == 'squeeze':     # > <
			_dots(out, [at(0, 0), at(1, 1), at(2, 2), at(1, 3), at(0, 4)])
		elif kind == 'sad':         # low eye, inner brow lifted
			_dots(out, [at(u, v) for u in range(1, 4) for v in range(2, 5)])
			_dots(out, [at(3, 0), at(2, 0), at(1, 1), at(0, 1)])
		elif kind == 'wide':        # startled: big round eyes with a shine
			_dots(out, [at(u, v) for u in range(4) for v in range(5) if not (u in (0, 3) and v in (0, 4))])
			_dots(out, [at(1, 1)], SHINE)
		elif kind == 'swirl':       # dizzy: a gap chasing round the rim
			ring = [(1, 0), (2, 0), (3, 1), (3, 2), (3, 3), (2, 4), (1, 4), (0, 3), (0, 2), (0, 1)]
			_dots(out, [at(*p) for i, p in enumerate(ring) if (i + phase * (1 if side else -1)) % 10 < 7])
			_dots(out, [at(1, 2), at(2, 2)])
	return out


def mouth_point(frame):
	"""Where the mouth goes (its top-left): between the eyes, two rows under them."""
	boxes = eyes(frame)
	return (boxes[0][2] + boxes[1][0]) // 2, max(b[3] for b in boxes) + 2


def mouth(frame, kind, ref=None):
	"""A small mouth under the eyes. [ref]: a frame whose eyes are still the pack's, to place it by."""
	cx, y = mouth_point(ref if ref is not None else frame)
	if kind == 'frown':
		_dots(frame, [(cx - 1, y + 1), (cx, y), (cx + 1, y), (cx + 2, y + 1)])
	elif kind == 'smile':
		_dots(frame, [(cx - 1, y), (cx, y + 1), (cx + 1, y + 1), (cx + 2, y)])
	elif kind == 'o':
		_dots(frame, [(cx, y), (cx + 1, y), (cx, y + 1), (cx + 1, y + 1)])
	elif kind == 'gasp':
		_dots(frame, [(cx, y), (cx + 1, y), (cx - 1, y + 1), (cx + 2, y + 1), (cx - 1, y + 2), (cx + 2, y + 2), (cx, y + 3), (cx + 1, y + 3)])
		_dots(frame, [(cx, y + 1), (cx + 1, y + 1), (cx, y + 2), (cx + 1, y + 2)], GASP)
	elif kind == 'purse':
		_dots(frame, [(cx, y + 1), (cx + 1, y + 1)])
	return frame


def blush(frame, ref=None):
	boxes = eyes(ref if ref is not None else frame)
	y = max(b[3] for b in boxes) + 1
	return _dots(frame, [(boxes[0][0] - 1, y), (boxes[0][0], y), (boxes[1][2], y), (boxes[1][2] + 1, y)], BLUSH)


def shift(frame, dx=0, dy=0):
	out = Image.new('RGBA', frame.size)
	out.alpha_composite(frame, (dx, dy))
	return out


def ripple(frame, phase, amount=1):
	"""The hem's rows moved sideways in whole pixels, a wave running down it."""
	box = frame.getbbox()
	start = box[1] + (box[3] - box[1]) * 2 // 3
	out = Image.new('RGBA', frame.size)
	for y in range(CELL):
		d = round(math.sin(phase + (y - start) * 0.7) * amount) if y >= start else 0
		out.alpha_composite(frame.crop((0, y, CELL, y + 1)), (d, y))
	return out


def wobble(frame, phase):
	"""Dizzy sway: the top half leans a pixel one way, then the other."""
	box = frame.getbbox()
	mid = (box[1] + box[3]) // 2
	lean = round(math.sin(phase))
	out = Image.new('RGBA', frame.size)
	for y in range(CELL):
		d = lean if y < mid - 3 else (0 if y > mid + 3 else round(lean / 2))
		out.alpha_composite(frame.crop((0, y, CELL, y + 1)), (d, y))
	return out


def breathe(frame, inhale):
	"""Sleep breathing: one row out of the middle of the body when breathing out."""
	if inhale:
		return frame.copy()
	box = frame.getbbox()
	cut = box[1] + (box[3] - box[1]) * 3 // 5
	out = Image.new('RGBA', frame.size)
	out.alpha_composite(frame.crop((0, 0, CELL, cut)), (0, 1))
	out.alpha_composite(frame.crop((0, cut + 1, CELL, CELL)), (0, cut + 1))
	return out


def tint_band(frame, top, bottom, colour):
	"""The white body recoloured between two rows (the charging glow)."""
	out = frame.copy()
	px = out.load()
	for y in range(max(0, top), min(CELL, bottom)):
		for x in range(CELL):
			if px[x, y][:3] in ((255, 255, 255), (236, 236, 239)):
				px[x, y] = colour
	return out


def fade(frame, alpha):
	out = frame.copy()
	out.putalpha(out.getchannel('A').point(lambda v: int(v * alpha)))
	return out


# ---- The clips ----------------------------------------------------------------------------------

def ghost_clips(archives: Path):
	"""-> ({strip name: frames}, mouth (x, y) in the 32 px cell). Names match SheetLook.seasonalPick."""
	idle = _sheet(archives, 'GhostIdle')
	i0 = idle[0]
	clips = {
		'idle': idle,
		'walk': _sheet(archives, 'GhostFly'),
		# Squash, stretch and land in place; Pet.kt draws the arc.
		'takeoff': _sheet(archives, 'GhostJump'),
		# Melts into a puddle as it leaves.
		'outro': _sheet(archives, 'GhostDie'),
	}

	lift = [0, -2, -3, -3, -2, -2, -1, -1, 0]
	clips['startle'] = ([i0] + [mouth(face(shift(idle[i % 8], 0, d), 'wide'), 'gasp') for i, d in enumerate(lift[1:], 1)]
		+ [face(idle[i % 8], 'open') for i in range(9, 12)])

	# 18 frames at 8 fps; the mouth is open on the engine's bubble releases (frames 6, 10 and 12), and
	# the two frames before each, while SheetLook grows the drawn bubble there.
	def o(i):
		return mouth(face(idle[i % 8], 'closed'), 'o', idle[i % 8])

	def purse(i):
		return mouth(face(idle[i % 8], 'closed'), 'purse', idle[i % 8])

	breath = blush(face(idle[1], 'happy'), idle[1])
	clips['blow'] = [i0, breath, breath, purse(3), o(4), o(5), o(6), purse(7), o(8), o(9), o(10), o(11), o(12),
		purse(13), idle[6], idle[7], idle[0], idle[1]]

	clips['happy'] = [blush(mouth(face(shift(f, 0, [0, -1, -2, -1, 0, 0, -1, 0][i]), 'happy'), 'smile', shift(f, 0, [0, -1, -2, -1, 0, 0, -1, 0][i])),
		shift(f, 0, [0, -1, -2, -1, 0, 0, -1, 0][i])) for i, f in enumerate(idle)]

	sad = []
	for i in range(12):
		base = shift(idle[i % 8], 0, 1)
		f = mouth(face(shift(ripple(idle[i % 8], i * math.tau / 12), 0, 1), 'sad'), 'frown', base)
		x0, _, _, y1 = eyes(base)[0]
		if i >= 3 and (i - 3) // 2 < 5:
			_dots(f, [(x0, y1 + 1 + (i - 3) // 2)], TEAR)
		sad.append(f)
	clips['sad'] = sad
	# Low battery: the sad face, half see-through and flickering.
	clips['low'] = [fade(s, 0.55 if i % 4 else 0.4) for i, s in enumerate(sad[:8])]

	clips['rest'] = [breathe(face(i0, 'closed'), inhale=(i // 3) % 2 == 0) for i in range(12)]

	box = i0.getbbox()
	clips['charge'] = [mouth(face(tint_band(i0, box[3] - int((box[3] - box[1]) * i / 9), box[3], GLOW), 'happy'), 'smile', i0)
		for i in range(10)]

	clips['dizzy'] = [wobble(mouth(face(idle[i % 8], 'swirl', phase=i), 'o', idle[i % 8]), i * math.tau / 8) for i in range(16)]
	clips['look'] = [face(idle[i % 8], 'open', dx=dx) for i, dx in enumerate([0, 0, -1, -1, -1, -1, 0, 0, 1, 1, 1, 1, 0, 0])]
	clips['hang'] = [ripple(face(i0, 'open', dy=-1), i * math.tau / 8) for i in range(8)]
	clips['spin'] = [ripple(face(idle[i], 'squeeze'), i * math.tau / 8) for i in range(8)]
	clips['reaction'] = [face(shift(idle[i], 0, [0, -1, -2, -2, -1, 0, 0, 0][i]), 'open', phase=1) for i in range(8)]

	fidget = [idle[i % 8] for i in range(16)]
	fidget[5] = face(idle[5], 'closed')
	fidget[6] = face(idle[6], 'closed')
	clips['fidget'] = [ripple(f, i * math.tau / 8) if i >= 8 else f for i, f in enumerate(fidget)]

	mx, my = mouth_point(i0)
	return clips, (mx + 1, my)
