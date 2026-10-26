"""From-scratch pixel art for the two "boss" seasonal pets and the Horseman's horse.

Nothing is traced or resized: every frame is drawn at its native cell (64x48 for the Headless
Horseman, 48x48 for Krampus, 64x48 for the horse) from simple shapes in a small palette, with a 1 px
outline added last, the way the treats are drawn in Pet.kt and the Mini Ghost's moods in
ghost_moods.py. The characters face right; Pet.kt mirrors them to face left and owns bob, lean,
inversion on the ceiling and the wind-up rotation, so the strips only carry what the body itself does.

Strips follow SheetLook's seasonal contract (the ones a "revised" seasonal pet has): idle, walk,
takeoff (JUMP, held on the last frame), outro, spin, rest (SLEEP), sad, low, charge, happy, startle
(SURPRISED/SHAKE), dizzy, reaction, blow (bubbles hand off at frames 6, 10, 12 at the mouth point),
look, hang (upright; Pet inverts it) and fidget. On top of those: the Horseman's attack, throw, catch
and ride (the rider alone; the ride composites it onto the horse), Krampus's attack (claws), horn and
pull, and the horse's graze, rear and neigh.

Usage, from the plugin folder:  python tools/boss_art.py
Writes art/boss/<pet>/<anim>.png strips, art/boss/contact.png and art/boss/preview.html.
"""
import base64
import io
import json
import math
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "art" / "boss"

OUTLINE = (8, 6, 14, 255)
WHITE = (255, 255, 255, 255)


class Cell:
	"""One frame: a tiny RGBA canvas with pixel-exact drawing and a final outline pass."""

	def __init__(self, w, h, top=0):
		# top: empty rows above the drawing (drawing coordinates start below them).
		self.w, self.h = w, h
		self.top = top
		self.im = Image.new("RGBA", (w, h), (0, 0, 0, 0))
		self.d = ImageDraw.Draw(self.im)

	def px(self, x, y, c):
		x, y = int(round(x)), int(round(y + self.top))
		if 0 <= x < self.w and 0 <= y < self.h:
			self.im.putpixel((x, y), c)

	def rect(self, x0, y0, x1, y1, c):
		self.d.rectangle([round(x0), round(y0 + self.top), round(x1), round(y1 + self.top)], fill=c)

	def ellipse(self, x0, y0, x1, y1, c):
		self.d.ellipse([round(x0), round(y0 + self.top), round(x1), round(y1 + self.top)], fill=c)

	def poly(self, pts, c):
		self.d.polygon([(round(x), round(y + self.top)) for x, y in pts], fill=c)

	def line(self, pts, c, w=1):
		self.d.line([(round(x), round(y + self.top)) for x, y in pts], fill=c, width=w)

	def arc(self, box, a0, a1, c, w=1):
		x0, y0, x1, y1 = box
		self.d.arc([round(x0), round(y0 + self.top), round(x1), round(y1 + self.top)], a0, a1, fill=c, width=w)

	def outline(self, colour=OUTLINE):
		"""A 1 px outline around everything opaque (4-neighbour dilation), under the art."""
		src = self.im
		px = src.getchannel("A").load()
		out = Image.new("RGBA", src.size, (0, 0, 0, 0))
		op = out.load()
		for y in range(self.h):
			for x in range(self.w):
				if px[x, y] > 0:
					continue
				for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
					nx, ny = x + dx, y + dy
					if 0 <= nx < self.w and 0 <= ny < self.h and px[nx, ny] > 0:
						op[x, y] = colour
						break
		out.alpha_composite(src)
		self.im = out
		self.d = ImageDraw.Draw(self.im)
		return self


def strip(frames):
	w, h = frames[0].size
	s = Image.new("RGBA", (w * len(frames), h), (0, 0, 0, 0))
	for i, f in enumerate(frames):
		s.paste(f, (i * w, 0))
	return s


def sink(im, rows):
	"""The frame pushed down into the floor by `rows` pixels: what goes under the floor is gone."""
	out = Image.new("RGBA", im.size, (0, 0, 0, 0))
	out.alpha_composite(im.crop((0, 0, im.width, im.height - rows)), (0, rows))
	return out


def faded(im, alpha):
	out = im.copy()
	a = out.getchannel("A").point(lambda v: int(v * alpha))
	out.putalpha(a)
	return out


def cyc(n, amp, phase=0.0):
	"""n whole-pixel offsets round one sine cycle."""
	return [round(amp * math.sin(i / n * math.tau + phase)) for i in range(n)]


# ---------------------------------------------------------------- Headless Horseman (64x48)

CLOAK = (42, 33, 64, 255)
CLOAK_L = (62, 50, 92, 255)
CLOAK_D = (28, 21, 44, 255)
HOLE = (11, 10, 18, 255)
BELT = (104, 72, 40, 255)
GOLD = (236, 190, 70, 255)
BOOT = (24, 19, 30, 255)
PUMP = (226, 124, 28, 255)
PUMP_D = (184, 92, 16, 255)
GLOW = (255, 214, 74, 255)
GLOW_DIM = (150, 110, 40, 255)
GLOW_HOT = (255, 250, 200, 255)
STEM = (86, 120, 48, 255)
POLE = (92, 60, 36, 255)
STEEL = (200, 206, 220, 255)
STEEL_D = (128, 136, 156, 255)
SMEAR = (222, 228, 240, 150)
SPARK = (255, 255, 255, 255)

HM_MOUTH = (13, 32)  # the pumpkin's mouth in cell pixels, at rest


def pumpkin(c, x, y, face="grin", glow=1, stem=True):
	col = {0: GLOW_DIM, 1: GLOW, 2: GLOW_HOT}[glow]
	c.ellipse(x - 5, y - 5, x + 5, y + 4, PUMP)
	for rx in (x - 2, x + 2):
		c.line([(rx, y - 4), (rx, y + 3)], PUMP_D)
	if stem:
		c.rect(x - 1, y - 7, x, y - 5, STEM)
	if face == "closed":
		c.line([(x - 3, y - 1), (x - 1, y - 1)], col); c.line([(x + 1, y - 1), (x + 3, y - 1)], col)
		c.line([(x - 2, y + 2), (x + 2, y + 2)], col)
		return
	if face == "wide":
		c.rect(x - 3, y - 3, x - 1, y - 1, col); c.rect(x + 1, y - 3, x + 3, y - 1, col)
	else:
		c.px(x - 3, y - 2, col); c.px(x - 2, y - 1, col)
		c.px(x + 1, y - 2, col); c.px(x + 2, y - 1, col)
	if face == "grin":
		c.line([(x - 3, y + 2), (x + 3, y + 2)], col)
		c.px(x - 1, y + 1, col); c.px(x + 1, y + 1, col)
	elif face == "frown":
		c.line([(x - 3, y + 3), (x + 3, y + 3)], col)
		c.px(x - 2, y + 2, col); c.px(x + 2, y + 2, col)
	elif face == "o":
		c.rect(x - 1, y + 1, x + 1, y + 3, col)
	elif face == "wide":
		c.rect(x - 2, y + 1, x + 2, y + 3, col)


def scythe(c, hx, hy, deg, reach=19, smear=None):
	a = math.radians(deg)
	ex, ey = hx + math.cos(a) * reach, hy + math.sin(a) * reach
	if smear:
		r = reach + 8
		c.arc([hx - r, hy - r, hx + r, hy + r], smear[0], smear[1], SMEAR, 2)
	c.line([(hx - math.cos(a) * 6, hy - math.sin(a) * 6), (ex, ey)], POLE, 2)
	nx, ny = -math.sin(a), math.cos(a)
	tx, ty = math.cos(a), math.sin(a)
	tip = (ex + nx * 11 + tx * 2, ey + ny * 11 + ty * 2)
	back = (ex - tx * 3, ey - ty * 3)
	belly = (ex + nx * 5 - tx * 2, ey + ny * 5 - ty * 2)
	spine = (ex + nx * 6 + tx * 3, ey + ny * 6 + ty * 3)
	c.poly([back, spine, tip, belly], STEEL)
	c.line([back, spine, tip], STEEL_D)
	c.px(ex + nx * 3 + tx, ey + ny * 3 + ty, WHITE)
	return (ex + nx * 6, ey + ny * 6)


def horseman(sway=0, bob=0, boot_l=(0, 0), boot_r=(0, 0), pumpkin_at=None, face="grin", glow=1,
             scythe_deg=-70, reach=19, lean=0, smear=None, held=True, collar_dy=0, spread=0,
             arm_rub=0, sparkle=False, hem_up=0, pumpkin_held=True):
	# A 64-wide cell (like Nyan Cat's): the body sits in the left 48 so the scythe has room to swing
	# forward without leaving the frame. Pet measures the size setting against refW, not the cell.
	c = Cell(64, 48)
	y0 = bob
	for (bx, (dx, dy)) in ((16, boot_l), (25, boot_r)):
		c.rect(bx + dx, 41 + dy + y0, bx + dx + 5, 45 + dy + y0, BOOT)
	# Cape: shoulders to a ragged hem; sway moves the hem sideways, spread widens it, hem_up lifts it.
	hemL, hemR = 10 + sway - spread, 36 + sway + spread
	hy_ = 44 + y0 - hem_up
	hem = [(hemL, hy_)]
	x, k = hemL, 0
	while x < hemR:
		x += 4
		hem.append((min(x, hemR), hy_ + (-2 if k % 2 == 0 else 1)))
		k += 1
	top = 18 + y0 + collar_dy
	c.poly([(17 + lean, top), (29 + lean, top), (hemR, hy_)] + hem[::-1] + [(hemL, hy_)], CLOAK)
	c.poly([(24 + lean, top + 1), (29 + lean, top + 1), (hemR - 2, hy_ - 1), (27 + sway // 2, hy_ - 1)], CLOAK_L)
	c.poly([(17 + lean, top + 1), (20 + lean, top + 1), (hemL + 7, hy_ - 1), (hemL + 1, hy_ - 1)], CLOAK_D)
	# Shoulders and the high, empty collar.
	c.rect(16 + lean, top - 2, 30 + lean, top + 3, CLOAK)
	c.rect(18 + lean, top - 8, 28 + lean, top - 1, CLOAK)
	c.rect(18 + lean, top - 8, 28 + lean, top - 8, CLOAK_L)
	c.rect(20 + lean, top - 7, 26 + lean, top - 3, HOLE)
	# Belt and buckle.
	c.rect(18 + lean, top + 6, 29 + lean, top + 7, BELT)
	c.rect(23 + lean, top + 6, 24 + lean, top + 7, GOLD)
	# Far arm and the pumpkin (at the hip unless placed).
	px_, py_ = pumpkin_at or (12, 30 + y0)
	if pumpkin_held:
		c.line([(18 + lean, top + 3), (px_ + 2, py_ - 4)], CLOAK, 2)
		pumpkin(c, px_, py_, face, glow)
	else:
		c.line([(18 + lean, top + 3), (px_ + 2, py_ - 4)], CLOAK, 2)
	# Near arm, with or without the scythe.
	hx, hy = 31 + lean + arm_rub, 23 + y0 + collar_dy
	c.line([(hx - 2, hy - 2), (hx + 2, hy + 3)], CLOAK, 3)
	if held:
		bx, by = scythe(c, hx, hy, scythe_deg, reach, smear)
		if sparkle:
			c.px(bx, by - 2, SPARK); c.px(bx - 1, by - 1, SPARK); c.px(bx + 1, by - 1, SPARK); c.px(bx, by, SPARK)
	return c.outline().im


def rider(frame):
	"""The Horseman astride (no legs showing, cape over the horse's flank), 64x48 with the seat at the
	cell's bottom middle: the ride composites it on the horse at the saddle, bobbing with the gallop."""
	c = Cell(64, 48)
	bob = [-1, -2, -1, 0, 1, 0][frame % 6]
	y = 44 + bob
	# Cape fans back over the horse's rump.
	c.poly([(26, y - 24), (38, y - 24), (44, y - 2), (22, y - 2), (16 - frame % 2, y - 8)], CLOAK)
	c.poly([(33, y - 23), (38, y - 23), (43, y - 3), (36, y - 3)], CLOAK_L)
	c.rect(25, y - 26, 39, y - 21, CLOAK)
	c.rect(27, y - 32, 37, y - 25, CLOAK)
	c.rect(27, y - 32, 37, y - 32, CLOAK_L)
	c.rect(29, y - 31, 35, y - 27, HOLE)
	c.rect(27, y - 18, 38, y - 17, BELT); c.rect(32, y - 18, 33, y - 17, GOLD)
	pumpkin(c, 21, y - 16, "grin", 2 if frame % 3 == 0 else 1)
	c.line([(39, y - 22), (43, y - 18)], CLOAK, 3)
	scythe(c, 42, y - 18, -60 + [0, 3, 5, 3, 0, -2][frame % 6], 18)
	return c.outline().im


def horseman_anims():
	A = {}
	A["idle"] = ([horseman(sway=s, pumpkin_at=(12, 30 + p), scythe_deg=d) for s, p, d in ((0, 0, -70), (1, -1, -67), (0, 0, -70), (-1, 0, -73))], 4)
	walk = []
	for i in range(6):
		ph = i / 6 * math.tau
		l = (round(3 * math.sin(ph)), -1 if math.sin(ph) > 0.5 else 0)
		r = (round(3 * math.sin(ph + math.pi)), -1 if math.sin(ph + math.pi) > 0.5 else 0)
		walk.append(horseman(sway=round(2 * math.sin(ph + 0.6)), bob=-1 if i % 3 == 1 else 0, boot_l=l, boot_r=r, scythe_deg=-73 + round(3 * math.sin(ph))))
	A["walk"] = (walk, 8)
	A["attack"] = ([
		horseman(scythe_deg=-100, lean=-1),
		horseman(scythe_deg=-120, lean=-2, sway=-1),
		horseman(scythe_deg=-65, lean=1, smear=(-120, -65), reach=20),
		horseman(scythe_deg=-10, lean=2, sway=2, smear=(-65, -10), reach=20),
		horseman(scythe_deg=35, lean=2, sway=2, smear=(-10, 35), reach=20),
		horseman(scythe_deg=0, lean=1, sway=1),
	], 10)
	# Throw: wind back, release; the hand is empty from frame 4 (Projectile.kt draws the flying one).
	A["throw"] = ([
		horseman(scythe_deg=-110, lean=-1),
		horseman(scythe_deg=-140, lean=-2, sway=-2),
		horseman(scythe_deg=-150, lean=-2, sway=-2),
		horseman(scythe_deg=-40, lean=2, sway=2, smear=(-150, -40), reach=20),
		horseman(held=False, lean=2, sway=2),
		horseman(held=False, lean=1, sway=1),
	], 10)
	# Lob: the jack-o'-lantern goes up over his shoulder and is hurled forward (gone from frame 5; the
	# effect draws it flying), then a new one flares up at his hip.
	A["lob"] = ([
		horseman(pumpkin_at=(12, 26), glow=2),
		horseman(pumpkin_at=(11, 19), lean=-1, glow=2, scythe_deg=-75),
		horseman(pumpkin_at=(13, 12), lean=-2, sway=-1, glow=2, face="wide", scythe_deg=-80),
		horseman(pumpkin_at=(16, 9), lean=-2, sway=-1, glow=2, face="wide", scythe_deg=-80),
		horseman(pumpkin_at=(26, 12), lean=1, sway=1, glow=2, face="wide", scythe_deg=-60),
		horseman(pumpkin_held=False, pumpkin_at=(30, 18), lean=2, sway=2, scythe_deg=-55),
		horseman(pumpkin_held=False, pumpkin_at=(16, 28), lean=1, sway=1),
		horseman(pumpkin_held=False, pumpkin_at=(13, 30)),
		horseman(pumpkin_at=(12, 30), glow=0, face="closed"),
		horseman(pumpkin_at=(12, 30), glow=2, face="wide"),
		horseman(pumpkin_at=(12, 30), glow=1),
	], 10)
	# Reap: the scythe goes up high, the pumpkin blazes, then one slow sweep down.
	A["reap"] = ([
		horseman(scythe_deg=-90, reach=20, glow=1),
		horseman(scythe_deg=-110, reach=20, lean=-1, glow=2, face="wide", collar_dy=-1),
		horseman(scythe_deg=-120, reach=20, lean=-2, glow=2, face="wide", collar_dy=-1, spread=1),
		horseman(scythe_deg=-120, reach=20, lean=-2, glow=2, face="wide", collar_dy=-1, spread=2, sparkle=True),
		horseman(scythe_deg=-120, reach=20, lean=-2, glow=2, face="wide", collar_dy=-1, spread=2),
		horseman(scythe_deg=-60, reach=20, lean=1, glow=2, face="wide", smear=(-120, -60), spread=1),
		horseman(scythe_deg=0, reach=20, lean=2, sway=2, glow=2, face="grin", smear=(-60, 0)),
		horseman(scythe_deg=20, reach=19, lean=2, sway=2, glow=1),
		horseman(scythe_deg=10, reach=19, lean=1, sway=1, glow=1),
		horseman(scythe_deg=-30, reach=19, glow=1),
	], 8)
	A["catch"] = ([
		horseman(held=False, lean=1, collar_dy=-1),
		horseman(held=False, lean=1, collar_dy=-1),
		horseman(scythe_deg=-40, lean=1, sway=1, reach=16),
		horseman(scythe_deg=-70, sway=0),
	], 10)
	# Takeoff: crouch, then stretch up with the cape trailing; held on the last frame mid-air.
	A["takeoff"] = ([
		horseman(bob=1, spread=1), horseman(bob=2, spread=2, collar_dy=1), horseman(bob=3, spread=3, collar_dy=2),
		horseman(bob=0, spread=0), horseman(bob=-2, spread=-2, hem_up=2, sway=-1), horseman(bob=-3, spread=-3, hem_up=3, sway=-2),
		horseman(bob=-3, spread=-3, hem_up=3, sway=-2), horseman(bob=-3, spread=-2, hem_up=2, sway=-1),
	], 10)
	# Outro: he sinks into the floor, cape pooling, the pumpkin's grin the last thing to go.
	outro = []
	for i in range(12):
		s = min(46, round(i * i * 0.42))
		f = horseman(spread=min(4, i // 2), collar_dy=min(3, i // 3), glow=2 if i >= 9 else 1, face="wide" if i >= 10 else "grin")
		outro.append(sink(f, s))
	A["outro"] = (outro, 8)
	A["spin"] = ([horseman(sway=cyc(8, 3)[i], spread=2, hem_up=1, scythe_deg=-70 + i * 45) for i in range(8)], 10)
	# Rest: hunched, cape spread on the floor, scythe laid across the knees, pumpkin set down.
	A["rest"] = ([horseman(bob=3, spread=4, collar_dy=2 + (1 if (i // 3) % 2 else 0), scythe_deg=-8, reach=14, pumpkin_at=(10, 40), face="closed", glow=0 if i % 6 < 3 else 1) for i in range(12)], 3)
	A["sad"] = ([horseman(collar_dy=2, lean=-1, scythe_deg=-50, reach=16, face="frown", glow=0 if i % 4 == 0 else 1, pumpkin_at=(12, 31 + (1 if i % 6 >= 3 else 0))) for i in range(12)], 3)
	A["low"] = ([faded(horseman(collar_dy=3, scythe_deg=-45, reach=15, face="frown", glow=0), 0.55 if i % 4 else 0.4) for i in range(8)], 3)
	A["charge"] = ([horseman(face="grin", glow=[0, 0, 1, 1, 2, 2, 2, 1, 1, 0][i], pumpkin_at=(13, 27)) for i in range(10)], 5)
	A["happy"] = ([horseman(bob=[0, -2, -3, -2, 0, 0, -1, 0][i], pumpkin_at=(13, 25 + [0, -2, -3, -2, 0, 0, -1, 0][i]), face="wide", glow=2 if i % 2 else 1, scythe_deg=-70 + [0, 10, 20, 10, 0, -5, -10, -5][i]) for i in range(8)], 8)
	A["startle"] = ([horseman(bob=[0, -4, -5, -4, -2, 0, 0, 0, 0, 0, 0, 0][i], lean=[0, -2, -2, -2, -1, 0, 0, 0, 0, 0, 0, 0][i], spread=[0, 3, 3, 2, 1, 0, 0, 0, 0, 0, 0, 0][i], face="wide" if i < 8 else "grin", glow=2 if 1 <= i <= 4 else 1, scythe_deg=-70 + [0, -25, -30, -25, -15, -5, 0, 0, 0, 0, 0, 0][i]) for i in range(12)], 10)
	A["dizzy"] = ([horseman(sway=cyc(16, 3)[i], lean=cyc(16, 2, 1.5)[i], collar_dy=1, scythe_deg=-70 + cyc(16, 20, 0.7)[i], face="o") for i in range(16)], 8)
	A["reaction"] = ([horseman(collar_dy=-1, pumpkin_at=(13, 27 + [0, -1, -2, -2, -1, 0, 0, 0][i]), face="wide", glow=2 if i in (2, 3) else 1) for i in range(8)], 6)
	# Blow: the pumpkin is held up in front; bubbles leave its mouth (frames 6, 10, 12 per SheetLook).
	blow = []
	for i in range(18):
		lift = min(8, i * 2) if i < 14 else max(0, 8 - (i - 13) * 2)
		face = "o" if 3 <= i <= 13 else "grin"
		blow.append(horseman(pumpkin_at=(13 + lift // 2, 30 - lift), face=face, glow=2 if i in (5, 6, 9, 10, 12) else 1, scythe_deg=-80))
	A["blow"] = (blow, 8)
	# Look: the pumpkin is turned left, front, right (its face reads the direction), then back.
	look = []
	for i, (dx, face) in enumerate([(0, "grin"), (0, "grin"), (-1, "closed"), (-1, "closed"), (-1, "closed"), (0, "grin"), (0, "grin"), (1, "wide"), (1, "wide"), (1, "wide"), (1, "wide"), (0, "grin"), (0, "grin"), (0, "grin")]):
		look.append(horseman(lean=dx, pumpkin_at=(12 + dx, 30), face=face, scythe_deg=-70 - dx * 5))
	A["look"] = (look, 8)
	# Hang: Pet turns this upside down; the cape is drawn gathered (gravity is the other way up).
	A["hang"] = ([horseman(spread=-3, hem_up=2 + (1 if i % 4 >= 2 else 0), pumpkin_at=(13, 27), scythe_deg=-85, reach=16) for i in range(8)], 6)
	# Fidget: polishes the blade with his sleeve.
	A["fidget"] = ([horseman(scythe_deg=-20, reach=15, arm_rub=[0, 1, 2, 1, 0, -1, 0, 1][i % 8], sparkle=i >= 8 and i % 3 == 0, face="grin") for i in range(16)], 6)
	A["ride"] = ([rider(i) for i in range(6)], 10)
	return A


# ---------------------------------------------------------------- Krampus (48x59)

FUR = (58, 40, 36, 255)
FUR_L = (92, 66, 56, 255)
FUR_D = (40, 27, 25, 255)
HOOF = (20, 16, 20, 255)
HORN = (232, 218, 192, 255)
HORN_D = (176, 158, 128, 255)
EYE = (255, 212, 0, 255)
EYE_HOT = (255, 250, 150, 255)
PUPIL = (200, 30, 30, 255)
TONGUE = (216, 50, 60, 255)
TONGUE_D = (160, 30, 44, 255)
CHAIN = (156, 162, 176, 255)
CHAIN_D = (96, 100, 114, 255)
BELL = (236, 190, 70, 255)
CLAW = (242, 242, 242, 255)
STREAK = (255, 255, 255, 150)

# The horns reach above row 0 (and further on a jump), so the cell has KR_TOP empty rows on top;
# drawing coordinates below are unchanged, cell points (KR_MOUTH, Boss.kt's) include it.
KR_TOP = 11
KR_MOUTH = (36, 16 + KR_TOP)


def krampus(breathe=0, bob=0, leg_l=(0, 0), leg_r=(0, 0), tongue=0, arm_deg=35, streak=False, lean=0,
            eyes="open", mouth="none", horns_dy=0, chain_dx=0, head_dy=0, crouch=0, chain_out=None, bell=False,
            tongue_out=True):
	c = Cell(48, 48 + KR_TOP, KR_TOP)
	y0 = bob
	for (hip, (dx, lift)) in ((20, leg_l), (28, leg_r)):
		knee = (hip - 3 + dx // 2, 38 + y0 - lift + crouch)
		hoof = (hip + 2 + dx, 45 + y0 - lift)
		c.line([(hip, 31 + y0 + crouch), knee], FUR, 3)
		c.line([knee, hoof], FUR_D, 2)
		c.rect(hoof[0] - 1, hoof[1] - 1, hoof[0] + 2, hoof[1] + 1, HOOF)
	# Far arm, behind the body; holds the chain out when asked.
	if chain_out:
		ex, ey = chain_out
		c.line([(18 + lean, 20 + y0), (ex, ey)], FUR_D, 3)
	else:
		c.line([(18 + lean, 20 + y0), (12 + lean, 30 + y0)], FUR_D, 3)
	ty = y0 + crouch
	c.ellipse(16 + lean, 16 + ty - breathe, 32 + lean, 33 + y0, FUR)
	c.ellipse(20 + lean, 21 + ty, 30 + lean, 32 + y0, FUR_L)
	for sy in range(17, 30, 4):
		c.poly([(17 + lean, sy + ty), (13 + lean, sy + 1 + ty), (17 + lean, sy + 3 + ty)], FUR)
	c.poly([(20 + lean, 16 + ty - breathe), (18 + lean, 12 + ty - breathe), (24 + lean, 15 + ty - breathe)], FUR)
	# The chain across the chest (or out along the far arm).
	if chain_out:
		ex, ey = chain_out
		sx, sy = 18 + lean, 20 + y0
		n = max(4, int(math.hypot(ex - sx, ey - sy) / 3))
		for i in range(n + 1):
			t = i / n
			lx, ly = sx + (ex - sx) * t, sy + (ey - sy) * t + math.sin(t * math.pi) * 2
			c.ellipse(lx - 1, ly - 1, lx + 1, ly + 1, CHAIN if i % 2 == 0 else CHAIN_D)
		if bell:
			c.ellipse(ex - 2, ey - 1, ex + 2, ey + 3, BELL); c.px(ex, ey + 3, HOOF)
	else:
		for i in range(7):
			t = i / 6
			lx = 17 + lean + 14 * t + (chain_dx if 0 < i < 6 else 0)
			ly = 18 + ty + 12 * t
			c.ellipse(lx - 1, ly - 1, lx + 1, ly + 1, CHAIN if i % 2 == 0 else CHAIN_D)
	# Head, muzzle, eyes, horns.
	hx, hy = 28 + lean, 11 + ty - breathe + head_dy
	c.ellipse(hx - 6, hy - 6, hx + 6, hy + 6, FUR)
	c.ellipse(hx + 1, hy, hx + 9, hy + 6, FUR_L)
	for ex0 in (hx + 1, hx + 5):
		if eyes == "closed":
			c.line([(ex0, hy - 1), (ex0 + 1, hy - 1)], HOOF)
		elif eyes == "wide":
			c.rect(ex0 - 1, hy - 3, ex0 + 1, hy - 1, EYE_HOT); c.px(ex0 + 1, hy - 1, PUPIL)
		elif eyes == "glow":
			c.rect(ex0, hy - 2, ex0 + 1, hy - 1, EYE_HOT); c.px(ex0 + 1, hy - 1, PUPIL)
		elif eyes == "cross":
			c.px(ex0, hy - 2, HOOF); c.px(ex0 + 1, hy - 1, HOOF); c.px(ex0 + 1, hy - 2, HOOF); c.px(ex0, hy - 1, HOOF)
		else:
			c.rect(ex0, hy - 2, ex0 + 1, hy - 1, EYE); c.px(ex0 + 1, hy - 1, PUPIL)
	c.px(hx + 8, hy + 2, HOOF)
	for sx in (hx - 3, hx + 2):
		pts = [(sx, hy - 5), (sx - 1, hy - 9 + horns_dy), (sx - 4, hy - 12 + horns_dy), (sx - 8, hy - 11 + horns_dy)]
		c.line(pts, HORN, 2)
		c.line([pts[1], pts[2]], HORN_D, 1)
	mx, my = hx + 7, hy + 5
	if mouth == "o":
		c.rect(mx + 1, my - 1, mx + 2, my + 1, HOOF); c.px(mx + 1, my, TONGUE)
	elif mouth == "frown":
		c.line([(mx, my + 1), (mx + 3, my)], HOOF)
	elif mouth == "grin":
		c.line([(mx - 1, my), (mx + 3, my)], HOOF); c.px(mx, my + 1, CLAW); c.px(mx + 2, my + 1, CLAW)
	if tongue_out and mouth != "o":
		c.line([(mx + 1, my), (mx + 1 + tongue // 2, my + 4), (mx + 1 + tongue, my + 7)], TONGUE, 2)
		c.px(mx + 1 + tongue, my + 8, TONGUE)
		c.px(mx + 1 + tongue // 2, my + 4, TONGUE_D)
	# Near arm with claws (0 = straight down, 90 = straight forward, negative = back/up).
	a = math.radians(arm_deg)
	sx, sy = 30 + lean, 20 + ty
	ex, ey = sx + math.sin(a) * 11, sy + math.cos(a) * 11
	if streak:
		for k in (-3, 0, 3):
			c.line([(ex + 2 + k, ey - 8), (ex + 9 + k, ey + 2)], STREAK, 1)
	c.line([(sx, sy), (ex, ey)], FUR, 3)
	for k in (-2, 0, 2):
		c.line([(ex + 1, ey + k * 0.6), (ex + 4, ey + 1 + k)], CLAW, 1)
	return c.outline().im


def krampus_anims():
	A = {}
	A["idle"] = ([krampus(breathe=b, tongue=t) for b, t in ((0, 0), (1, 1), (0, 2), (0, 1))], 4)
	walk = []
	for i in range(6):
		ph = i / 6 * math.tau
		l = (round(3 * math.sin(ph)), 2 if math.sin(ph) > 0.5 else 0)
		r = (round(3 * math.sin(ph + math.pi)), 2 if math.sin(ph + math.pi) > 0.5 else 0)
		walk.append(krampus(bob=-1 if i % 3 == 1 else 0, leg_l=l, leg_r=r, tongue=round(2 * math.sin(ph)), arm_deg=35 + round(15 * math.sin(ph + math.pi)), chain_dx=round(math.sin(ph))))
	A["walk"] = (walk, 8)
	A["attack"] = ([
		krampus(arm_deg=-40, lean=-1, tongue=1), krampus(arm_deg=-70, lean=-2, tongue=2, eyes="wide"),
		krampus(arm_deg=10, lean=1, tongue=2, streak=True, eyes="wide"), krampus(arm_deg=80, lean=2, tongue=3, streak=True, eyes="wide"),
		krampus(arm_deg=110, lean=2, tongue=2), krampus(arm_deg=60, lean=1, tongue=1),
	], 10)
	# Horn: rears back, then butts forward, head down.
	A["horn"] = ([
		krampus(lean=-1, head_dy=-1, eyes="wide"), krampus(lean=-2, head_dy=-2, crouch=1, eyes="wide"),
		krampus(lean=-2, head_dy=-2, crouch=2, eyes="wide", tongue=0),
		krampus(lean=3, head_dy=3, horns_dy=2, crouch=0, eyes="cross", tongue_out=False, mouth="grin"),
		krampus(lean=3, head_dy=3, horns_dy=2, eyes="cross", tongue_out=False, mouth="grin"),
		krampus(lean=1, head_dy=1, horns_dy=1, eyes="open", tongue=1),
	], 10)
	# Pull: the chain is out and taut; he hauls on it, leaning back a little more each beat.
	A["pull"] = ([krampus(lean=-[0, 1, 2, 2, 1, 0][i], crouch=[0, 1, 2, 2, 1, 0][i], eyes="wide", mouth="grin", tongue_out=False,
	                      chain_out=(44, 10 + [0, 1, 2, 2, 1, 0][i]), arm_deg=-60 + [0, -5, -10, -10, -5, 0][i]) for i in range(6)], 8)
	A["takeoff"] = ([
		krampus(crouch=1, bob=1), krampus(crouch=2, bob=2), krampus(crouch=3, bob=3, eyes="wide"),
		krampus(bob=0, leg_l=(2, 1), leg_r=(-2, 1)), krampus(bob=-2, leg_l=(3, 4), leg_r=(-2, 3), tongue=2, horns_dy=-1),
		krampus(bob=-3, leg_l=(3, 5), leg_r=(-2, 4), tongue=3, horns_dy=-1), krampus(bob=-3, leg_l=(3, 5), leg_r=(-2, 4), tongue=3), krampus(bob=-3, leg_l=(2, 4), leg_r=(-1, 3), tongue=2),
	], 10)
	# Outro: stamps once, then drops through the floor; the horns are the last to go.
	outro = [krampus(crouch=1, bob=1, eyes="wide"), krampus(bob=0, leg_l=(0, 4), eyes="wide", mouth="grin", tongue_out=False), krampus(bob=0, eyes="wide", mouth="grin", tongue_out=False)]
	for i in range(9):
		outro.append(sink(krampus(eyes="wide", mouth="grin", tongue_out=False, arm_deg=-70), min(46, round(2 + i * i * 0.6))))
	A["outro"] = (outro, 8)
	A["spin"] = ([krampus(tongue=cyc(8, 3)[i], chain_dx=cyc(8, 2, 1.2)[i], arm_deg=35 + cyc(8, 40)[i], eyes="wide" if i % 4 < 2 else "open") for i in range(8)], 10)
	A["rest"] = ([krampus(crouch=3, bob=3, eyes="closed", tongue=1 if (i // 3) % 2 else 0, breathe=1 if (i // 3) % 2 else 0, arm_deg=20, horns_dy=1) for i in range(12)], 3)
	A["sad"] = ([krampus(head_dy=2, horns_dy=2, eyes="open", mouth="frown", tongue_out=False, arm_deg=10, lean=-1, breathe=1 if (i // 4) % 2 else 0) for i in range(12)], 3)
	A["low"] = ([faded(krampus(head_dy=3, horns_dy=3, mouth="frown", tongue_out=False, arm_deg=5, crouch=1, eyes="closed" if i % 4 == 3 else "open"), 0.55 if i % 4 else 0.4) for i in range(8)], 3)
	A["charge"] = ([krampus(eyes="glow" if i % 2 else "open", mouth="grin", tongue_out=False, chain_dx=[0, 1, 0, -1, 0, 1, 0, -1, 0, 0][i]) for i in range(10)], 5)
	A["happy"] = ([krampus(bob=[0, -2, -3, -2, 0, 0, -1, 0][i], leg_l=(0, [0, 2, 3, 2, 0, 0, 1, 0][i]), leg_r=(0, [0, 2, 3, 2, 0, 0, 1, 0][i]), tongue=[2, 3, 3, 3, 2, 1, 1, 2][i], mouth="grin", arm_deg=35 + [0, 20, 30, 20, 0, -10, 0, 0][i]) for i in range(8)], 8)
	A["startle"] = ([krampus(bob=[0, -4, -5, -4, -2, 0, 0, 0, 0, 0, 0, 0][i], lean=[0, -2, -2, -2, -1, 0, 0, 0, 0, 0, 0, 0][i], eyes="wide" if i < 8 else "open", mouth="o" if i < 6 else "none", tongue_out=i >= 6, horns_dy=[0, -2, -2, -1, 0, 0, 0, 0, 0, 0, 0, 0][i], arm_deg=35 + [0, -40, -50, -40, -20, 0, 0, 0, 0, 0, 0, 0][i], leg_l=(0, [0, 3, 4, 3, 1, 0, 0, 0, 0, 0, 0, 0][i])) for i in range(12)], 10)
	A["dizzy"] = ([krampus(lean=cyc(16, 2)[i], head_dy=cyc(16, 2, 1.5)[i], horns_dy=cyc(16, 1, 0.8)[i], eyes="cross", tongue=cyc(16, 3, 0.4)[i], mouth="o", arm_deg=35 + cyc(16, 15, 2)[i]) for i in range(16)], 8)
	A["reaction"] = ([krampus(head_dy=[0, -1, -2, -2, -1, 0, 0, 0][i], eyes="wide" if 1 <= i <= 4 else "open", tongue=1, arm_deg=35 - [0, 10, 20, 20, 10, 0, 0, 0][i]) for i in range(8)], 6)
	A["blow"] = ([krampus(mouth="o" if 3 <= i <= 13 else "none", tongue_out=not (3 <= i <= 13), head_dy=-1 if 3 <= i <= 13 else 0, breathe=1 if i in (4, 5, 8, 9, 11, 12) else 0, eyes="closed" if i in (6, 10, 12) else "open") for i in range(18)], 8)
	A["look"] = ([krampus(lean=dx, head_dy=0, eyes="open" if dx >= 0 else "closed", tongue=1 + dx, arm_deg=35 + dx * 10) for dx in [0, 0, -1, -1, -1, -1, 0, 0, 1, 1, 1, 1, 0, 0]], 8)
	A["hang"] = ([krampus(tongue=-1 - (i % 4 == 2), horns_dy=0, arm_deg=20, chain_dx=cyc(8, 1)[i], crouch=1) for i in range(8)], 6)
	# Fidget: rattles the chain, then rings the bell at its end.
	A["fidget"] = ([krampus(chain_out=(10 + cyc(16, 2)[i], 36 + cyc(16, 1, 1.3)[i]), bell=True, arm_deg=20, tongue=1 + (i % 4 == 0), mouth="grin" if i >= 8 else "none", tongue_out=i < 8) for i in range(16)], 6)
	return A


# ---------------------------------------------------------------- The horse (64x48)

COAT = (34, 32, 44, 255)
COAT_L = (52, 49, 66, 255)
COAT_D = (22, 20, 30, 255)
MANE = (78, 42, 96, 255)
MANE_L = (112, 66, 134, 255)
EYE_R = (255, 42, 58, 255)
EYE_G = (255, 138, 144, 255)
BREATH = (200, 200, 220, 120)


def horse(legs, bob=0, head_dy=0, tail=0, stretch=0, head="up", mouth=False, rear=0, eye="open"):
	"""legs: four (dx, lift) pairs for front-near, front-far, back-near, back-far. head: up | down."""
	c = Cell(64, 48)
	y0 = bob
	def leg(x, dx, lift, col, far):
		top = (x, 31 + y0 - (rear if x > 30 else 0))
		knee = (x + dx // 2, 38 + y0 - lift)
		hoof = (x + dx, 45 + y0 - lift)
		c.line([top, knee], col, 3)
		c.line([knee, hoof], col, 2)
		c.rect(hoof[0] - 1, hoof[1], hoof[0] + 2, hoof[1] + 1, HOOF if not far else COAT_D)
	fn, ff, bn, bf = legs
	leg(38, *ff, COAT_D, True)
	leg(16, *bf, COAT_D, True)
	c.line([(14, 22 + y0), (9 + tail, 28 + y0), (6 + tail * 2, 37 + y0)], MANE, 3)
	c.line([(13, 23 + y0), (8 + tail, 29 + y0)], MANE_L, 1)
	# Body; rearing tilts the front up.
	c.poly([(14 - stretch, 26 + y0), (18 - stretch, 19 + y0), (30, 17 + y0 - rear // 2), (46 + stretch, 18 + y0 - rear), (46 + stretch, 30 + y0 - rear), (34, 34 + y0), (18 - stretch, 34 + y0)], COAT)
	c.ellipse(19 - stretch, 20 + y0, 35 + stretch, 27 + y0 - rear // 2, COAT_L)
	if head == "down":
		# Neck reaches down to the grass; head at floor level.
		hd = 22 + head_dy
		c.poly([(40, 21 + y0), (47, 24 + y0), (52, 36 + y0 + hd // 4), (46, 36 + y0 + hd // 4)], COAT)
		hx, hy = 48, 36 + y0 + hd // 4
		c.poly([(hx - 2, hy - 2), (hx + 6, hy - 2), (hx + 12, hy + 6), (hx + 10, hy + 9), (hx + 3, hy + 8), (hx - 2, hy + 4)], COAT)
		c.poly([(hx + 5, hy + 3), (hx + 11, hy + 6), (hx + 10, hy + 8), (hx + 5, hy + 7)], COAT_L)
		c.poly([(hx, hy - 2), (hx + 1, hy - 6), (hx + 4, hy - 2)], COAT)
		c.px(hx + 5, hy + 1, EYE_R); c.px(hx + 6, hy + 1, EYE_R); c.px(hx + 4, hy + 1, EYE_G)
		pts = [(42, 20 + y0), (45, 22 + y0), (47, 26 + y0), (49, 30 + y0), (48, 34 + y0)]
		c.line(pts, MANE, 3); c.line(pts[1:3], MANE_L, 1)
	else:
		hd = head_dy - rear
		c.poly([(40, 21 + y0 - rear), (47, 24 + y0 - rear), (55, 9 + y0 + hd), (48, 6 + y0 + hd)], COAT)
		c.poly([(48, 5 + y0 + hd), (56, 4 + y0 + hd), (63, 11 + y0 + hd), (62, 15 + y0 + hd), (54, 14 + y0 + hd), (49, 12 + y0 + hd)], COAT)
		c.poly([(56, 10 + y0 + hd), (62, 12 + y0 + hd), (61, 15 + y0 + hd), (56, 14 + y0 + hd)], COAT_L)
		c.poly([(50, 4 + y0 + hd), (52, 0 + y0 + hd), (54, 4 + y0 + hd)], COAT)
		if eye == "closed":
			c.line([(54, 8 + y0 + hd), (56, 8 + y0 + hd)], HOOF)
		else:
			c.px(55, 8 + y0 + hd, EYE_R); c.px(56, 8 + y0 + hd, EYE_R); c.px(54, 8 + y0 + hd, EYE_G)
		c.px(61, 12 + y0 + hd, HOOF)
		if mouth:
			c.rect(60, 14 + y0 + hd, 62, 15 + y0 + hd, HOOF)
			c.line([(63, 12 + y0 + hd), (63, 10 + y0 + hd)], BREATH, 2)
		pts = [(42, 20 + y0 - rear), (45, 15 + y0 + hd // 2), (47, 16 + y0 + hd // 2), (50, 10 + y0 + hd), (52, 11 + y0 + hd), (54, 5 + y0 + hd)]
		c.line(pts, MANE, 3)
		c.line(pts[1:4], MANE_L, 1)
	leg(42, *fn, COAT, False)
	leg(20, *bn, COAT, False)
	return c.outline().im


def horse_anims():
	A = {}
	still = ((0, 0), (0, 0), (0, 0), (0, 0))
	A["idle"] = ([horse(still, head_dy=h, tail=t) for h, t in ((0, 0), (1, 1), (0, 2), (0, 1))], 4)
	walk = []
	for i in range(8):
		ph = i / 8 * math.tau
		def sw(off):
			s = math.sin(ph + off)
			return (round(4 * s), 2 if s > 0.3 and math.cos(ph + off) > 0 else 0)
		walk.append(horse((sw(math.pi / 2), sw(3 * math.pi / 2), sw(0), sw(math.pi)), bob=-1 if i % 4 == 2 else 0, head_dy=1 if i % 4 in (1, 2) else 0, tail=1 if i % 8 < 4 else 0))
	A["walk"] = (walk, 8)
	A["gallop"] = ([
		horse(((7, 1), (6, 2), (-7, 1), (-6, 2)), bob=-2, head_dy=-1, tail=2, stretch=2),
		horse(((8, 0), (7, 1), (-8, 0), (-7, 1)), bob=-1, head_dy=-1, tail=2, stretch=3),
		horse(((4, 0), (2, 3), (-3, 0), (-5, 3)), bob=0, head_dy=0, tail=1, stretch=1),
		horse(((-3, 2), (-4, 3), (4, 2), (3, 3)), bob=1, head_dy=1, tail=0, stretch=-1),
		horse(((-5, 3), (-6, 4), (6, 3), (5, 4)), bob=1, head_dy=2, tail=0, stretch=-2),
		horse(((1, 2), (-1, 3), (0, 2), (-2, 3)), bob=0, head_dy=1, tail=1, stretch=0),
	], 10)
	A["graze"] = ([horse(still, head="down", head_dy=[0, 2, 4, 4, 2, 0, -2, 0][i], tail=[0, 0, 1, 1, 2, 2, 1, 0][i]) for i in range(8)], 4)
	# Rear: the front comes up, forelegs paw the air, then it drops back down.
	A["rear"] = ([horse(((2, r), (0, r + 1), (0, 0), (0, 0)), rear=r, bob=-(r // 3), head_dy=-(r // 4), tail=2 if r else 0, mouth=r >= 6) for r in [0, 3, 6, 8, 8, 6, 3, 0]], 8)
	A["neigh"] = ([horse(still, head_dy=[-1, -3, -4, -4, -3, -1][i], mouth=i in (1, 2, 3, 4), tail=1, eye="closed" if i in (2, 3) else "open") for i in range(6)], 8)
	return A


# ---------------------------------------------------------------- output

PETS = [
	("horseman", "Headless Horseman", "Tall cloak, empty collar, jack-o'-lantern under the far arm (its mouth is where bubbles come from), scythe in the near hand. 64x48 cell.", horseman_anims),
	("krampus", "Krampus", "Dark shaggy fur, curled horns, long tongue, goat legs, chain across the chest, claws on the near hand. 48x59 cell (11 rows of headroom for the horns).", krampus_anims),
	("horse", "The horse", "Black coat, red eyes, ragged purple mane and tail. Flames at the hooves are drawn by the ride's trail, not here. 64x48 cell.", horse_anims),
]

NOTES = {
	"idle": "IDLE. Breathing, a wag or a swish.",
	"walk": "WALK, mirrored to face left.",
	"attack": "Wind-up, swing or swipe, recovery. The smear/streaks mark where the screen effect fires.",
	"throw": "The scythe leaves on frame 4; Projectile.kt draws it flying and bouncing from there.",
	"catch": "Hand up, scythe back; plays as the projectile arrives.",
	"takeoff": "JUMP: crouch, launch, held on the last frame while Pet.kt flies the arc.",
	"outro": "OUTRO: leaving. He sinks into the floor, the grin last; Krampus stamps and drops.",
	"spin": "SPIN: Pet.kt rotates the whole pet; this is the body during it.",
	"rest": "SLEEP, 3 fps. Z's are drawn on top by SheetLook.",
	"sad": "SAD, 3 fps.",
	"low": "LOW_BATTERY: faded, battery icon on top.",
	"charge": "CHARGING: glow pulses; bolt icon on top.",
	"happy": "HAPPY: a little hop; sparkles on top.",
	"startle": "SURPRISED / SHAKE: jump back, '!' on top; held on the last frame.",
	"dizzy": "DIZZY: wobble; stars on top.",
	"reaction": "REACTION: looks up at the bubble (heart, !, mail, music) SheetLook draws above.",
	"blow": "BLOW: bubbles hand off at frames 6, 10 and 12 at the mouth point.",
	"look": "LOOK: left, front, right, back.",
	"hang": "HANG: drawn upright; Pet.kt turns it upside down under the status bar.",
	"fidget": "VARIANT: an idle fidget. Polishing the blade; rattling the chain and its bell.",
	"ride": "The rider alone, seat at the bottom middle; the ride composites it onto the galloping horse.",
	"lob": "The pumpkin bomb: the jack-o'-lantern goes overhead and is hurled (gone from frame 5), then a new one flares up.",
	"reap": "The reaping: scythe raised high, the pumpkin blazes, one slow sweep down. Fires the swirl that drains the screen.",
	"horn": "Krampus's head-butt: back, then forward with the horns down. Fires the bulge-and-crack effect.",
	"pull": "Hauling on the chain once the hook has bitten the screen.",
	"gallop": "Stretch and gather, bouncing; the rider sits on it in ride mode.",
	"graze": "Head down to the grass; the rare visit's idle.",
	"rear": "Startled or tapped by the wrong pet: up on its hind legs, then down.",
	"neigh": "Head up, mouth open, a puff of breath.",
}

ORDER = ["idle", "walk", "attack", "throw", "lob", "reap", "catch", "horn", "pull", "gallop", "graze", "rear", "neigh", "takeoff", "outro", "spin",
         "rest", "sad", "low", "charge", "happy", "startle", "dizzy", "reaction", "blow", "look", "hang", "fidget", "ride"]


def data_uri(im):
	buf = io.BytesIO()
	im.save(buf, "PNG")
	return "data:image/png;base64," + base64.b64encode(buf.getvalue()).decode()


def main():
	OUT.mkdir(parents=True, exist_ok=True)
	cards = []
	sheet_rows = []
	for pid, label, blurb, make in PETS:
		anims = make()
		(OUT / pid).mkdir(exist_ok=True)
		for name in sorted(anims, key=ORDER.index):
			frames, fps = anims[name]
			assert len({f.size for f in frames}) == 1, (pid, name)
			s = strip(frames)
			s.save(OUT / pid / f"{name}.png")
			cards.append({"pet": pid, "label": label, "blurb": blurb, "anim": name, "n": len(frames), "fps": fps,
			              "w": frames[0].width, "h": frames[0].height, "note": NOTES.get(name, ""), "src": data_uri(s)})
			sheet_rows.append(s)
	# A contact sheet at 3x for a quick look without a browser.
	scale = 3
	W = max(r.width for r in sheet_rows) * scale
	H = sum(r.height for r in sheet_rows) * scale + 6 * len(sheet_rows)
	contact = Image.new("RGBA", (W, H), (60, 58, 72, 255))
	y = 0
	for r in sheet_rows:
		big = r.resize((r.width * scale, r.height * scale), Image.NEAREST)
		contact.alpha_composite(big, (0, y))
		y += big.height + 6
	contact.save(OUT / "contact.png")

	html = (Path(__file__).parent / "boss_preview_template.html").read_text(encoding="utf-8")
	html = html.replace("/*CARDS*/", json.dumps(cards))
	(OUT / "preview.html").write_text(html, encoding="utf-8")
	print(f"wrote {len(cards)} strips, contact.png and preview.html to {OUT}")


if __name__ == "__main__":
	main()
