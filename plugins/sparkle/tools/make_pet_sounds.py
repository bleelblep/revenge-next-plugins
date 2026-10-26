"""
Makes each kind of pet's own sounds: sounds/nyan_*.ogg, cat_*.ogg and dog_*.ogg. Sounds.kt plays
`<kind>_<name>` instead of `<name>` while that kind of pet is out, when one exists; every other
sound stays shared.

Sources (art/nyan_sounds_src/), all CC0 from OpenGameArt:
- cat_*.wav: "Cat Purr & Meow" by Kerzoven
- kitten_mew-1.wav: "Kitten Mew" by AntumDeluge
- dog_barking_mono.wav: "Dog barking mono" by Brandon Morris (four barks, at about 0.0, 0.52, 1.12
  and 1.69 s)
plus, for Nyan Cat only, two short snippets of its song (music/nyan_loop.ogg, daniwell; local use only).

Each is trimmed (leading silence removed), given a light 8-bit bitcrush to suit the pixel cat,
faded, and written like the rest: Vorbis, 22050 Hz, mono. Then run tools/embed_sounds.py.

Usage, from the plugin folder:  python tools/make_pet_sounds.py
"""
import re
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "art" / "nyan_sounds_src"
OUT = ROOT / "sounds"

CRUSH = "acrusher=bits=8:mix=0.35:mode=log:aa=1"
TRIM = "silenceremove=start_periods=1:start_threshold=-40dB"

# name: (source, start, length, extra filters)
CAT = {
	"tap": (SRC / "kitten_mew-1.wav", 0.0, 0.40, ""),
	"heart": (SRC / "cat_purractive_loop.wav", 1.0, 0.22, "volume=1.6"),
	"sleep": (SRC / "cat_purrsleepy_loop.wav", 0.5, 1.2, ""),
	"wake": (SRC / "cat_softmew.wav", 0.0, 0.9, ""),
	"gulp": (SRC / "cat_mewfood.wav", 0.0, 0.7, ""),
	"sad": (SRC / "cat_mewpurr2.wav", 0.0, 1.0, "asetrate=44100*0.85,aresample=44100"),
	"talk": (SRC / "kitten_mew-1.wav", 0.05, 0.09, ""),
	"appear": (SRC / "cat_softmew.wav", 0.0, 0.6, ""),
	"happy": (SRC / "cat_mewpurr.wav", 0.0, 0.6, ""),
}
NYAN = {
	**CAT,
	"appear": (ROOT / "music" / "nyan_loop.ogg", 0.0, 0.42, ""),
	"happy": (ROOT / "music" / "nyan_loop.ogg", 0.42, 0.40, ""),
}
BARKS = SRC / "dog_barking_mono.wav"
DOG = {
	"tap": (BARKS, 0.52, 0.21, ""),
	"appear": (BARKS, 0.0, 0.73, ""),
	"happy": (BARKS, 1.12, 0.24, "asetrate=44100*1.15,aresample=44100"),
	"wake": (BARKS, 1.69, 0.35, "volume=0.7"),
	"sad": (BARKS, 0.0, 0.20, "asetrate=44100*0.8,aresample=44100,volume=0.6"),
	"talk": (BARKS, 0.53, 0.06, "asetrate=44100*1.2,aresample=44100"),
}
SETS = {"nyan": NYAN, "cat": CAT, "dog": DOG}


def make(prefix, name, src, start, length, extra):
	fade = max(0.03, length * 0.25)
	# Cut the range first, then drop silence at its start (cuts from the middle of a recording).
	chain = ",".join(
		f for f in [
			f"atrim=start={start}:duration={length}",
			"asetpts=PTS-STARTPTS",
			"" if "music" in str(src) else TRIM,
			extra,
			CRUSH,
			f"afade=t=out:st={max(0.0, length - fade):.3f}:d={fade:.3f}",
			"aresample=22050",
		] if f
	)
	out = OUT / f"{prefix}_{name}.ogg"
	# Measure the peak, then encode with the gain that brings it to about -1 dB, level with the
	# other sounds (the meows come out much quieter than the 8-bit set).
	probe = subprocess.run(
		["ffmpeg", "-hide_banner", "-i", str(src), "-af", chain + ",volumedetect", "-f", "null", "-"],
		capture_output=True, text=True,
	)
	peak = float(re.search(r"max_volume: (-?[0-9.]+)", probe.stderr).group(1))
	gain = max(0.0, -1.0 - peak)
	subprocess.run(
		["ffmpeg", "-y", "-loglevel", "error", "-i", str(src), "-af", f"{chain},volume={gain:.1f}dB", "-ac", "1",
		 "-c:a", "libvorbis", "-q:a", "3", str(out)],
		check=True,
	)
	print(f"wrote {out.name} (+{gain:.1f} dB)")


if __name__ == "__main__":
	for prefix, sounds in SETS.items():
		for name, (src, start, length, extra) in sounds.items():
			make(prefix, name, src, start, length, extra)
