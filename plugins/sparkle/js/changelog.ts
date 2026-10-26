import type { ChangelogEntry } from '../../../shared/changelog'

/** Newest first. Every version users got gets an entry; see shared/changelog.tsx. */
export const CHANGELOG: ChangelogEntry[] = [
	{
		version: '0.17.10',
		date: '2026-10-27',
		title: 'Holiday pets in every download',
		changes: [
			'Fixed the holiday pets showing up as the Dragon when Shimeji was installed from the repository.',
		],
	},
	{
		version: '0.17.9',
		date: '2026-10-27',
		title: 'Holiday pets are back',
		changes: [
			'Fixed the holiday pets all showing up as the Dragon in 0.17.8.',
		],
	},
	{
		version: '0.17.8',
		date: '2026-10-27',
		title: 'Holiday pets packed differently',
		changes: [
			'The holiday pets are now stored differently. Nothing changes for you: same pets, same looks.',
		],
	},
	{
		version: '0.17.7',
		date: '2026-10-27',
		title: 'Turkey hidden',
		changes: [
			'The Turkey is no longer in the pet list. If it was your pet, you now have the Unicorn.',
		],
	},
	{
		version: '0.17.6',
		date: '2026-10-22',
		title: 'Discord version limit removed',
		changes: [
			'Installs on any Discord version again. Newer Discord versions have not been tested yet.',
		],
	},
	{
		version: '0.17.5',
		date: '2026-10-22',
		title: 'Discord 352.2',
		changes: [
			"Pop-ups use your Discord theme's colours again on Discord 352.2. Needs Revenge 1.9.1 or newer on 352.2.",
		],
	},
	{
		version: '0.17.4',
		date: '2026-10-21',
		title: 'Discord version limit',
		changes: ["Only starts on Discord 351.6 or older, so a newer Discord build can't break it."],
	},
	{
		version: '0.17.3',
		date: '2026-10-20',
		title: 'More from the Horseman, and a new ride',
		changes: [
			"Three new Horseman attacks: a flurry of three slashes that leaves the screen in sliding pieces, his jack-o'-lantern thrown to burn a flaming hole through it, and a reaping that twists the screen into a swirl and drains it green while souls spiral in.",
			"The ride is redone: Discord itself turns moonlit (it keeps working underneath), his pumpkin lights up the chat as he passes, fog drifts along the bottom and the hooves leave real fire with heat haze. The horse speeds up, brakes and skids at the edges, and the rider bobs in time with it.",
			'Both need Android 13 or newer. Older phones keep the previous ride and attacks.',
		],
	},
	{
		version: '0.17.2',
		date: '2026-10-20',
		title: 'New screen tricks',
		changes: [
			"The Horseman's scythe swing is redone: a white-hot slash streaks across, the screen shears apart along it over a burning rift, then slams back together.",
			"Krampus's claws rip three glowing gashes that rake across one after another, the chain's hook stretches the screen toward him like rubber, and his head-butt cracks it like a dropped phone.",
			'These need Android 13 or newer. Older phones keep the previous effects.',
			"Krampus's horns are no longer cut off at the top.",
		],
	},
	{
		version: '0.17.1',
		date: '2026-10-18',
		title: 'Mischief, the horse and the ride',
		changes: [
			'The Headless Horseman attacks your screen now and then: a scythe swing slices it apart for a moment (sometimes twice over), or he throws the scythe and it bounces round the screen before flying back to his hand.',
			'Krampus picks a weapon: the chain hooks the screen and drags it away (now and then clean off the edge), the claws tear it three ways, or a head-butt bulges and cracks it. It all springs back; nothing really changes.',
			"Fun → Mischief sets how often, and Screen tricks turns the snapshot effects off if they're too much. Attack now tries one straight away.",
			"The Horseman's horse: now and then it walks in along the floor, grazes, neighs and leaves. Tap it while he's out and he rides it round the screen for up to five minutes, under a dark sky with a moon, fog, bats and leaves and a trail of flaming hoof prints. Tap him to get off. Other pets tapping it only make it rear.",
		],
	},
	{
		version: '0.17.0',
		date: '2026-10-18',
		title: 'The Headless Horseman and Krampus',
		changes: [
			'Two new pets, drawn from scratch: the Headless Horseman in the Halloween pack (cloak, scythe, a jack-o\'-lantern he blows bubbles from) and Krampus in the Christmas pack (horns, chain, tongue, claws). Every mood, fidget and exit of their own.',
			'This is the characters only. Their mischief, the scythe and the chain against your screen, the horse, comes in the next versions.',
		],
	},
	{
		version: '0.16.7',
		date: '2026-10-18',
		title: 'Vampire Cat walks',
		changes: ['The Vampire Cat has a walk of its own: it waddles along, stepping with its paws and swaying, tail swishing.'],
	},
	{
		version: '0.16.6',
		date: '2026-10-18',
		title: 'Vampire Cat hops',
		changes: ['The Vampire Cat hops along when it walks, instead of flying. It still flies off like a bat when it leaves.'],
	},
	{
		version: '0.16.5',
		date: '2026-10-18',
		title: 'No more flicker',
		changes: [
			'Switching pets no longer flickers: the old pet stays up until the new one is ready, and animations no longer blink as they play.',
			'The pet strip sits on a card, like the other settings.',
		],
	},
	{
		version: '0.16.4',
		date: '2026-10-18',
		title: 'Collection names that stay put',
		changes: ["In the pet strip, a collection's name stays at the left edge once you scroll past it, and fades into the next one as it arrives."],
	},
	{
		version: '0.16.3',
		date: '2026-10-18',
		title: 'Pet filmstrip, and a flying Vampire Cat',
		changes: [
			'Choose your pet from one strip you scroll sideways, with the collection buttons on top to jump to one. It replaces the grid.',
			"Switching pets no longer makes the preview flicker, and pets you've looked at before show up straight away.",
			'The Vampire Cat flies with its cape spread like a bat when it moves and when it leaves, instead of sliding along lying down.',
		],
	},
	{
		version: '0.16.2',
		date: '2026-10-18',
		title: 'A new pet picker',
		changes: [
			'Pick your pet from a grid of little animated pets, with the packs in one row you can scroll sideways.',
			'The pet preview is sharp: it was blurry.',
			'Size, name and outline come first; pack settings and the animation tester are at the bottom.',
			'The animation tester names each fidget (Blink, Stretch, Peck...) instead of numbering them.',
			'The Turkey, Snowman and Dragon moved into the Thanksgiving, Christmas and Classic packs.',
			"Cotton Boo's happy dance is back to how it was.",
		],
	},
	{
		version: '0.16.1',
		date: '2026-10-18',
		title: 'Christmas cats walk forwards',
		changes: ["The Christmas cats' legs step the right way: they were moving backwards while the cat walked forwards."],
	},
	{
		version: '0.16.0',
		date: '2026-10-18',
		title: 'Crisper seasonal pets, with more of their own moves',
		changes: [
			'Every seasonal pet keeps crisp, even pixels: they were stretched unevenly before.',
			'Witch Ghosts roll their eyes when looking around, get star eyes for reactions, and melt away under their hats when they leave.',
			'The Classic and Dark Ghosts gasp when startled, blow bubbles with a little "o", and sink into a puddle when they leave.',
			'Cotton Boo cries when sad and blushes when happy (it used to cry at every reaction), and hops, blinks and wiggles.',
			'The Vampire Cat hisses when startled and ducks into its box to leave.',
			'The Christmas cats lie down when sad and stretch now and then; the Elf and Reindeer Cats really walk now instead of pouncing.',
			'Chickens flinch when startled.',
		],
	},
	{
		version: '0.15.7',
		date: '2026-10-18',
		title: 'A new look for the Mini Ghost',
		changes: [
			'The Mini Ghost keeps its crisp pixels: it was stretched unevenly before.',
			'New faces for every mood: happy with blushing cheeks, sad with a rolling tear, sleepy, startled, dizzy, glancing around and more.',
			'It blows its bubbles with a little puff, glows warm while charging, and fades when the battery is low.',
			'Leaving the screen, it melts away into a puddle.',
		],
	},
	{
		version: '0.15.6',
		date: '2026-10-18',
		title: "Nyan Cat's rainbow",
		changes: [
			'The rainbow stays full length when Nyan Cat turns round, instead of folding up under it.',
			'It folds over with the cat as it turns, instead of jumping to the other side.',
			'Walking up or down, the rainbow follows in one smooth ribbon, with no kink right behind the cat.',
		],
	},
	{
		version: '0.15.5',
		date: '2026-10-17',
		title: 'Ghost motion and Santa Cat walk',
		changes: ['Ghost startle and takeoff now include anticipation and recovery, with dedicated hanging, spin and exit motion and a small Witch Ghost hat-tip follow-through.', 'Rebuilt Santa Cat’s walk as an eight-frame alternating-foot gait, with a separate stationary takeoff sequence.'],
	},
	{
		version: '0.15.4',
		date: '2026-10-17',
		title: 'Ghost mood refinements',
		changes: ['Redrawn ghost happy and sad faces, with a cheerful stretch and a slumped sad pose.', 'Swapped Santa Cat’s walk and jump animations.'],
	},
	{
		version: '0.15.3',
		date: '2026-10-17',
		title: 'Animation tester',
		changes: ['Pet → Animation tester lets you loop all 18 poses for your chosen pet, including sleep, moods, charging and bubbles, with reaction and fidget variants. Tap a pose again to replay it.'],
	},
	{
		version: '0.15.2',
		date: '2026-10-17',
		title: 'Ghost expressions and bubbles',
		changes: [
			'Ghosts gain closed-eye sleep, happy and sad expressions, dizzy eyes, a looking-around sequence and flowing shrouds.',
			'Purchased pets now grow bubbles before release, with a synchronized puff/recovery sequence and pose-specific timing. Ghost mouths use mapped sprite landmarks.',
			'Added dedicated hanging, spinning, exit and fidget strips for purchased packs.',
		],
	},
	{
		version: '0.15.0',
		date: '2026-10-17',
		title: 'Seasonal pets',
		changes: [
			'Four seasonal holiday pets under Pet → Seasonal: a Ghost for Halloween, a Turkey for Thanksgiving, a Snowman for Christmas and a Dragon for Chinese New Year.',
			'Each is built from found online sprite art (OpenGameArt, CC0 except the CC-BY snowman — see Licence), with its own idle and walk and a graceful fallback for the other moods.',
		],
	},
	{
		version: '0.14.5',
		date: '2026-10-13',
		title: 'Tidy-up',
		changes: ['Errors now show in the Revenge plugin list instead of only the log, and the developer Debug page is gone from normal builds.'],
	},
	{
		version: '0.14.4',
		date: '2026-10-13',
		title: 'Discord 350.4',
		changes: ['Pop-up messages work on Discord 350.4. Before, showing one could crash Discord.'],
	},
	{
		version: '0.14.3',
		date: '2026-10-11',
		title: 'Magic error fixed',
		changes: [
			'Fixed a "JS method not found: bleelblep.sparkle.magic" error that could pop up when your pet cast a spell. If the spell cannot reach VFX, your pet still does its trick, just without the screen effect.',
		],
	},
	{
		version: '0.14.2',
		date: '2026-10-09',
		title: 'Full-screen reaction effects',
		changes: [
			'Message reactions → Full-screen effects: each reaction fills the screen with its own pixel effect for a few seconds. Hearts float up for Love, confetti falls for Celebrate, rain for Sad, Zzz for Sleepy, speed lines for Surprised, falling pizza for Food, and more.',
			'Turn the effect off for any one reaction on its page. Try it shows the effect too. At most one every 6 seconds, and your pet stays on top.',
		],
	},
	{
		version: '0.14.0',
		date: '2026-10-09',
		title: 'More message reactions',
		changes: [
			'Nine new reactions to messages: Goodbye, Sleepy, Sad, Surprised, Celebrate, Hype (sunglasses on), Food, Music and Thanks, next to Love, Laugh and Hello.',
			'Sounds & reactions → Message reactions: switch each one off, try it, and choose its keywords. Remove any built-in keyword (and bring it back later), or add your own words, phrases or emoji.',
			'Adding a keyword another reaction has moves it over, so each word sets off one reaction. Stretched spellings count: "hi" also catches "hiii".',
		],
	},
	{
		version: '0.13.5',
		date: '2026-10-06',
		title: 'Tidier settings, and grudges',
		changes: [
			"Settings are reorganised into Pet (now with Size), How it's doing, Movement, Sounds & reactions, and Fun, with the most-used settings at the top of each page.",
			'"Wanders on its own" is now the Still step on the Activity slider, bubbles and the bubble screen are one choice, and voice calls have three options.',
			"New, off by default: How it's doing → Holds grudges. Treat your pet well and it takes fewer buttons and gives them back on its own. Tap-spam it, throw it hard, shake it or ignore its treats and it takes more and more. It forgives slowly.",
		],
	},
	{
		version: '0.12.0',
		date: '2026-10-06',
		title: 'Voice calls',
		changes: [
			'Sounds & reactions → During voice calls: keep it as usual, make it quieter, or hide it until you hang up.',
		],
	},
	{
		version: '0.11.0',
		date: '2026-10-06',
		title: 'A livelier pet',
		changes: [
			'It moves about much more: it decides what to do every few seconds, walks further, sometimes strolls right across the screen, and now and then trots.',
			'With Gravity off it roams up and down the screen too, not only sideways.',
			'Movement has an Activity slider: Calm (the old pace), Normal, Lively or Hyper.',
			'Sleep is a nap now: it wakes up by itself after a while instead of sleeping until you touch it.',
		],
	},
	{
		version: '0.11.0',
		date: '2026-10-06',
		title: 'Gary the Snail',
		changes: [
			'Gary joins Unicorn and Nyan Cat under Pet → Classic, with 18 animation states and 24 clips built from his screensaver artwork.',
			'Gary reacts with his original Battle for Bikini Bottom meows and vocals, at their original pitch, with a cooldown between calls.',
		],
	},
	{
		version: '0.10.1',
		date: '2026-10-06',
		title: 'Parties on time, and slider cards',
		changes: [
			'Nyan parties and magic spells now follow their how-often slider: a sleeping pet wakes up for one, and a busy pet tries again a few seconds later, where before the whole wait started over and most were skipped.',
			'Sliders now sit on the same card background as the settings rows around them, with the current value in the row title.',
		],
	},
	{
		version: "0.10.0",
		date: "2026-10-06",
		title: "Choose how often",
		changes: [
			"Magic tricks, treats, eating buttons and the Nyan party each have a slider instead of a switch: Off, Rare, Sometimes, Often or Very often. Sometimes is the old timing, and the text under each slider says roughly how long between them.",
		],
	},
	{
		version: '0.9.0',
		date: '2026-10-06',
		title: 'Bubble effects on older phones, and a spell list',
		changes: [
			"Android 12 and older now get the bubble screen effects too: the soap-film shimmer, Nyan Cat's rainbow screen and a ring at each pop. They don't bend the screen like on Android 13+, but the colours and rings are the same.",
			"Fun → What spells can show: switch off anything you don't want a spell to play (filters, screen effects, particles, message effects), or flip it to only the ones you pick. Needs VFX 0.26.0.",
		],
	},
	{
		version: '0.8.9',
		date: '2026-10-05',
		title: 'Cats can be picked again',
		changes: [
			'The Pet page switches between Classic, Cats and Dogs with three buttons instead of swipeable tabs. On some phones the swipe tabs lined up wrongly on the middle page, so the cats could not be picked.',
		],
	},
	{
		version: '0.8.6',
		date: '2026-10-04',
		title: 'Classic spin, new poses',
		changes: [
			'Sparkle and Nyan Cat keep their improved tucked-paw spin sprites with the original continuous spinning motion when wound up or rocketing.',
			'Removed the repeated wind-up and recovery pauses from their spinning poses.',
		],
	},
	{
		version: '0.8.5',
		date: '2026-10-04',
		title: 'Tumbles, hanging and Nyan moves',
		changes: [
			'Sparkle gets the new upside-down hanging pose and a tucked-hoof tumble with a closed smile and crossed eyes.',
			'Nyan Cat gets dedicated jump, spin, look-behind, hanging, shake and waving-exit animations.',
			'New spins use their own sprite timing and full-size frames, without a second rotation applied on top.',
		],
	},
	{
		version: '0.8.4',
		date: '2026-10-04',
		title: 'A matching look behind',
		changes: [
			'Rebuilt the unicorn’s look-behind animation with flat 2D poses: the fringe narrows through front, profile and rear drawings, using the original pink texture without an added black outline.',
			'The unicorn pauses facing away before turning back, with its rainbow anchored and a smooth return to idle.',
			'Bubble blowing now leans the original head toward the wand using flat 2D movement, inflates the cheeks and follows each exhale with a small nod.',
		],
	},
	{
		version: '0.8.3',
		date: '2026-10-04',
		title: 'Matching unicorn bubbles',
		changes: [
			'The bubble-blowing animation now uses the original unicorn design, with matching proportions, mane, horn and rainbow.',
			'Bubbles grow on the new wand and float away from the matching release positions.',
		],
	},
	{
		version: '0.8.2',
		date: '2026-10-04',
		title: 'Outlines',
		changes: [
			'Cats and dogs get a thin outline so they are easier to see: automatic (matches your theme), light, dark or off, on the Pet page.',
		],
	},
	{
		version: '0.8.1',
		date: '2026-10-04',
		title: 'Picker tabs and a size slider',
		changes: [
			'Size is a slider that catches on Small, Medium and Large and stops anywhere in between.',
			'Cats and dogs are shown bigger, to match the unicorn and Nyan Cat.',
		],
	},
	{
		version: '0.8.0',
		date: '2026-10-04',
		title: 'Cats and dogs',
		changes: [
			'Six cats and six dogs join: ginger, black, Siamese, Sphynx, Ragdoll and tabby cats; Golden Retriever, Akita, Great Dane, Schnauzer, Saint Bernard and Husky.',
			'They meow and bark, have their own lines and treats (fish and milk, bones and sausages).',
		],
	},
	{
		version: '0.7.7',
		date: '2026-10-04',
		title: 'Purrs, crumbs and a cosy nap',
		changes: [
			"Fixed the gap in Nyan Cat's rainbow when it walks in a straight line.",
			'The rainbow stays out longer when Nyan Cat is thrown.',
			'Nyan Cat sleeps curled up, puffs its cheeks before each rainbow puff, and drops pop-tart crumbs when petted, shaken or landing hard.',
			'Nyan Cat has its own sounds: mews, purrs and a little nyan.',
		],
	},
	{
		version: '0.7.5',
		date: '2026-10-04',
		title: 'Their own voices',
		changes: [
			'Each pet has its own lines on top of the shared ones: the unicorn neighs and polishes its horn, Nyan Cat purrs and asks for pop-tarts.',
		],
	},
	{
		version: '0.7.4',
		date: '2026-10-04',
		title: 'Smooth turns and floating treats',
		changes: [
			'Turning round is a quick flip instead of a snap, and the rainbow swings round with it.',
			"Fixed dim or missing pieces in Nyan Cat's rainbow.",
			'Nyan Cat gets its own treats: pop-tarts, cake, donuts, ice cream, fish and milk.',
			'Treats follow Gravity: they float when it is off and drop to the floor when it is on.',
		],
	},
	{
		version: '0.7.3',
		date: '2026-10-04',
		title: 'Rainbow screen',
		changes: [
			"Nyan Cat's rainbow sits straight behind it and swings out behind when you drag or fling it.",
			'Nyan party: Nyan Cat grows big with its space background and song. Try it on the Fun page.',
			'Rainbow puffs get a screen effect too: stepped rainbow bands and twinkling stars at the edges.',
		],
	},
	{
		version: '0.7.0',
		date: '2026-10-04',
		title: 'Shimeji, and Nyan Cat',
		changes: [
			'Sparkle is now Shimeji: pick your pet on the new Pet page.',
			'Nyan Cat joins the unicorn, with its rainbow trail, twinkling stars and rainbow puffs instead of bubbles.',
		],
	},
	{
		version: '0.6.0',
		date: '2026-10-03',
		title: 'Treats, feelings and a name',
		changes: [
			'Rename it: the Name field on the settings page; it uses the new name when it talks.',
			"Happiness: petting, taps and treats fill it, time drains it. When it gets lonely it asks for attention. How it's doing shows where it stands.",
			'Treats: every few minutes a cupcake, cookie, strawberry, candy or carrot drops in. Tap it and it runs over to eat it.',
			'Shows up: "Only while typing" keeps it hidden until the keyboard comes up. It now stands on top of the keyboard instead of behind it.',
			'Tip the top of the phone down and it floats up the screen (with Gravity on); tip it back and it falls.',
			'Sounds stay quiet while your phone is on silent or vibrate. Turn off "Quiet on silent" to hear them anyway.',
		],
	},
	{
		version: '0.5.2',
		date: '2026-10-03',
		title: 'Changelog',
		changes: [
			'The clock icon at the top right of the settings shows what changed in every version.',
			'After an update, a short "What\'s new" dialog lists the changes the next time you open the settings.',
		],
	},
	{
		version: '0.1.0',
		date: '2026-09-27',
		title: 'First release',
		changes: [
			'A pixel unicorn that lives on top of Discord.',
		],
	},
]
