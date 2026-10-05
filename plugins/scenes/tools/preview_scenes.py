"""
Renders Scenes' shipping AGSL (src/main/kotlin/.../Atmospheres.kt) over a real Discord screenshot on
this PC's GPU, so atmospheres can be judged before they go to the phone.

AGSL is close to GLSL; this translates the few differences (types, `uniform shader`, `.eval()`,
`main`) and runs it with moderngl. Not a substitute for the on-device smoke test
(tests/ScenesShaderSmoke.java), which is what proves the AGSL compiles on Android.

Usage, from the plugin folder:
  python tools/preview_scenes.py <screenshot.png> [--times 2,6] [--strength 0.65] [--out art/previews]
"""
import argparse
import re
from pathlib import Path

import moderngl
import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / "src" / "main" / "kotlin" / "com" / "bleelblep" / "scenes" / "Atmospheres.kt"
NAMES = ["aurora", "nebula", "ocean", "rain", "embers", "forest", "halloween", "thanksgiving", "christmas"]


def replace_eval(src: str) -> str:
	"""`img.eval(X)` -> `texture(img, (X) / size)`, matching X's parentheses."""
	out, i = [], 0
	while True:
		j = src.find("img.eval(", i)
		if j < 0:
			out.append(src[i:])
			return "".join(out)
		out.append(src[i:j])
		k = j + len("img.eval(")
		depth = 1
		while depth:
			depth += {"(": 1, ")": -1}.get(src[k], 0)
			k += 1
		out.append(f"texture(img, ({src[j + len('img.eval('):k - 1]}) / size)")
		i = k


def to_glsl(agsl: str) -> str:
	s = agsl.replace("uniform shader img;", "uniform sampler2D img;")
	s = replace_eval(s)
	for a, b in (("half4", "vec4"), ("half3", "vec3"), ("float4", "vec4"), ("float3", "vec3"), ("float2", "vec2")):
		s = re.sub(rf"\b{a}\b", b, s)
	s = s.replace("vec4 main(vec2 p)", "vec4 agsl_main(vec2 p)")
	return "#version 330\nout vec4 fragColor;\n" + s + """
void main() { fragColor = agsl_main(vec2(gl_FragCoord.x, size.y - gl_FragCoord.y)); }
"""


def main():
	ap = argparse.ArgumentParser()
	ap.add_argument("screenshot")
	ap.add_argument("--times", default="3")
	ap.add_argument("--strength", type=float, default=0.65)
	ap.add_argument("--scale", type=float, default=0.5)
	ap.add_argument("--out", default=str(ROOT / "art" / "previews"))
	args = ap.parse_args()

	text = SOURCE.read_text(encoding="utf-8")
	start = text.index('"""') + 3
	glsl = to_glsl(text[start:text.index('"""', start)])

	shot = Image.open(args.screenshot).convert("RGBA")
	shot = shot.resize((int(shot.width * args.scale), int(shot.height * args.scale)), Image.LANCZOS)
	w, h = shot.size

	ctx = moderngl.create_standalone_context()
	prog = ctx.program(
		vertex_shader="#version 330\nin vec2 pos; void main() { gl_Position = vec4(pos, 0.0, 1.0); }",
		fragment_shader=glsl,
	)
	quad = ctx.buffer(np.array([-1, -1, 1, -1, -1, 1, 1, 1], dtype="f4").tobytes())
	vao = ctx.simple_vertex_array(prog, quad, "pos")
	# Uploaded as-is: row 0 (the image's top) lands at v = 0, so texture(p / size) reads top-down,
	# like Android, where p.y = 0 is the top of the screen.
	tex = ctx.texture((w, h), 4, shot.tobytes())
	tex.filter = (moderngl.LINEAR, moderngl.LINEAR)
	tex.repeat_x = tex.repeat_y = False
	fbo = ctx.simple_framebuffer((w, h))
	fbo.use()
	tex.use(0)

	def set_uniform(name, value):
		if name in prog:
			prog[name].value = value

	set_uniform("img", 0)
	set_uniform("size", (float(w), float(h)))
	set_uniform("density", 3.0 * args.scale)
	set_uniform("strength", args.strength)

	out = Path(args.out)
	out.mkdir(parents=True, exist_ok=True)
	times = [float(t) for t in args.times.split(",")]
	frames = []
	for index, name in enumerate(NAMES):
		row = []
		for t in times:
			set_uniform("scene", float(index))
			set_uniform("time", t)
			vao.render(moderngl.TRIANGLE_STRIP)
			img = Image.frombytes("RGBA", (w, h), fbo.read(components=4)).transpose(Image.FLIP_TOP_BOTTOM)
			img.save(out / f"{name}_t{t:g}.png")
			row.append(img)
		frames.append(row)

	# A contact sheet: the original, then each scene.
	thumb = (w // 2, h // 2)
	cols = 1 + len(NAMES)
	sheet = Image.new("RGBA", (thumb[0] * cols + 8 * (cols - 1), thumb[1] * len(times)), (20, 20, 24, 255))
	for r in range(len(times)):
		sheet.paste(shot.resize(thumb), (0, r * thumb[1]))
		for c, row in enumerate(frames):
			sheet.paste(row[r].resize(thumb), ((c + 1) * (thumb[0] + 8), r * thumb[1]))
	sheet.save(out / "sheet.png")
	print(f"wrote {out / 'sheet.png'} ({len(NAMES)} scenes x {len(times)} times)")


if __name__ == "__main__":
	main()
