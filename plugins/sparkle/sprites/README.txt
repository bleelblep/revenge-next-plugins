Unicorn mobile mascot sprite set
Transparent PNGs extracted from the generated sprite sheet.

tools/build_motion.py embeds the approved unicorn spin/hang previews and Nyan's
jump, spin, look, hang, shake and exit sequences into MotionData.kt. These have
their own cell sizes, logical-cell offsets and frame timings (Motion.kt), so the
larger spin drawings do not change existing sprite anchors or get scaled down.
The upside-down hanging animation is used for STUCK, not the upright HANG state.

The 19 blow frames are rebuilt from idle/idle_01.png by tools/build_blow.py,
preserving the original unicorn's palette, hairstyle and cell anchor. The head
leans toward the wand using flat pixel offsets, cheeks inflate and each exhale has a small nod.
Run that tool, then tools/build_sprites.py after editing the bubble animation.
tools/build_blow.py --preview also produces a comparison sheet and animated GIF.
The 34 look frames are rebuilt by tools/build_look.py from the original idle art.
Fifteen flat 2D head poses narrow the fringe using separate face, crown and horn
cutouts, then switch through original profile and rear drawings. No 3D projection
is used. Rear hair uses the source pink texture with no added
black outline. Playback is 16 fps, keeping the rainbow anchored and returning to idle.
tools/build_look.py --preview produces the turn comparison sheet and animated GIF.
The legacy tools/cut_bubble_sheet.py extracts the alternate character; after using
it for effect assets, rerun both build_blow.py and build_look.py, then build_sprites.py.

idle: 6 sprite(s)
walk_hover: 8 sprite(s)
jump: 6 sprite(s)
spin: 5 sprite(s)
happy: 4 sprite(s)
sleep: 5 sprite(s)
surprised: 4 sprite(s)
sad: 4 sprite(s)
excited_dizzy: 5 sprite(s)
reaction_notification: 4 sprite(s)
charging: 4 sprite(s)
low_battery: 4 sprite(s)
shake_burst: 1 sprite(s)
outro_exit: 3 sprite(s)
extra_variants: 4 sprite(s)
