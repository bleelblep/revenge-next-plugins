import type { ChangelogEntry } from '../../../shared/changelog'

/** Newest first. Every version users got gets an entry; see shared/changelog.tsx. */
export const CHANGELOG: ChangelogEntry[] = [
	{
		version: '0.31.4',
		date: '2026-10-23',
		title: 'Discord version limit removed',
		changes: ['Installs on any Discord version again.'],
	},
	{
		version: '0.31.3',
		date: '2026-10-22',
		title: 'Discord 352.2',
		changes: ['Also starts on Discord 352.2 (was 351.6 or older).'],
	},
	{
		version: '0.31.2',
		date: '2026-10-21',
		title: 'Discord version limit',
		changes: ["Only starts on Discord 351.6 or older, so a newer Discord build can't break it."],
	},
	{
		version: '0.31.1',
		date: '2026-10-13',
		title: 'Tidy-up',
		changes: ['Errors now show in the Revenge plugin list instead of only the log, and the developer Debug page is gone from normal builds.'],
	},
	{
		version: '0.31.0',
		date: '2026-10-11',
		title: 'Great Scott!',
		changes: [
			'New combo skin, Time circuits: your combo is your speed on a red LED readout, electricity crackles from the cursor, and at 88 mph there is a boom, a flash and fire trails. A record jumps you through time.',
			'New screen effect, Time jump: a flash, electric arcs and the screen sucked in and thrown back out.',
			'New particles, Fire trails: two lines of flame burn away from your tap.',
			'New filter, Flux: blue electricity crackles round the edges, and lightning strikes now and then.',
		],
	},
	{
		version: '0.30.0',
		date: '2026-10-09',
		title: 'Livelier hit counter',
		changes: [
			"The combo counter no longer sits still: it jolts on every hit, bounces back and floats while your combo lasts, harder as the combo climbs.",
			'Each theme moves its own way: Comic swings, Platformer hops, Terminal glitches, Cosy sways, Rhythm stays steady.',
		],
	},
	{
		version: '0.29.1',
		date: '2026-10-09',
		title: 'Vector fix',
		changes: [
			'Works on JingMatrix Vector and LSPosed with API obfuscation, where it failed to load.',
		],
	},
	{
		version: '0.29.0',
		date: '2026-10-09',
		title: 'A screen effect for every finish',
		changes: [
			"Each combo skin's high-score finish now has its own screen effect instead of the arcade CRT: a blood-red style grade, a pulsing vaporwave beat for Rhythm, chunky 8-bit pixels for Platformer, heat haze for On fire, VHS for Shmup, the comic-book look for Comic action, glitching night vision for Hacker terminal, and Scenes' Enchanted forest for Cosy.",
			'Every effect punches in on the slam and the stamp. Phones without shader support keep the finishes as they were.',
		],
	},
	{
		version: '0.28.0',
		date: '2026-10-09',
		title: 'Combo skins, the full arcade treatment',
		changes: [
			'Every combo skin now has a full-screen high-score finish like Arcade: the keyboard closes, the title slams in, your hits count up, a stamp lands, and it waits for a tap. Each in its own theme: SSS rank, a rhythm ranking screen, COURSE CLEAR under fireworks, UNSTOPPABLE over a wall of flames, STAGE CLEAR, KA-BOOM! with To Be Continued, ACCESS GRANTED, and a gentle bloom for Cosy.',
			'Every skin builds up as the combo climbs, like the punches do: more and bigger effects, louder and higher sounds. The shmup ship powers up to a three-way then five-way shot.',
			'Platformer, Shmup and Hacker terminal finishes get the arcade CRT screen.',
		],
	},
	{
		version: '0.27.1',
		date: '2026-10-09',
		title: 'Try it above the keyboard',
		changes: ["Power mode's Try it box moves up above the keyboard when you tap it, instead of hiding behind it."],
	},
	{
		version: '0.27.0',
		date: '2026-10-09',
		title: 'Combo skins',
		changes: [
			'Power mode → Combo skin: eight looks for the combo, each with its own counter, sounds, rules and high-score finish.',
			'Style rank: a D to SSS rank that climbs with speed and drains when you slow down.',
			'Rhythm: osu!-style hit circles judged 300, 100 or 50 on your typing rhythm, misses that break the combo, and a ranking screen for a record.',
			'Retro platformer (coins and 1UPs), On fire (heating up, on fire), Shmup (score chain, grazes, bombs), Comic action (POW! BAM!), Hacker terminal (access levels) and Cosy (a music box and drifting petals).',
			"New typing particles choice, The skin's own, picked for you when you leave Arcade with the default sparks.",
			'Every skin sound is made from scratch for VFX.',
		],
	},
	{
		version: '0.26.2',
		date: '2026-10-09',
		title: 'Quiet on silent',
		changes: [
			'Combo Up → Quiet on silent: the fighting game sounds stay quiet while your phone is on silent or vibrate. On by default.',
		],
	},
	{
		version: '0.26.1',
		date: '2026-10-06',
		title: 'Slider cards',
		changes: [
			'Sliders now sit on the same card background as the settings rows around them, with the current value in the row title.',
		],
	},
	{
		version: '0.26.0',
		date: '2026-10-06',
		title: 'Shimeji spell lists',
		changes: [
			"Shimeji's spells follow its new spell list: only the filters, effects, particles and message effects you allow there can play.",
		],
	},
	{
		version: '0.25.0',
		date: '2026-10-06',
		title: 'Tidier settings, and taps can be turned off',
		changes: [
			'Tap effects is now a slider in When effects play: Off, Subtle, Normal, Strong or Overboard. Off stops taps while sends, mentions, /fx and power mode keep playing. It replaces the Strength slider; your old strength moves to the nearest step.',
			'Screen effect, Particles and Screen filter each have a test pad at the top, so you can try a choice where you pick it. Try effects is gone.',
			'Colour fringing and Bend every window moved onto the Screen effect page, and only show when they do something. Strength and look is gone.',
			'Power mode only shows its other options once it is on.',
		],
	},
	{
		version: '0.24.0',
		date: '2026-10-06',
		title: 'Legacy distortions on by default, and typing particles',
		changes: [
			'On Android 12 and older, every screen effect now bends the screen out of the box: the live-capture distortions are on by default, now that they are confirmed working on Android 10.',
			'The renderer switches and capture timings moved to a new Debug page, where the distortions can be turned off. Force legacy rendering only shows on Android 13 and newer.',
			'Power mode has its own particles: sparks, confetti, rainbow bubbles, hearts, stars, or a Custom list of emoji, server emoji and images kept separate from your tap particles.',
			'Test the celebration now names Level up when that is your style.',
		],
	},
	{
		version: '0.23.0',
		date: '2026-10-05',
		title: 'Every effect on Android 12 and older',
		changes: [
			'Experimental legacy distortions (was Experimental legacy ripple) now runs every screen effect in legacy mode: Swirl, Glitch, Pixel burst, Lens, Jelly and Black hole join Ripple, and Shockwave and both inks bend the screen like on Android 13+. Still one window at a time, from a reduced-resolution capture.',
			'Ink drop (B&W) works as a legacy overlay without that switch: black ink on light themes, white on dark.',
			'Frosted glass and Rainbow puffs filters now have legacy versions. Frost has no blur but still wipes clear and frosts back.',
		],
	},
	{
		version: '0.22.3',
		date: '2026-10-05',
		title: 'Nyan Cat rainbow puffs',
		changes: [
			'Rainbow puffs moves out of Screen effect. Under Particles it blows Nyan Cat pixel stars from your tap (ported from Shimeji): they drift to the edges and pop into rainbow confetti, bending the screen a little on Android 13+.',
			'Rainbow puffs is also a screen filter: stepped pixel rainbow bands with twinkling stars round the screen edges, shown all the time like CRT. Android 13+ only.',
			'A saved Rainbow puffs screen effect resets to the default.',
		],
	},
	{
		version: '0.22.1',
		date: '2026-10-05',
		title: 'Rainbow puffs and lighter ripple capture',
		changes: [
			'Replaces Rainbow edges with Rainbow puffs: filled pixel rainbow clouds burst from your tap with short trails. Rainbow bubbles remains a separate particle choice.',
			'Experimental ripple captures at up to 20 fps with a 600-pixel longest side, while the wave animates independently at up to 30 fps using the latest image. Slower captures automatically reduce capture frequency further.',
			'Ripple diagnostics now separate draw/capture counts and show average and peak capture time. Lower capture resolution and frequency trade some sharpness and scrolling freshness for less UI-thread work.',
		],
	},
	{
		version: '0.22.0',
		date: '2026-10-05',
		title: 'Pixel rainbows and a ripple prototype',
		changes: [
			'Rainbow edges is a tap-triggered 8-bit border under Screen effect. Rainbow bubbles is a separate rising particle style alongside Confetti. Both work in modern and legacy modes.',
			'Opt into Experimental legacy ripple in Compatibility, then choose Ripple. The prototype distorts live reduced-resolution view captures using OpenGL ES 2.',
			'Capture runs on one window at a time and stops if it is too slow or unsupported. Compatibility shows the last capture, upload/draw and pipeline times for testing.',
			'Quick Toggles 0.4.7 adds the two rainbow choices.',
		],
	},
	{
		version: '0.21.0',
		date: '2026-10-05',
		title: 'More legacy filters',
		changes: [
			'Legacy CRT has slightly stronger scanlines and a deeper edge vignette.',
			'Legacy Vaporwave adds pink, violet and cyan washes with scanlines.',
			'Legacy Dreamy adds drifting pastel clouds and rising sparkles. Legacy VHS adds animated static, rolling tracking bands and tape noise.',
			'Try all three with Force legacy rendering. They use Canvas overlays without content distortion, bloom or RGB separation.',
		],
	},
	{
		version: '0.20.0',
		date: '2026-10-05',
		title: 'First legacy effects pack',
		changes: [
			'Android 12 and earlier now have Canvas versions of CRT, old film, night vision, shockwave and ink. Force legacy rendering to try them on a newer phone.',
			'Pickers and previews show available effects and explain the differences. Unsupported selections are kept for switching back.',
			'Shader rendering is isolated from the legacy path. Message Slam uses the new shockwave ring; legacy Glitch keeps its screen shake.',
			'Update Quick Toggles to 0.4.6 for its legacy-aware effect and filter pickers.',
		],
	},
	{
		version: '0.19.4',
		date: '2026-10-05',
		title: 'Legacy rendering test mode',
		changes: [
			'Force legacy rendering in Compatibility to test the Android 12-and-lower path on a newer phone. The switch applies immediately and survives restarts.',
			'See the active renderer and device API level. Your selected effects are kept when switching modes.',
			'Legacy mode currently supports particles, charge rings and non-shader power/message effects. Legacy filters and screen distortions are still being developed.',
		],
	},
	{
		version: '0.19.3',
		date: '2026-10-03',
		title: 'Changelog',
		changes: [
			'The clock icon at the top right of the settings shows what changed in every version.',
			'After an update, a short "What\'s new" dialog lists the changes the next time you open the settings.',
		],
	},
	{
		version: '0.10.0',
		title: 'Split up',
		changes: [
			'Gravity, liquid, night light and focus moved to Tilt Physics, Night Light and Focus Bubble.',
		],
	},
	{
		version: '0.5.0',
		title: 'First release',
		changes: [
			'Tap effects, particles, screen filters like CRT and VHS, typing sparks and /fx messages.',
		],
	},
]
