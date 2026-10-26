"""
Turns art/nyancat.svg (Gowee/nyancat-svg, frames from iliana/html5nyancat) into exact pixel parts for
the Nyan Cat look, so poses can be built in code instead of drawn by hand.

The SVG is pixel art on a 34 x 21 grid: every shape is a straight-edged polygon (`m`/`M`/`z` with
implicit line-tos) under translate or mirror transforms. Each pixel is filled when its centre is
inside the shape (even-odd), so the result is exact, not a resample.

Parts per frame (the SVG's own groups):
  tail, leg1..leg4, body (pop-tart: crust, frosting, sprinkles, outline),
  head (grey head, outline, nose, mouth), cheekL/cheekR, eyeL/eyeR (black eye + white shine)

Usage:
  python tools/nyan_parts.py            -> writes src/main/kotlin/.../NyanData.kt
  python tools/nyan_parts.py --preview  -> also writes art/nyan_preview.png (all frames, 8x)
"""

import re
import sys
import xml.etree.ElementTree as ET
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SVG = ROOT / "art" / "nyancat.svg"
OUT = ROOT / "src" / "main" / "kotlin" / "com" / "bleelblep" / "sparkle" / "NyanData.kt"
W, H = 34, 21

# Which SVG ids make up each part, within a frame. Ids differ per frame, so parts are found by
# position in the tree instead (see split_frame).


def tag(e):
	return e.tag.split("}")[1]


def parse_transform(t):
	"""-> 2x3 affine (a, b, c, d, e, f) for x' = a x + c y + e, y' = b x + d y + f."""
	m = (1, 0, 0, 1, 0, 0)
	if not t:
		return m
	for name, args in re.findall(r"(\w+)\(([^)]*)\)", t):
		v = [float(x) for x in re.split(r"[\s,]+", args.strip()) if x]
		if name == "translate":
			n = (1, 0, 0, 1, v[0], v[1] if len(v) > 1 else 0)
		elif name == "matrix":
			n = tuple(v)
		elif name == "scale":
			n = (v[0], 0, 0, v[1] if len(v) > 1 else v[0], 0, 0)
		else:
			raise ValueError(name)
		m = compose(m, n)
	return m


def compose(m, n):
	"""m then n applied inside: result(p) = m(n(p))."""
	a, b, c, d, e, f = m
	A, B, C, D, E, F = n
	return (a * A + c * B, b * A + d * B, a * C + c * D, b * C + d * D, a * E + c * F + e, b * E + d * F + f)


def apply(m, x, y):
	a, b, c, d, e, f = m
	return a * x + c * y + e, b * x + d * y + f


def polygons(d):
	"""Path data with m/M/l/L/h/v/z -> list of polygons (lists of points), untransformed."""
	tokens = re.findall(r"[A-Za-z]|-?\d*\.?\d+(?:e-?\d+)?", d)
	polys, cur, cmd, i = [], [], None, 0
	x = y = sx = sy = 0.0
	while i < len(tokens):
		t = tokens[i]
		if re.match(r"[A-Za-z]", t):
			cmd = t
			i += 1
			if cmd in "zZ":
				if cur:
					polys.append(cur)
				cur = []
				x, y = sx, sy
				continue
			first = True
			continue
		if cmd in "mM":
			nx, ny = float(tokens[i]), float(tokens[i + 1])
			i += 2
			if first:
				if cur:
					polys.append(cur)
				x, y = (x + nx, y + ny) if cmd == "m" else (nx, ny)
				sx, sy = x, y
				cur = [(x, y)]
				first = False
			else:  # implicit line-to
				x, y = (x + nx, y + ny) if cmd == "m" else (nx, ny)
				cur.append((x, y))
		elif cmd in "lL":
			nx, ny = float(tokens[i]), float(tokens[i + 1])
			i += 2
			x, y = (x + nx, y + ny) if cmd == "l" else (nx, ny)
			cur.append((x, y))
		elif cmd in "hH":
			v = float(tokens[i]); i += 1
			x = x + v if cmd == "h" else v
			cur.append((x, y))
		elif cmd in "vV":
			v = float(tokens[i]); i += 1
			y = y + v if cmd == "v" else v
			cur.append((x, y))
		else:
			raise ValueError(cmd)
	if cur:
		polys.append(cur)
	return polys


def inside(polys, px, py):
	hit = False
	for poly in polys:
		n = len(poly)
		for k in range(n):
			x1, y1 = poly[k]
			x2, y2 = poly[(k + 1) % n]
			if (y1 > py) != (y2 > py):
				xi = x1 + (py - y1) * (x2 - x1) / (y2 - y1)
				if xi > px:
					hit = not hit
	return hit


def fill_of(e):
	st = e.get("style") or ""
	m = re.search(r"fill:(#[0-9a-fA-F]{6})", st)
	return (m.group(1) if m else e.get("fill") or "").upper()


def rasterize(shapes):
	"""[(matrix, d, fill)] in paint order -> {(x, y): '#RRGGBB'} on the 34 x 21 grid."""
	px = {}
	for m, d, fill in shapes:
		if not fill or fill == "NONE":
			continue
		polys = [[apply(m, x, y) for x, y in p] for p in polygons(d)]
		xs = [x for p in polys for x, _ in p]
		ys = [y for p in polys for _, y in p]
		for gy in range(max(0, int(min(ys)) - 1), min(H, int(max(ys)) + 2)):
			for gx in range(max(0, int(min(xs)) - 1), min(W, int(max(xs)) + 2)):
				if inside(polys, gx + 0.5, gy + 0.5):
					px[(gx, gy)] = fill
	return px


def collect(e, m, out):
	m = compose(m, parse_transform(e.get("transform")))
	if tag(e) == "path" and e.get("d"):
		out.append((m, e.get("d"), fill_of(e)))
	for c in e:
		collect(c, m, out)


def fills_in(e):
	return {fill_of(x) for x in e.iter() if tag(x) == "path" and fill_of(x)}


def split_frame(frame):
	"""-> {part: [(matrix, d, fill)]}. Frames nest and order their groups differently, so parts are
	recognised by content: the body has the crust colour, the head holds the eye groups (white
	shine), and the plain black/grey groups are legs (touching the bottom rows) or the tail."""
	parts = {name: [] for name in PART_ORDER}
	limbs = []

	def visit(e, m):
		m = compose(m, parse_transform(e.get("transform")))
		kids = list(e)
		if "#FFCC99" in fills_in(e) and not any("#FFFFFF" in fills_in(k) for k in kids):
			collect_children(e, m, parts["body"])
			return
		eye_groups = [k for k in kids if tag(k) == "g" and "#FFFFFF" in fills_in(k)]
		if len(eye_groups) >= 2 and all(tag(k) in ("path", "g") for k in kids) and not any("#FFCC99" in fills_in(k) for k in kids):
			cheeks = eyes = 0
			for k in kids:
				if tag(k) == "g":
					collect(k, m, parts["eyeL" if eyes == 0 else "eyeR"])
					eyes += 1
				elif fill_of(k) == "#FF9999":
					collect(k, m, parts["cheekL" if cheeks == 0 else "cheekR"])
					cheeks += 1
				else:
					collect(k, m, parts["head"])
			return
		if kids and all(tag(k) == "path" for k in kids) and fills_in(e) <= {"#000000", "#999999"}:
			shapes = []
			collect_children(e, m, shapes)
			limbs.append(shapes)
			return
		for k in kids:
			visit(k, m)

	def collect_children(e, m, out):
		for k in e:
			collect(k, m, out)

	visit(frame, (1, 0, 0, 1, 0, 0))
	legs, tails = [], []
	for shapes in limbs:
		px = rasterize(shapes)
		if not px:
			continue
		ys = [y for _, y in px]
		xs = [x for x, _ in px]
		(legs if max(ys) >= H - 3 else tails).append((min(xs), shapes))
	legs.sort(key=lambda t: t[0])
	for i, (_, shapes) in enumerate(legs[:4]):
		parts[f"leg{i + 1}"] = shapes
	for _, shapes in tails:
		parts["tail"] += shapes
	return parts


PART_ORDER = ["tail", "leg1", "leg2", "leg3", "leg4", "body", "head", "cheekL", "cheekR", "eyeL", "eyeR"]


def main():
	root = ET.parse(SVG).getroot()
	frames = [e for e in root.iter() if e.get("class") == "cat-frame"]
	data = []
	palette = []
	for f in frames:
		parts = split_frame(f)
		frame = {}
		for name in PART_ORDER:
			px = rasterize(parts[name])
			for col in px.values():
				if col not in palette:
					palette.append(col)
			frame[name] = px
		data.append(frame)

	# Kotlin: each part is a list of "x,y,colourIndex" packed as ints: (x shl 16) or (y shl 8) or c.
	lines = [
		"// GENERATED by tools/nyan_parts.py from art/nyancat.svg -- do not edit by hand.",
		"// Nyan Cat (c) Chris Torres. Frames: iliana/html5nyancat via Gowee/nyancat-svg. Local use only.",
		"",
		"package com.bleelblep.sparkle",
		"",
		"internal object NyanData {",
		f"\tconst val W = {W}",
		f"\tconst val H = {H}",
		"\tval palette = intArrayOf(" + ", ".join("0xFF" + c[1:] + ".toInt()" for c in palette) + ")",
		f"\tval parts = arrayOf({', '.join(repr(p).replace(chr(39), chr(34)) for p in PART_ORDER)})",
		"",
		"\t/** frames[f][part] = pixels packed (x shl 16) or (y shl 8) or paletteIndex, in paint order. */",
		"\tval frames: Array<Array<IntArray>> = arrayOf(",
	]
	for frame in data:
		lines.append("\t\tarrayOf(")
		for name in PART_ORDER:
			vals = [(x << 16) | (y << 8) | palette.index(c) for (x, y), c in sorted(frame[name].items(), key=lambda kv: (kv[0][1], kv[0][0]))]
			lines.append("\t\t\tintArrayOf(" + ", ".join(str(v) for v in vals) + "),")
		lines.append("\t\t),")
	lines += ["\t)", "}", ""]
	OUT.write_text("\n".join(lines), encoding="utf-8")
	print(f"wrote {OUT.name}: {len(data)} frames, {len(palette)} colours")

	if "--preview" in sys.argv:
		from PIL import Image
		S = 8
		img = Image.new("RGBA", ((W + 2) * S * len(data), (H + 2) * S), (0, 51, 102, 255))
		for i, frame in enumerate(data):
			for name in PART_ORDER:
				for (x, y), c in frame[name].items():
					rgb = tuple(int(c[k:k + 2], 16) for k in (1, 3, 5))
					for dy in range(S):
						for dx in range(S):
							img.putpixel(((i * (W + 2) + 1 + x) * S + dx, (1 + y) * S + dy), rgb + (255,))
		img.save(ROOT / "art" / "nyan_preview.png")
		print("wrote art/nyan_preview.png")


if __name__ == "__main__":
	main()
