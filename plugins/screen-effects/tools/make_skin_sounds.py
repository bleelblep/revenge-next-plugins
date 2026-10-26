"""Synthesises the combo skins' sounds into sounds/*.ogg (then run tools/embed_sounds.py).

Every sound here is generated from scratch by this script -- oscillators, noise and envelopes,
no samples -- so they are original and released CC0 like the rest of sounds/. Each skin's sounds
share a prefix: sr_ (Style Rank), osu_ (Rhythm), pf_ (Retro Platformer), fire_ (On Fire),
shmup_ (Shmup), comic_ (Comic Action), term_ (Hacker Terminal), cosy_ (Cosy),
tc_ (Time Circuits).

Needs numpy and ffmpeg (libvorbis). Run from the plugin folder:  python tools/make_skin_sounds.py
"""
import pathlib
import subprocess
import tempfile
import wave

import numpy as np

RATE = 22050
HERE = pathlib.Path(__file__).resolve().parent.parent
OUT = HERE / "sounds"
rng = np.random.default_rng(7)


def t_of(seconds):
    return np.arange(int(RATE * seconds)) / RATE


def env(n, attack=0.002, decay=0.1, curve=4.0):
    """Linear attack, exponential-ish decay over the whole length."""
    t = np.arange(n) / RATE
    a = np.clip(t / max(attack, 1e-4), 0, 1)
    d = np.exp(-curve * t / max(decay, 1e-4))
    return a * d


def osc(freq, seconds, shape="sine"):
    """freq may be a number or an array (a sweep); the phase is integrated so sweeps stay smooth."""
    n = int(RATE * seconds)
    if np.ndim(freq):
        # A sweep shorter than the sound holds its last pitch; a longer one is cut.
        f = np.asarray(freq, dtype=float)[:n]
        f = np.concatenate([f, np.full(n - len(f), f[-1])])
    else:
        f = np.full(n, float(freq))
    phase = 2 * np.pi * np.cumsum(f) / RATE
    if shape == "sine":
        return np.sin(phase)
    if shape == "square":
        return np.sign(np.sin(phase)) * 0.6
    if shape == "tri":
        return 2 / np.pi * np.arcsin(np.sin(phase))
    if shape == "saw":
        return 2 * ((phase / (2 * np.pi)) % 1) - 1
    raise ValueError(shape)


def sweep(f0, f1, seconds, exp=True):
    n = int(RATE * seconds)
    if exp:
        return f0 * (f1 / f0) ** np.linspace(0, 1, n)
    return np.linspace(f0, f1, n)


def noise(seconds):
    return rng.uniform(-1, 1, int(RATE * seconds))


def lowpass(x, cutoff):
    """One-pole low-pass; cutoff may be an array for a sweep."""
    c = np.broadcast_to(np.asarray(cutoff, dtype=float), x.shape)
    a = 1 - np.exp(-2 * np.pi * c / RATE)
    y = np.empty_like(x)
    acc = 0.0
    for i in range(len(x)):
        acc += a[i] * (x[i] - acc)
        y[i] = acc
    return y


def highpass(x, cutoff):
    return x - lowpass(x, cutoff)


def band(x, lo, hi):
    return lowpass(highpass(x, lo), hi)


def pad(x, seconds):
    return np.concatenate([x, np.zeros(int(RATE * seconds))])


def mix(*parts):
    n = max(len(p) for p in parts)
    out = np.zeros(n)
    for p in parts:
        out[: len(p)] += p
    return out


def at(x, seconds, total=None):
    """x delayed by [seconds]."""
    return np.concatenate([np.zeros(int(RATE * seconds)), x])


def seq(notes, shape="square", gap=0.0):
    """[(freq, seconds, decay)] back to back."""
    out = []
    for freq, seconds, decay in notes:
        s = osc(freq, seconds, shape) * env(int(RATE * seconds), 0.003, decay, 3.0)
        out.append(s)
        if gap:
            out.append(np.zeros(int(RATE * gap)))
    return np.concatenate(out)


def note(name):
    names = {"C": 0, "C#": 1, "D": 2, "D#": 3, "E": 4, "F": 5, "F#": 6, "G": 7, "G#": 8, "A": 9, "A#": 10, "B": 11}
    pitch, octave = name[:-1], int(name[-1])
    return 440.0 * 2 ** ((names[pitch] + 12 * (octave + 1) - 69) / 12)


def music_box(freq, seconds=0.9):
    n = int(RATE * seconds)
    body = osc(freq, seconds) * env(n, 0.002, 0.35, 3.0)
    ping = osc(freq * 4.02, seconds) * env(n, 0.001, 0.08, 3.0) * 0.35
    tine = osc(freq * 2.0, seconds) * env(n, 0.001, 0.18, 3.0) * 0.25
    return body + ping + tine


def clap(width=0.018):
    n = noise(width) * env(int(RATE * width), 0.0005, width, 3.0)
    return band(n, 900, 2600)


# ------------------------------------------------------------------------------------------------
# Style Rank: blade slashes and rank stingers
# ------------------------------------------------------------------------------------------------

def sr_slash():
    s = 0.16
    hiss = highpass(noise(s), sweep(5000, 900, s)) * env(int(RATE * s), 0.002, 0.06, 3.0)
    ring = (osc(3150, s) + 0.6 * osc(4720, s)) * env(int(RATE * s), 0.001, 0.05, 3.0) * 0.25
    return hiss + ring


def sr_rankup():
    swell = lowpass(noise(0.18), sweep(400, 6000, 0.18)) * np.linspace(0, 1, int(RATE * 0.18)) ** 2 * 0.6
    chord_len = 0.5
    chord = sum(osc(f, chord_len, "saw") for f in (note("C4"), note("G4"), note("C5"), note("E5")))
    chord = lowpass(chord, 3500) * env(int(RATE * chord_len), 0.003, 0.22, 3.0) * 0.35
    hit = osc(sweep(160, 50, 0.25), 0.25) * env(int(RATE * 0.25), 0.001, 0.12, 3.0)
    return np.concatenate([swell, mix(chord, hit)])


def sr_drop():
    s = 0.35
    return lowpass(noise(s), sweep(3000, 200, s)) * env(int(RATE * s), 0.01, 0.2, 2.5) * 0.7


def sr_finish():
    s = 1.4
    chord = sum(osc(f, s, "saw") for f in (note("A2"), note("E3"), note("A3"), note("C#4"), note("E4")))
    chord = lowpass(chord, sweep(5000, 600, s)) * env(int(RATE * s), 0.004, 0.7, 3.0) * 0.3
    boom = osc(sweep(120, 35, 0.6), 0.6) * env(int(RATE * 0.6), 0.001, 0.3, 3.0)
    tail = lowpass(noise(s), 2500) * env(int(RATE * s), 0.002, 0.5, 3.0) * 0.35
    return mix(chord, boom, tail, at(sr_slash(), 0.05))


# ------------------------------------------------------------------------------------------------
# Rhythm (osu!-style): soft hit, combo break, applause, rank chime
# ------------------------------------------------------------------------------------------------

def osu_hit():
    s = 0.12
    body = osc(sweep(260, 110, 0.06), s) * env(int(RATE * s), 0.001, 0.035, 3.0)
    click = highpass(noise(0.012), 3000) * env(int(RATE * 0.012), 0.0003, 0.006, 3.0) * 0.6
    tick = osc(2600, 0.03) * env(int(RATE * 0.03), 0.0005, 0.012, 3.0) * 0.2
    return mix(body, click, tick)


def osu_break():
    s = 0.45
    tone = osc(sweep(420, 90, s), s, "square") * env(int(RATE * s), 0.002, 0.3, 2.5) * 0.5
    crackle = band(noise(s), 300, 1500) * env(int(RATE * s), 0.002, 0.15, 3.0) * 0.4
    return lowpass(mix(tone, crackle), 2200)


def osu_applause():
    s = 2.4
    out = np.zeros(int(RATE * s))
    for _ in range(260):
        start = rng.uniform(0, 1.6) ** 1.3
        c = clap(rng.uniform(0.012, 0.024)) * rng.uniform(0.2, 0.7)
        i = int(start * RATE)
        out[i : i + len(c)] += c[: len(out) - i]
    return out * np.minimum(1, np.linspace(2.4, 0, len(out)))


def osu_rank():
    s = 1.0
    return sum(
        osc(f, s) * env(int(RATE * s), 0.002, 0.45, 3.0) * a
        for f, a in ((note("E6"), 0.6), (note("B6"), 0.4), (note("E7"), 0.2))
    )


# ------------------------------------------------------------------------------------------------
# Retro Platformer: coin, extra life, course clear
# ------------------------------------------------------------------------------------------------

def pf_coin():
    return seq([(note("C6"), 0.05, 0.05), (note("G6"), 0.26, 0.12)], "square")


def pf_1up():
    return seq([(note(n), 0.07, 0.06) for n in ("C5", "E5", "G5", "C6", "E6", "G6")], "square")


def pf_clear():
    melody = seq(
        [(note(n), 0.11, 0.1) for n in ("G4", "C5", "E5", "G5", "C6", "E6")]
        + [(note("G6"), 0.34, 0.2), (note("E6"), 0.11, 0.08), (note("G6"), 0.6, 0.35)],
        "square",
    )
    bass = seq([(note("C3"), 0.33, 0.25), (note("G3"), 0.33, 0.25), (note("C4"), 0.9, 0.5)], "tri")
    return mix(melody * 0.8, at(bass, 0.0) * 0.7)


# ------------------------------------------------------------------------------------------------
# On Fire: dribble thump, heating up, ignition, fizzle
# ------------------------------------------------------------------------------------------------

def fire_thump():
    s = 0.14
    body = osc(sweep(140, 60, 0.08), s) * env(int(RATE * s), 0.001, 0.05, 3.0)
    slap = band(noise(0.02), 400, 2500) * env(int(RATE * 0.02), 0.0005, 0.01, 3.0) * 0.4
    return mix(body, slap)


def _whoosh(s, f0, f1):
    n = int(RATE * s)
    shape = np.sin(np.linspace(0, np.pi, n)) ** 1.5
    return lowpass(noise(s), sweep(f0, f1, s)) * shape


def _crackle(s, density=0.004):
    out = np.zeros(int(RATE * s))
    hits = rng.random(len(out)) < density
    out[hits] = rng.uniform(-1, 1, hits.sum())
    return highpass(out, 1500)


def fire_heat():
    return mix(_whoosh(0.4, 300, 3000) * 0.9, _crackle(0.4, 0.003) * 0.6)


def fire_ignite():
    s = 1.0
    roar = _whoosh(s, 200, 4500) * 1.0
    boom = osc(sweep(90, 40, 0.5), 0.5) * env(int(RATE * 0.5), 0.003, 0.25, 3.0) * 0.8
    return mix(roar, boom, _crackle(s, 0.006) * 0.8)


def fire_fizzle():
    s = 0.8
    return highpass(noise(s), 2500) * env(int(RATE * s), 0.01, 0.45, 2.5) * 0.5


# ------------------------------------------------------------------------------------------------
# Shmup: shot, graze, bomb, stage clear
# ------------------------------------------------------------------------------------------------

def shmup_shot():
    s = 0.07
    return osc(sweep(1900, 520, s), s, "square") * env(int(RATE * s), 0.001, 0.04, 3.0) * 0.6


def shmup_graze():
    s = 0.06
    return osc(sweep(2400, 3200, s), s) * env(int(RATE * s), 0.001, 0.03, 3.0) * 0.6


def shmup_bomb():
    s = 1.1
    rumble = lowpass(noise(s), sweep(2500, 120, s)) * env(int(RATE * s), 0.002, 0.6, 2.5)
    sub = osc(sweep(80, 28, s), s) * env(int(RATE * s), 0.002, 0.5, 2.5) * 0.9
    return mix(rumble, sub)


def shmup_clear():
    arp = seq([(note(n), 0.08, 0.07) for n in ("C5", "G5", "C6", "E6", "G6", "C7")], "square")
    chord_len = 0.8
    chord = sum(osc(note(n), chord_len, "square") for n in ("C5", "E5", "G5")) / 3
    chord = chord * env(int(RATE * chord_len), 0.003, 0.4, 3.0)
    bass = osc(note("C3"), 1.3, "tri") * env(int(RATE * 1.3), 0.003, 0.6, 3.0) * 0.7
    return mix(np.concatenate([arp, chord]) * 0.8, bass)


# ------------------------------------------------------------------------------------------------
# Comic Action: thwack, boing, ka-boom
# ------------------------------------------------------------------------------------------------

def comic_hit():
    s = 0.12
    thud = osc(sweep(180, 70, 0.07), s) * env(int(RATE * s), 0.001, 0.04, 3.0)
    smack = band(noise(0.04), 600, 3500) * env(int(RATE * 0.04), 0.0005, 0.02, 3.0) * 0.7
    return mix(thud, smack)


def comic_pop():
    s = 0.3
    t = t_of(s)
    f = 420 + 260 * np.exp(-t * 9) * np.sin(2 * np.pi * 18 * t) + 120 * t
    return osc(f, s) * env(int(RATE * s), 0.002, 0.16, 3.0) * 0.7


def comic_boom():
    s = 1.3
    blast = lowpass(noise(s), sweep(4000, 150, s)) * env(int(RATE * s), 0.001, 0.55, 2.5)
    sub = osc(sweep(110, 30, 0.8), 0.8) * env(int(RATE * 0.8), 0.001, 0.4, 3.0)
    return mix(blast, sub, _crackle(s, 0.003) * 0.5)


# ------------------------------------------------------------------------------------------------
# Hacker Terminal: key click, data chirp, access granted / denied
# ------------------------------------------------------------------------------------------------

def term_key():
    s = 0.03
    tick = osc(2100, s, "square") * env(int(RATE * s), 0.0003, 0.006, 3.0) * 0.4
    click = highpass(noise(0.006), 2000) * env(int(RATE * 0.006), 0.0002, 0.002, 3.0) * 0.6
    return mix(tick, click)


def term_chirp():
    notes = [(rng.uniform(800, 2600), 0.028, 0.03) for _ in range(9)]
    return seq(notes, "square", gap=0.008) * 0.5


def term_granted():
    beeps = seq([(note("A5"), 0.12, 0.1), (note("E6"), 0.3, 0.2)], "sine", gap=0.03)
    pad_len = 0.9
    padn = sum(osc(note(n), pad_len, "tri") for n in ("A4", "E5", "A5")) / 3
    padn = padn * np.sin(np.linspace(0, np.pi, int(RATE * pad_len))) * 0.5
    return mix(beeps, at(padn, 0.1))


def term_denied():
    s = 0.4
    return lowpass(osc(110, s, "square"), 1800) * env(int(RATE * s), 0.002, 0.3, 1.5) * 0.7


# ------------------------------------------------------------------------------------------------
# Cosy: music box note (pitched per key by playback rate), soft pop, chime
# ------------------------------------------------------------------------------------------------

def cosy_note():
    # C5: the skin plays it at pentatonic rates up to 2x (C6), SoundPool's limit.
    return music_box(note("C5"))


def cosy_pop():
    s = 0.09
    return osc(sweep(500, 950, s), s) * env(int(RATE * s), 0.002, 0.04, 3.0) * 0.6


def cosy_chime():
    out = np.zeros(int(RATE * 2.0))
    for i, n in enumerate(("C5", "E5", "G5", "C6", "E6", "G6")):
        m = music_box(note(n), 1.2) * 0.7
        start = int(i * 0.11 * RATE)
        out[start : start + len(m)] += m[: len(out) - start]
    return out


# ------------------------------------------------------------------------------------------------
# Time Circuits: electric zaps, the whine up to 88 and the time-jump boom
# ------------------------------------------------------------------------------------------------

def _arc(s, rate=0.02):
    """Electric crackle: sparse clicks through a buzzing band, flickering on and off."""
    n = int(RATE * s)
    clicks = np.zeros(n)
    hits = rng.random(n) < rate
    clicks[hits] = rng.uniform(-1, 1, hits.sum())
    buzz = osc(120 + 8 * np.sin(np.linspace(0, 40, n)), s, "saw") * 0.25
    gate = (rng.random(int(n / 220) + 1) > 0.35).repeat(220)[:n]
    return band(clicks + buzz * gate, 600, 7000)


def tc_zap():
    s = 0.12
    return _arc(s, 0.05) * env(int(RATE * s), 0.001, 0.06, 3.0)


def tc_whine():
    s = 1.1
    n = int(RATE * s)
    rise = np.clip(np.linspace(0, 1.15, n), 0, 1)
    whine = osc(sweep(300, 2400, s), s, "saw") * 0.35 + osc(sweep(600, 4800, s), s) * 0.2
    whine = lowpass(whine, 3500) * rise
    return mix(whine, _arc(s, 0.03) * rise * 0.8)


def tc_boom():
    s = 1.3
    n = int(RATE * s)
    first = osc(sweep(110, 35, 0.6), 0.6) * env(int(RATE * 0.6), 0.002, 0.3, 3.0)
    crack = band(noise(0.08), 300, 6000) * env(int(RATE * 0.08), 0.0005, 0.04, 3.0) * 0.8
    second = at(osc(sweep(90, 30, 0.6), 0.6) * env(int(RATE * 0.6), 0.002, 0.3, 3.0) * 0.8, 0.12)
    tail = _arc(s, 0.015) * env(n, 0.05, 0.6, 2.5) * 0.5
    return mix(first, crack, second, tail)


SOUNDS = {
    "sr_slash": sr_slash, "sr_rankup": sr_rankup, "sr_drop": sr_drop, "sr_finish": sr_finish,
    "osu_hit": osu_hit, "osu_break": osu_break, "osu_applause": osu_applause, "osu_rank": osu_rank,
    "pf_coin": pf_coin, "pf_1up": pf_1up, "pf_clear": pf_clear,
    "fire_thump": fire_thump, "fire_heat": fire_heat, "fire_ignite": fire_ignite, "fire_fizzle": fire_fizzle,
    "shmup_shot": shmup_shot, "shmup_graze": shmup_graze, "shmup_bomb": shmup_bomb, "shmup_clear": shmup_clear,
    "comic_hit": comic_hit, "comic_pop": comic_pop, "comic_boom": comic_boom,
    "term_key": term_key, "term_chirp": term_chirp, "term_granted": term_granted, "term_denied": term_denied,
    "cosy_note": cosy_note, "cosy_pop": cosy_pop, "cosy_chime": cosy_chime,
    "tc_zap": tc_zap, "tc_whine": tc_whine, "tc_boom": tc_boom,
}


def write_ogg(name, samples):
    peak = np.max(np.abs(samples)) or 1.0
    samples = pad(samples / peak * 0.85, 0.02)
    # A short fade at the end, so nothing clicks off.
    fade = min(len(samples), int(RATE * 0.01))
    samples[-fade:] *= np.linspace(1, 0, fade)
    pcm = (samples * 32767).astype("<i2")
    with tempfile.TemporaryDirectory() as tmp:
        wav = pathlib.Path(tmp) / f"{name}.wav"
        with wave.open(str(wav), "wb") as w:
            w.setnchannels(1)
            w.setsampwidth(2)
            w.setframerate(RATE)
            w.writeframes(pcm.tobytes())
        subprocess.run(
            ["ffmpeg", "-y", "-loglevel", "error", "-i", str(wav), "-c:a", "libvorbis", "-q:a", "2", str(OUT / f"{name}.ogg")],
            check=True,
        )


if __name__ == "__main__":
    OUT.mkdir(exist_ok=True)
    for name, make in SOUNDS.items():
        write_ogg(name, make())
        print(f"{name}.ogg {(OUT / f'{name}.ogg').stat().st_size} bytes")
