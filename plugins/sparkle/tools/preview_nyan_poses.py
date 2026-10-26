"""
Prototypes Nyan Cat poses as images before they go into NyanLook.kt: renders parts from the same
art/nyancat.svg the converter reads, with the pose's tweaks, to art/pose_<name>.png at 10x.

Usage: python tools/preview_nyan_poses.py
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import xml.etree.ElementTree as ET  # noqa: E402

import nyan_parts as NP  # noqa: E402
from PIL import Image  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
OX, OY = 3, 7
CW, CH = NP.W + 6, NP.H + OY + 2
BLACK, GREY, WHITE, CHEEK = "#000000", "#999999", "#FFFFFF", "#FF9999"


def load():
	root = ET.parse(NP.SVG).getroot()
	frames = [e for e in root.iter() if e.get("class") == "cat-frame"]
	out = []
	for f in frames:
		parts = NP.split_frame(f)
		out.append({n: NP.rasterize(parts[n]) for n in NP.PART_ORDER})
	return out


FR = load()


class Canvas:
	def __init__(self):
		self.px = {}

	def set(self, x, y, c):
		if 0 <= x < CW and 0 <= y < CH:
			self.px[(x, y)] = c

	def part(self, frame, name, dx=0, dy=0):
		for (x, y), c in FR[frame][name].items():
			self.set(OX + x + dx, OY + y + dy, c)

	def box(self, name, frame=0, dx=0, dy=0):
		pts = FR[frame][name].keys()
		return (OX + min(x for x, _ in pts) + dx, OY + min(y for _, y in pts) + dy,
				OX + max(x for x, _ in pts) + dx, OY + max(y for _, y in pts) + dy)

	def save(self, name, scale=10):
		img = Image.new("RGBA", (CW * scale, CH * scale), (0, 51, 102, 255))
		for (x, y), c in self.px.items():
			rgb = tuple(int(c[k:k + 2], 16) for k in (1, 3, 5))
			for j in range(scale):
				for i in range(scale):
					img.putpixel((x * scale + i, y * scale + j), rgb + (255,))
		img.save(ROOT / "art" / f"pose_{name}.png")


def closed_eyes(c, hx, hy):
	for name in ("eyeL", "eyeR"):
		x0, y0, _, _ = c.box(name, 0, hx, hy)
		for j in range(2):
			for i in range(2):
				c.set(x0 + i, y0 + j, GREY)
		c.set(x0, y0 + 1, BLACK)
		c.set(x0 + 1, y0 + 1, BLACK)


def curled_sleep(breath=0):
	"""Legs tucked away, the pop-tart resting a pixel lower, the head sunk onto its front with the
	chin down, and the tail wrapped forward along the bottom of the pop-tart."""
	c = Canvas()
	by = 1 + breath
	c.part(0, "body", 0, by)
	bx0, by0, bx1, by1 = c.box("body", 0, 0, by)
	# The tail, wrapped round the bottom: a grey band with an outline, from the back corner forward.
	ty = by1 + 1
	for x in range(bx0 + 1, bx0 + 13):
		c.set(x, ty - 1, BLACK if x == bx0 + 1 else GREY)
		c.set(x, ty, GREY)
		c.set(x, ty + 1, BLACK)
	c.set(bx0 + 13, ty - 1, BLACK)
	c.set(bx0 + 13, ty, BLACK)
	c.set(bx0, ty, BLACK)
	hx, hy = -1, by + 2
	c.part(0, "head", hx, hy)
	c.part(0, "cheekL", hx, hy)
	c.part(0, "cheekR", hx, hy)
	closed_eyes(c, hx, hy)
	return c


def blow(stage):
	"""stage 0: normal, 1: cheeks puffing, 2: cheeks full, 3: the puff (mouth open, head forward)."""
	c = Canvas()
	for i in range(1, 5):
		c.part(0, f"leg{i}", 0, -2)
	c.part(0, "tail")
	c.part(0, "body")
	hx = 1 if stage == 3 else 0
	c.part(0, "head", hx, 0)
	x0, y0, x1, y1 = c.box("head", 0, hx, 0)
	cl = c.box("cheekL", 0, hx, 0)
	cr = c.box("cheekR", 0, hx, 0)
	if stage in (1, 2):
		# Puffed cheeks: the head bulges a pixel (two when full) on both sides at cheek height.
		grow = stage
		for yy in range(cl[1] - 1, cl[3] + 1):
			for g in range(1, grow + 1):
				c.set(x0 - g + 1, yy, GREY)
				c.set(x1 + g - 1, yy, GREY)
			c.set(x0 - grow, yy, BLACK)
			c.set(x1 + grow, yy, BLACK)
		for (bx, by_, ex, ey) in (cl, cr):
			for yy in range(by_, ey + 1):
				for xx in range(bx - (1 if bx < (x0 + x1) / 2 else 0), ex + (1 if bx > (x0 + x1) / 2 else 0) + 1):
					c.set(xx, yy, CHEEK)
	else:
		c.part(0, "cheekL", hx, 0)
		c.part(0, "cheekR", hx, 0)
	# Eyes: squeezed shut while puffing, happy otherwise.
	for name in ("eyeL", "eyeR"):
		ex, ey, _, _ = c.box(name, 0, hx, 0)
		for j in range(2):
			for i in range(2):
				c.set(ex + i, ey + j, GREY)
		if stage in (1, 2):
			c.set(ex, ey + 1, BLACK); c.set(ex + 1, ey + 1, BLACK)
		else:
			c.set(ex, ey + 1, BLACK); c.set(ex + 1, ey, BLACK); c.set(ex + 2, ey + 1, BLACK)
	if stage == 3:
		lx = c.box("eyeL", 0, hx, 0)[0]
		rx = c.box("eyeR", 0, hx, 0)[0]
		ey = c.box("eyeL", 0, hx, 0)[1]
		mx, my = (lx + rx) // 2 + 1, ey + 4
		for (dx, dy) in ((0, 0), (1, 0), (0, 1), (1, 1)):
			c.set(mx + dx, my + dy, BLACK)
		c.set(mx, my, "#FF6680")
	return c


if __name__ == "__main__":
	curled_sleep(0).save("sleep_0")
	curled_sleep(1).save("sleep_1")
	for k in range(4):
		blow(k).save(f"blow_{k}")
	print("wrote art/pose_*.png")
