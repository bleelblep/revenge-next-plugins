"""Builds SeasonalData.kt from art/seasonal/src (CC0/CC-BY sprite sources).

Four seasonal pets, one per holiday, following the SheetLook model: each pet is
cropped to one box across all its frames, scaled so its width is REF_W cell
pixels, and packed into horizontal strips. The strips are re-encoded as palette
PNGs and embedded as base64 in SeasonalData.kt.

Sources (all transparent PNGs):
  ghost   - "Ghost animated" by LetargicDev, OpenGameArt. CC0. (walk cycle)
  turkey  - "16x Turkeys" by Viergacht, OpenGameArt. CC0. (idle + walk rows)
  snowman - "Snowman Character" by pechvogel, OpenGameArt. CC-BY 3.0. (idle + walk)
  dragon  - "Flappy Dragon Sprite Sheets" by bevouliin.com, OpenGameArt. CC0. (flying)

Usage, from the plugin folder:  python tools/build_seasonal.py
"""
import base64
import io
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "art" / "seasonal" / "src"
OUT = ROOT / "art" / "seasonal"
KT = ROOT / "src" / "main" / "kotlin" / "com" / "bleelblep" / "sparkle" / "SeasonalData.kt"

# Every seasonal pet's character width, in cell pixels, after scaling (matches
# SheetLook.SEASONAL_REF_W). The height follows each source's aspect ratio.
REF_W = 48
NEAREST = Image.Resampling.NEAREST
CHUNK = 60000
MOUTHS = {}
# Pets scaled by a whole number (as near REF_W wide as that gets) instead of to exactly REF_W: an
# uneven scale makes pixel art lumpy, art pixels landing one or two cell pixels wide. SheetLook sizes
# seasonal pets by their own width, so they still show at the same size.
INTEGER_SCALE = set()


def open_rgba(path: Path) -> Image.Image:
    return Image.open(path).convert("RGBA")


def gif_frames(path: Path) -> list[Image.Image]:
    """Every frame of an animated GIF, as RGBA images."""
    im = Image.open(path)
    out = []
    for i in range(getattr(im, "n_frames", 1)):
        im.seek(i)
        out.append(im.convert("RGBA").copy())
    return out


def sheet_cells(path: Path, cell: int, cells: list[tuple[int, int]]) -> list[Image.Image]:
    """Grid cells (col, row) of a square-cell sprite sheet, as RGBA images."""
    im = open_rgba(path)
    return [im.crop((c * cell, r * cell, (c + 1) * cell, (r + 1) * cell)) for c, r in cells]


def snowman_frames(kind: str) -> list[Image.Image]:
    folder = SRC / "snowman" / kind
    return [open_rgba(p) for p in sorted(folder.glob("*.png"))]


def dragon_frames() -> list[Image.Image]:
    return [open_rgba(p) for p in sorted((SRC / "dragon").glob("frame-*.png"))]


def ghost_frames() -> list[Image.Image]:
    return gif_frames(SRC / "ghost" / "ghost_walk.gif")


def turkey_frames(rows: list[int]) -> list[Image.Image]:
    """The walking turkeys sit on grid rows of 48px cells; each row is one animation."""
    sheet = SRC / "turkey" / "turkey-sprite-sheet.png"
    cells = [(col, row) for row in rows for col in (1, 3, 5, 7, 9, 11)]
    frames = sheet_cells(sheet, 48, cells)
    return [f for f in frames if f.getbbox()]


# id -> (display name, {sheet name -> source frames})
PETS: list[tuple[str, str, dict[str, list[Image.Image]]]] = [
    ("ghost", "Ghost", {
        "idle": ghost_frames(),
        "walk": ghost_frames(),
    }),
    ("turkey", "Turkey", {
        "idle": turkey_frames([1]),
        "walk": turkey_frames([5]),
    }),
    ("snowman", "Snowman", {
        "idle": snowman_frames("Idle"),
        "walk": snowman_frames("Walk"),
    }),
    ("dragon", "Dragon", {
        "idle": dragon_frames(),
        "walk": dragon_frames(),
    }),
]


def build_pet(pid: str, name: str, frames: dict[str, list[Image.Image]]):
    """Crop every frame to one union box, scale to REF_W wide, and write strips."""
    all_frames = [f for fs in frames.values() for f in fs]
    box = None
    for f in all_frames:
        b = f.getbbox()
        if not b:
            continue
        box = b if box is None else (
            min(box[0], b[0]), min(box[1], b[1]), max(box[2], b[2]), max(box[3], b[3]),
        )
    assert box, pid
    x0, y0, x1, y1 = box
    w, h = x1 - x0, y1 - y0
    # A source far bigger than REF_W (the dragon's painted frames) keeps the plain scale-down.
    if pid in INTEGER_SCALE and w <= REF_W * 1.5:
        k = max(1, round(REF_W / w))
        new_w, new_h = w * k, h * k
    else:
        new_w, new_h = REF_W, max(1, round(h * REF_W / w))
    folder = OUT / pid
    folder.mkdir(parents=True, exist_ok=True)

    strips = {}
    if pid in MOUTHS:
        mx, my = MOUTHS[pid]
        MOUTHS[pid] = ((mx-x0+0.5)*new_w/w, (my-y0+0.5)*new_h/h)
    for sheet_name, fs in frames.items():
        strip = Image.new("RGBA", (new_w * len(fs), new_h), (0, 0, 0, 0))
        for i, f in enumerate(fs):
            cell = f.crop(box).resize((new_w, new_h), NEAREST)
            assert cell.getbbox(), (pid, sheet_name, i)
            strip.alpha_composite(cell, (i * new_w, 0))
        strip.save(folder / f"{sheet_name}.png", optimize=True)
        buf = io.BytesIO()
        strip.save(buf, "PNG", optimize=True)
        data = base64.b64encode(buf.getvalue()).decode("ascii")
        chunks = ", ".join(f'"{data[j:j + CHUNK]}"' for j in range(0, len(data), CHUNK))
        strips[sheet_name] = f"({len(fs)} to arrayOf({chunks}))"
    return pid, name, new_w, new_h, strips


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    lines = [
        "// GENERATED by tools/build_seasonal.py from art/seasonal/src -- do not edit by hand.",
        "// Sources: art/seasonal/src (Ghost CC0, Turkeys CC0, Snowman CC-BY 3.0, Flappy Dragon CC0).",
        "",
        "package com.bleelblep.sparkle",
        "",
        "internal object SeasonalData {",
        "\tclass Pet(override val id: String, override val name: String, override val w: Int, override val h: Int, override val strips: Map<String, Pair<Int, Array<String>>>, override val mouth: FloatArray? = null) : SheetPet",
        "",
        "\tval pets: List<Pet> = listOf(",
    ]
    for pid, name, frames in PETS:
        pid, name, w, h, strips = build_pet(pid, name, frames)
        lines.append(f'\t\tPet("{pid}", "{name}", {w}, {h}, mapOf(')
        lines += [f"\t\t\t\"{k}\" to {v}," for k, v in strips.items()]
        mouth = MOUTHS.get(pid)
        suffix = f', floatArrayOf({mouth[0]:.4f}f, {mouth[1]:.4f}f)' if mouth else ''
        lines.append(f'\t\t){suffix}),')
        print(f"{pid}: {w}x{h}, {list(strips)}")
    lines += ["\t)", "}", ""]
    KT.write_text("\n".join(lines), encoding="utf-8")
    print(f"wrote {KT.name}: {KT.stat().st_size} bytes")


if __name__ == "__main__":
    main()
