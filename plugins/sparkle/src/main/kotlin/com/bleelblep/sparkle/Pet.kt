package com.bleelblep.sparkle

import android.content.Context
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Paint
import android.graphics.RectF
import android.graphics.drawable.GradientDrawable
import android.os.Build
import android.os.SystemClock
import android.util.TypedValue
import android.view.HapticFeedbackConstants
import android.view.MotionEvent
import android.view.View
import android.view.ViewGroup
import android.view.WindowInsets
import android.widget.FrameLayout
import android.widget.ImageView
import android.widget.TextView
import kotlin.math.PI
import kotlin.math.abs
import kotlin.math.atan2
import kotlin.math.cos
import kotlin.math.exp
import kotlin.math.hypot
import kotlin.math.sign
import kotlin.math.sin
import kotlin.random.Random

/**
 * Sparkle: a pixel unicorn living on top of Discord.
 *
 * The behaviour follows the design of the exteraGram pet "Clawd" by @itskotovski (the states, the
 * flick physics, peeking, petting, shaking), reimplemented from scratch for Android views with its own
 * phrases; no code from it is used. The art is the unicorn sprite set in sprites/.
 *
 * Everything here runs on the main thread: [tick] drives a small state machine, positions a [PetView]
 * added to the app's DecorView, and moves a speech bubble and a few particles alongside it.
 */
internal enum class State { IDLE, WALK, PRESS, DRAG, PET, FLY, HANG, PEEK, SLEEP, LEAVING, STUCK, SEEK }

/** Small, Medium and Large, in dp: the slider's stops, and what the old three-way setting meant. */
internal val SIZE_DP = floatArrayOf(52f, 64f, 80f)
/** The slider's range, in dp. */
internal const val SIZE_MIN_DP = 40
internal const val SIZE_MAX_DP = 110

/**
 * Cats and dogs are drawn side-on, low and long, so at the unicorn's width they read as tiny:
 * they're shown this much bigger at every size.
 */
private const val SMALL_ANIMAL_SCALE = 1.7f
private val SLEEP_SECONDS = intArrayOf(60, 180, 600, 0)

/** Walking pace, dp/s; a trot is twice this. */
private const val WALK_SPEED = 42f

/**
 * How lively it is between touches, per the Activity slider (Calm, Normal, Lively, Hyper). Calm is
 * the old behaviour. Times in seconds, distances in dp.
 * [gap]: between decisions. [walk]: share of decisions that are a walk. [dist]: a walk's length.
 * [stroll]: chance a walk is a long stroll to anywhere on screen. [trot]: chance it hurries.
 * [rest]: standing still after a walk. [nap]: how long a nap lasts before it wakes on its own.
 */
private class Activity(
	val gap: ClosedFloatingPointRange<Float>,
	val walk: Float,
	val dist: ClosedFloatingPointRange<Float>,
	val stroll: Float,
	val trot: Float,
	val rest: ClosedFloatingPointRange<Float>,
	val nap: ClosedFloatingPointRange<Float>,
)

private val ACTIVITY = arrayOf(
	Activity(3.5f..9f, 0.38f, 40f..160f, 0f, 0f, 2.5f..6f, 180f..360f),
	Activity(2f..5f, 0.55f, 60f..260f, 0.15f, 0.2f, 1.5f..4f, 90f..180f),
	Activity(1.2f..3.5f, 0.65f, 80f..360f, 0.25f, 0.35f, 0.8f..2.5f, 60f..120f),
	Activity(0.6f..2f, 0.75f, 100f..500f, 0.35f, 0.5f, 0.3f..1.2f, 30f..60f),
)

private fun ClosedFloatingPointRange<Float>.pick() = start + Random.nextFloat() * (endInclusive - start)
private val activity get() = ACTIVITY[Settings.activity.coerceIn(0, ACTIVITY.size - 1)]
private const val PEEK_AFTER = 45f
/** Turns of the drag path that wind Sparkle up for a fling to the top. */
private const val WIND_TURNS = 2.5f
/** How far below the top it has to be dragged before it lets go of the status bar. */
private const val UNSTICK_DP = 56f
/** Below this much happiness (0..100) it gets lonely and asks for attention. */
private const val LONELY = 30
/** Reputation drifts one point back toward 0 this often: it forgives (and forgets) slowly. */
private const val REP_DRIFT_MS = 15 * 60_000L
/** When it adores you, it gives back whatever it took after this long (Pet's clock, seconds). */
private const val ADORE_RETURN_AFTER = 45f
/** Happiness drains one point per this many milliseconds, on or off screen. */
private const val LOVE_DRAIN_MS = 120_000L
/** Seconds an untouched treat stays before it fades. */
private const val TREAT_LIFETIME = 75f
/** In "while typing" mode, how long after the keyboard closes it stays. */
private const val TYPING_LINGER = 4f

internal object Phrases {
	/**
	 * Lines any pet can say. Each moment's line is picked from these plus the current pet's own
	 * ([unicorn], [nyan]), so both keep the generic ones and add their own flavour. Anything that
	 * names a horn, a pop-tart or a sound only one animal makes belongs in a pet's own set.
	 */
	val shared = mapOf(
		"hello" to listOf("Hi! I'm {me}!", "Oh, hello!"),
		"idle" to listOf("Nice server", "Hmm…", "Drink some water!", "You're doing great", "Who's online?", "*hums*"),
		"tap" to listOf("Hey!", "Boop!", "Hehe", "Yes?", "I'm here!"),
		"annoyed" to listOf("Okay, that's enough poking", "Rude!", "Hmph"),
		"pet" to listOf("So nice…", "More please!", "♥", "Best human"),
		"drag" to listOf("Where are we going?", "Wheee!", "Put me down!"),
		"throw" to listOf("I can fly!", "Weeee!"),
		"dizzy" to listOf("Everything's spinning…", "@_@", "Which way is up?"),
		"wake" to listOf("Huh? I'm awake!", "*yawns*", "Five more minutes…"),
		"jump" to listOf("Boing!", "Yay!", "Hop!"),
		"hang" to listOf("Hanging on!", "It's high up here!", "Help!"),
		"hang_fall" to listOf("Whoa!", "Can't hold on!", "Falling!"),
		"wound" to listOf("Wheeeee!", "Spin me round!", "Faster!"),
		"rocket" to listOf("To the top!", "Up up up!"),
		"stuck" to listOf("I'm stuck!", "Nice view up here", "I live here now", "Pull me down?", "Don't mind me"),
		"unstuck" to listOf("Freedom!", "Back down we go", "Thanks!"),
		"peek" to listOf("Peekaboo!", "I see you", "*peeks*"),
		"found" to listOf("You found me!", "I wasn't hiding!", "Oh, hi!"),
		"shake" to listOf("Earthquake!", "Stop shaking!", "Aaaah!"),
		"slide" to listOf("Slippery!", "Wheee~", "I'm sliding!"),
		"eat" to listOf("Crunchy!", "Yum, pixels", "*munch munch*", "Tastes like a button", "Oops, I ate that"),
		"spit" to listOf("Okay, here you go!", "Ptooey!", "Sorry, sorry!", "Giving it back!"),
		"mail" to listOf("New message!", "Someone wrote!", "Ding!", "Ooh, a message"),
		"mention" to listOf("Someone mentioned you!", "You got pinged!", "Hey, that's you!"),
		"love" to listOf("Aww ♥", "So sweet!", "Love!", "♥♥♥"),
		"laugh" to listOf("Hahaha!", "Hehe!", "That's funny!"),
		"hi" to listOf("Hi hi!", "Hello!", "*waves*"),
		"bye" to listOf("Bye bye!", "See you!", "*waves*", "Come back soon!"),
		"sleepy" to listOf("Sweet dreams!", "*yawns*", "Nap time?", "Night night!"),
		"sad" to listOf("Aww… *hugs*", "It'll be okay", "*pats*", "Sending hugs"),
		"wow" to listOf("Whoa!", "No way!", "Wow!", "Really?!"),
		"party" to listOf("Yay!", "Party time!", "Congrats!", "Woohoo!"),
		"cool" to listOf("*puts on shades*", "So cool!", "Let's gooo!", "Hype!"),
		"food" to listOf("Did someone say {name}?", "Ooh, {name}!", "Can I have some {name}?", "Snacks?", "I'm hungry now"),
		"music" to listOf("♪ La la la ♪", "*bops along*", "Ooh, a song!", "Turn it up!"),
		"thanks" to listOf("So polite!", "Aww ♥", "Manners!"),
		"sent" to listOf("Sent!", "Off it goes!", "Nice one!"),
		"essay" to listOf("That's a whole essay!", "So many words!", "A novel!"),
		"channel_new" to listOf("Ooh, {name}!", "What's happening in {name}?", "Hi, {name}!"),
		"channel_again" to listOf("Back to {name}?", "{name} again!", "We love {name}"),
		"voice_join" to listOf("Ooh, voice chat!", "Let's hang out!", "*listens*"),
		"voice_leave" to listOf("Bye, voice!", "That was fun"),
		"charging" to listOf("Charging up!", "Yum, electricity", "Power!"),
		"low_battery" to listOf("Battery's low…", "So sleepy…", "Need a charger…"),
		"bubbles" to listOf("*blows*", "Look!"),
		"magic" to listOf("Abracadabra!", "Watch this!", "{me} power!", "Ta-da!"),
		"lonely" to listOf("Pet me?", "I'm a bit lonely…", "Hey… notice me?", "*sniffles*", "Can I have a treat?", "Pay attention to {me}!", "*nudges you*"),
		"missed" to listOf("You're back! I missed you!", "Where were you?", "Finally! Hi!", "I waited for you!"),
		"content" to listOf("I love it here ♥", "Best day ever", "*happy hums*", "You're my favourite"),
		"treat_spotted" to listOf("Ooh, a {name}!", "Is that a {name}?", "A {name}! Can I have it?", "*sniffs* {name}?"),
		"treat_eaten" to listOf("Yummy {name}!", "Thank you!", "*munch munch*", "Best {name} ever!", "More please!"),
		"treat_gone" to listOf("Aww, it's gone", "My {name}…", "Too slow…"),
		"rep_up" to listOf("Okay… you're alright", "Maybe I'll take less", "*warms up to you*"),
		"rep_down" to listOf("I'm keeping score.", "Your buttons look tasty…", "Hmph."),
		"rep_adore" to listOf("You're my favourite ♥", "Fine, keep your buttons", "I trust you ♥"),
		"rep_grudge" to listOf("That's it. Your buttons are MINE.", "I'm taking everything.", "You'll regret that."),
		"give_back" to listOf("Here, you can have it back ♥", "Just borrowing!", "Sorry, here you go"),
		"typing_hello" to listOf("Ooh, what are we writing?", "Typing? I'll watch!", "Hi! Don't mind me", "*peeks at your message*"),
		"typing" to listOf("Ooh, gossip?", "*watches you type*", "Spell it right!", "Say hi from me!", "Don't forget the emoji"),
		"float" to listOf("I'm floating!", "Whoa, which way is down?", "Wheee, up!"),
	)

	/** The unicorn's own: horn, mane, hooves, neighs, sparkles and soap bubbles. */
	val unicorn = mapOf(
		"party" to listOf("*rainbow confetti*"),
		"cool" to listOf("*horn sparkles*"),
		"hello" to listOf("*sparkles*", "*tosses mane*"),
		"idle" to listOf("*swishes tail*", "Rainbows are free", "*polishes horn*", "*paws the ground*"),
		"tap" to listOf("*neigh?*"),
		"annoyed" to listOf("My horn is not a button", "*stamps hoof*"),
		"pet" to listOf("*happy neigh*", "Brush my mane next?", "*nuzzles*"),
		"throw" to listOf("Rainbow speed!", "Hooves up!"),
		"wake" to listOf("*stretches legs*"),
		"rocket" to listOf("Rainbow rocket!"),
		"charging" to listOf("Horn fully charged!"),
		"bubbles" to listOf("Bubbles!", "Pop them all!", "So shiny!"),
		"magic" to listOf("A little magic~", "*horn glows*"),
		"lonely" to listOf("*sad little neigh*"),
		"content" to listOf("*happy prance*"),
		"float" to listOf("Unicorns can fly, you know"),
	)

	/** The cats' own: meows, purrs, slow blinks and knocking things off tables. */
	val cat = mapOf(
		"sad" to listOf("*gentle headbutt*"),
		"food" to listOf("Is it tuna?", "*meows at the {name}*"),
		"sleepy" to listOf("*curls up*"),
		"hello" to listOf("Meow!", "Mrrp!", "*slow blink*"),
		"idle" to listOf("*licks paw*", "*stares at nothing*", "*tail flick*", "Is it dinner yet?", "*kneads the air*"),
		"tap" to listOf("Mrrp?", "Meow?"),
		"annoyed" to listOf("*hisses*", "Don't touch the tail", "I will knock something over"),
		"pet" to listOf("*purrs*", "Chin scratches, please", "Behind the ears…", "*slow blink*"),
		"drag" to listOf("Put me down, human"),
		"throw" to listOf("Cats land on their feet!", "Meooow!"),
		"wake" to listOf("*big stretch*", "*yawns*… meow"),
		"hang" to listOf("Claws in!"),
		"eat" to listOf("Knocked it off the table, then ate it", "It was in my way"),
		"laugh" to listOf("*amused meow*"),
		"bubbles" to listOf("*bats at them*", "Must catch!"),
		"magic" to listOf("*mysterious cat stare*"),
		"lonely" to listOf("*sad meow*", "Pay attention to me, human"),
		"content" to listOf("*happy purring*", "*slow blink*"),
		"typing" to listOf("*sits on your keyboard*", "*bats at the cursor*"),
	)

	/** The dogs' own: woofs, tail wags, fetch and belly rubs. */
	val dog = mapOf(
		"bye" to listOf("*whines*"),
		"food" to listOf("FOOD?!", "*drools*", "Share the {name}?"),
		"party" to listOf("*zoomies*"),
		"hello" to listOf("Woof!", "Hi hi hi!", "*tail wagging*"),
		"idle" to listOf("*wags tail*", "Walk? Walk?", "*sniffs around*", "Is that a squirrel?", "*pants happily*"),
		"tap" to listOf("Boof?", "Woof?"),
		"annoyed" to listOf("*grr*", "*huff*"),
		"pet" to listOf("Good dog? Me?", "Belly rubs!", "*tail wagging intensifies*", "*leg kicks*"),
		"drag" to listOf("Are we going to the park?"),
		"throw" to listOf("Fetch me!", "Wheee, woof!"),
		"wake" to listOf("*shakes it off*", "Is it walkies?"),
		"eat" to listOf("*nom nom*", "Was that food? It's food now"),
		"laugh" to listOf("*happy bork*"),
		"bubbles" to listOf("*tries to catch them*", "Snap snap!"),
		"magic" to listOf("Sit! Stay! Magic!"),
		"lonely" to listOf("*whimpers*", "*puppy eyes*"),
		"content" to listOf("Best friend ever!", "*happy tail*"),
		"typing" to listOf("Is that for me?", "*rests head on your hand*"),
	)

	/** Nyan Cat's own: purring, nyans, pop-tarts, rainbows and space. */
	val nyan = mapOf(
		"food" to listOf("Pop-tarts?!", "Is {name} a pop-tart?"),
		"music" to listOf("Nyan nyan nyan ♪"),
		"hello" to listOf("Nyan!", "Hi! Got any pop-tarts?", "Nyan nyan!", "*zooms in*"),
		"idle" to listOf("*paddles paws*", "Need more pop-tarts", "Nyan nyan nyan…", "*rainbow intensifies*", "*a sprinkle falls off*"),
		"tap" to listOf("Nya?", "Mrrp!"),
		"annoyed" to listOf("My pop-tart is not a button", "Nyan't!", "*hisses*"),
		"pet" to listOf("*purrs*", "Nyaaa~", "*kneads the air*", "Behind the ears, please"),
		"drag" to listOf("Nyan to where?"),
		"throw" to listOf("To the stars!", "Nyan speed!"),
		"dizzy" to listOf("I see pop-tarts…"),
		"wake" to listOf("Five more nyanutes…", "*big cat stretch*"),
		"hang" to listOf("Claws in!"),
		"rocket" to listOf("Nyan rocket!", "Back to space!"),
		"stuck" to listOf("Upside-down space!"),
		"eat" to listOf("Needs more frosting"),
		"laugh" to listOf("Nyahaha!"),
		"charging" to listOf("Rainbow power!"),
		"bubbles" to listOf("Rainbows!", "Nyan nyan nyan!", "*sprinkles everywhere*", "Taste the rainbow!"),
		"magic" to listOf("Space magic!", "*stars appear*"),
		"lonely" to listOf("Nyan… nyan?", "*sad meow*"),
		"content" to listOf("Best pop-tart life", "*happy purring*"),
		"typing" to listOf("Type faster, nyan!", "*sits on your keyboard*"),
		"float" to listOf("Just like space!"),
	)

	/** The Headless Horseman's own (Boss.kt). */
	val horseman = mapOf(
		"idle" to listOf("*sharpens the scythe*", "Have you seen my head?", "Nice night for a ride.", "*the pumpkin grins*"),
		"content" to listOf("*hollow chuckle*", "The pumpkin approves."),
		"happy" to listOf("*the pumpkin glows*"),
		"sad" to listOf("Lost my head again."),
		"wake" to listOf("...who goes there?"),
		"attack" to listOf("*swings*", "Hold still.", "Just a trim.", "Catch!"),
		"horse" to listOf("There you are, old friend.", "*whistles*"),
		"ride" to listOf("Ride!", "To the bridge!", "Yah!"),
	)
	/** Krampus's own (Boss.kt). */
	val krampus = mapOf(
		"idle" to listOf("*rattles the chain*", "Naughty list?", "Ho ho... no.", "*licks a horn*"),
		"content" to listOf("*the bell jingles*", "Coal for everyone."),
		"happy" to listOf("*wags the tongue*"),
		"sad" to listOf("Nobody was naughty today."),
		"wake" to listOf("*snort*"),
		"attack" to listOf("*swipe*", "Scratch that.", "Heads up!", "*snorts*"),
		"chain" to listOf("Got you.", "*the chain bites*", "Come here."),
	)
	/** The seasonal holiday pets' own: a little spooky, a little cosy. */
	val seasonal = mapOf(
		"hello" to listOf("Boo!", "Happy holidays!"),
		"idle" to listOf("*floats about*", "*drifts*", "Is it the season already?", "*bobs*"),
		"tap" to listOf("Ooh!", "Hehe", "Trick or treat?"),
		"party" to listOf("Happy holidays!", "Festive!"),
		"content" to listOf("Season's greetings!", "*festive wiggle*"),
		"lonely" to listOf("*sad little float*"),
	)
}

/** Sparkle's own view: the current frame, scaled with hard pixel edges and mirrored when needed. */
internal class PetView(context: Context) : View(context) {
	var frame: Bitmap? = null
	var flip = false
	private val paint = Paint().apply { isFilterBitmap = false; isAntiAlias = false }
	private val dest = RectF()

	override fun onDraw(canvas: Canvas) {
		val bmp = frame ?: return
		dest.set(0f, 0f, width.toFloat(), height.toFloat())
		// Turning round is a quick card flip: the scale eases through zero instead of mirroring at once.
		val target = if (flip) -1f else 1f
		val now = android.os.SystemClock.uptimeMillis()
		val dt = ((now - lastDraw) / 1000f).coerceIn(0f, 0.05f)
		lastDraw = now
		if (turn != target) {
			val stepBy = dt * 2f / TURN_SECONDS
			turn = if (turn < target) minOf(target, turn + stepBy) else maxOf(target, turn - stepBy)
			if (turn != target) postInvalidateOnAnimation()
		}
		if (turn != 1f) {
			canvas.save()
			canvas.scale(turn, 1f, width / 2f, 0f)
			canvas.drawBitmap(bmp, null, dest, paint)
			canvas.restore()
		} else {
			canvas.drawBitmap(bmp, null, dest, paint)
		}
	}

	/** -1..1: the horizontal scale actually drawn, easing to the [flip] target. The rainbow follows it. */
	var turn = 1f
		private set
	private var lastDraw = 0L

	/** True when [x],[y] (view pixels) land on the unicorn rather than the frame's empty space. */
	fun hits(x: Float, y: Float): Boolean {
		val bmp = frame ?: return false
		val sx = bmp.width / width.toFloat()
		val sy = bmp.height / height.toFloat()
		val cx = if (flip) width - x else x
		// A little slack around the art, so a slightly-off tap still counts.
		for (dx in intArrayOf(0, -4, 4)) for (dy in intArrayOf(0, -4, 4)) {
			val px = ((cx * sx).toInt() + dx).coerceIn(0, bmp.width - 1)
			val py = ((y * sy).toInt() + dy).coerceIn(0, bmp.height - 1)
			if ((bmp.getPixel(px, py) ushr 24) > 40) return true
		}
		return false
	}

	override fun onTouchEvent(event: MotionEvent): Boolean {
		if (event.actionMasked == MotionEvent.ACTION_DOWN && !hits(event.x, event.y)) return false
		return runCatching { Pet.onTouch(event) }.getOrDefault(false)
	}
}

/** How long the pet takes to turn round (PetView's card flip). */
private const val TURN_SECONDS = 0.22f

internal object Pet {
	private var decor: ViewGroup? = null
	private var view: PetView? = null
	/** Nyan Cat's rainbow and stars, just behind the pet (Trail.kt). */
	private var trail: TrailView? = null
	private var bubble: TextView? = null
	private val particles = ArrayList<View>()

	var state = State.IDLE
		private set
	private var running = false
	private var paused = false
	@Volatile var voiceConnected = false
		private set
	val voiceRestricted get() = voiceConnected && Settings.voiceMode >= 2
	private var voiceWasRestricted = false
	fun setVoiceConnected(connected: Boolean) {
		voiceConnected = connected
		syncVoiceMode()
	}
	fun syncVoiceMode() {
		if (voiceConnected && Settings.voiceMode != 0) {
			NyanParty.cancel()
			ScreenFx.cancel()
			partying = false
			Sounds.quietNow()
		}
		if (voiceRestricted) {
			voiceWasRestricted = true
			state = State.IDLE
			mood = null
			stuck = false; wound = false; rocket = false
			peekSide = 0; peekPending = 0
			hopActive = false; hopOff = 0f; hopVy = 0f; slideV = 0f
			vx = 0f; vy = 0f
			Bubbles.clear(); clearTreat(); Eater.restoreAll()
			for (p in particles.toList()) remove(p)
			particles.clear()
			bubble?.visibility = View.GONE
			trail?.visibility = View.INVISIBLE
			Phone.stop()
		} else if (voiceWasRestricted) {
			voiceWasRestricted = false
			lastInteraction = now()
			nextAction = now() + 3f
			rescheduleTimers()
		}
		view?.visibility = if (away || (voiceRestricted && Settings.voiceMode == 3)) View.INVISIBLE else View.VISIBLE
		if (running) schedule(0)
	}
	/** The Nyan party is on: the pet is hidden and still until it ends (NyanParty.kt). */
	private var partying = false
	private var nextParty = 0f

	/** States a spell or a Nyan party may interrupt; a sleeping pet wakes up for one. */
	private val FREE_FOR_EVENTS = setOf(State.IDLE, State.WALK, State.SLEEP)
	/** When one is due but the pet is busy, how long until it tries again. */
	private const val EVENT_RETRY_SECONDS = 10f

	// Position (top-left of the view) and velocity, in pixels.
	private var x = 0f
	private var y = 0f
	private var vx = 0f
	private var vy = 0f
	private var w = 1f
	private var h = 1f
	/** Empty margin either side of the unicorn: the cell is wider than it, to fit the blowing frames. */
	private var pad = 0f
	private var posReady = false
	private var facing = 1

	private var lastTick = 0L
	private var lastInteraction = 0f
	/** When it last woke up by itself (a nap, a party, a spell): sleep counts from this too. */
	private var wokeAt = 0f
	/** When the current nap ends. */
	private var napUntil = 0f
	private var nextAction = 0f

	// A hop is a vertical offset on top of the position, so it works while standing or walking.
	private var hopActive = false
	private var hopOff = 0f
	private var hopVy = 0f
	private var hopStart = 0f

	// A timed pose over the normal animation: a reaction, a fidget, an expression.
	private var mood: Anim? = null
	private var moodStill = -1
	private var moodUntil = 0f

	private var anim = Anim.IDLE
	private var animStart = 0f

	// Blowing: how many more bubbles stream out once the first leaves the wand, and how many of the
	// drawn ones (BlowRelease) have been handed over to Bubbles so far.
	private var blowLeft = 0
	private var released = 0

	private var walkTarget = 0f
	/** Gravity off: where on screen the walk ends vertically. NaN keeps its height (peeks, seeking). */
	private var walkTargetY = Float.NaN
	private var walkSpeed = WALK_SPEED
	private var walkIn = false
	private var slideV = 0f
	var tilt = 0f
	/** Forward/back tilt from Phone, -1..1: positive when the top of the phone has dipped. */
	var tiltY = 0f

	private var hangStart = 0f
	private var hangUntil = 0f
	private var peekSide = 0
	private var peekPending = 0
	private var peekOut = false
	private var peekPhaseUntil = 0f
	private var peekEnd = 0f
	private var peekMoving = false
	private var nextPeek = PEEK_AFTER

	private var shakeDizzy = false

	// Spin-and-fling: how far the drag path has turned (radians, signed), the heading it was last
	// moving in, whether that has wound Sparkle up, whether a fling is heading for the top, and
	// whether it is stuck to the status bar (kept through a tap or a pet while it hangs there).
	private var windAngle = 0f
	private var windHeading = Float.NaN
	private var windX = 0f
	private var windY = 0f
	private var windAt = 0f
	private var wound = false
	private var rocket = false
	private var stuck = false
	private var nextStuckTalk = 0f
	private var greet = false
	private var nextHeart = 0f
	/** Hearts so far in this petting, so each heart's blip climbs a little. */
	private var petHearts = 0
	private var lastTap = 0f
	/** Hidden in "while typing" mode, waiting for the keyboard. */
	private var away = false
	private var typingSeen = 0f
	private var shownWhen = -1
	/** Keyboard height in pixels (0 when closed), refreshed with the bounds. */
	private var keyboard = 0
	private val recentTaps = ArrayList<Float>()

	// Touch tracking.
	private var touchX0 = 0f
	private var touchY0 = 0f
	private var touchT0 = 0f
	private var touchOx = 0f
	private var touchOy = 0f
	private var petAnchor = 0f
	private var petDir = 0
	private val history = ArrayDeque<FloatArray>()
	private var dragVx = 0f

	private var bubbleUntil = 0f
	private var lastPhrase: String? = null
	private var boundsAt = 0f
	private val bounds = FloatArray(6)

	/** Set from start(): asks JS to have VFX show the spell. */
	var onMagic: () -> Unit = {}
	private var nextMagic = 0f

	/** Called whenever something worth saving changed: position, stats. */
	var onPersist: () -> Unit = {}
	/** Leaving finished (the outro played), so the views can go. */
	private var afterLeave: (() -> Unit)? = null

	private fun now(): Float = SystemClock.uptimeMillis() / 1000f

	private val tickRunnable = Runnable { tick() }

	// ---------------------------------------------------------------- lifecycle

	fun start(sayHello: Boolean) {
		if (!Settings.show) return
		if (sayHello) greet = true
		if (state == State.LEAVING) state = State.IDLE
		running = true
		lastTick = SystemClock.uptimeMillis()
		schedule(0)
	}

	/** Plays the exit animation, then removes everything. */
	fun leave(then: () -> Unit = {}) {
		if (view == null || !running) {
			stopNow()
			then()
			return
		}
		Eater.giveBackNow()
		Bubbles.clear()
		hideBubble()
		state = State.LEAVING
		setAnim(Anim.OUTRO)
		Sounds.leave()
		afterLeave = {
			stopNow()
			then()
		}
		schedule(0)
	}

	fun stopNow() {
		Boss.stop()
		running = false
		afterLeave = null
		if (partying) {
			NyanParty.cancel()
			partying = false
		}
		mainHandler.removeCallbacks(tickRunnable)
		Phone.stop()
		Eater.restoreAll()
		Bubbles.clear()
		detach()
		state = State.IDLE
		stuck = false
		rocket = false
		posReady = false
		away = false
	}

	fun resize() {
		val v = view ?: return
		val oldW = w
		val oldH = h
		measure()
		x += (oldW - w) / 2f
		y += oldH - h
		v.layoutParams = v.layoutParams.apply { width = w.toInt(); height = h.toInt() }
		hop(dp(300f))
	}

	fun recenter() {
		Settings.show = true
		start(false)
		ensureAttached()
		if (decor == null) return
		val b = bounds(now(), force = true)
		x = (b[0] + b[1]) / 2f
		y = (b[2] + b[3]) / 2f
		posReady = true
		state = State.IDLE
		vx = 0f; vy = 0f; slideV = 0f; peekSide = 0; peekPending = 0
		stuck = false; rocket = false
		lastInteraction = now()
		hop(dp(500f), quiet = true)
		repeat(3) { spawn(Particle.SPARK) }
		Sounds.appear()
		say("hello")
		savePosition()
		schedule(0)
	}

	/** The cats' and dogs' outline colour, from the setting and (automatic) the Discord theme. */
	private fun updateOutline() {
		SheetLook.outlineColour = when (Settings.outline) {
			0 -> 0
			2 -> 0xFFF2F3F5.toInt()
			3 -> 0xFF1E1F22.toInt()
			// Automatic: the theme's text colour, which always stands out against its background.
			else -> decor?.context?.let { runCatching { discordPalette(it).text }.getOrNull() } ?: 0xFFF2F3F5.toInt()
		}
	}

	private fun schedule(delayMs: Long) {
		mainHandler.removeCallbacks(tickRunnable)
		if (running) mainHandler.postDelayed(tickRunnable, delayMs)
	}

	private fun measure() {
		// The size setting is the width of the character itself (the look's refW in cell pixels), so it
		// stays the same size however wide the cell grows for frames with things beside it.
		val look = Looks.current
		val boost = if (Looks.kind == Looks.Kind.CAT || Looks.kind == Looks.Kind.DOG) SMALL_ANIMAL_SCALE else 1f
		val target = dp(Settings.sizeDp.coerceIn(SIZE_MIN_DP, SIZE_MAX_DP).toFloat()) * boost
		w = target * look.cellW / look.refW
		h = target * look.cellH / look.refW
		pad = (w - target) / 2f
	}

	private fun mainDecor(): ViewGroup? =
		windowRoots().filterIsInstance<ViewGroup>().maxByOrNull { it.width.toLong() * it.height }

	private fun ensureAttached() {
		val root = mainDecor() ?: return
		if (decor === root && view?.parent === root) return
		detach()
		decor = root
		measure()
		val context = root.context
		val rainbow = TrailView(context)
		root.addView(rainbow, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))
		trail = rainbow
		val pet = PetView(context)
		if (away) pet.visibility = View.INVISIBLE
		root.addView(pet, FrameLayout.LayoutParams(w.toInt(), h.toInt()))
		view = pet
		val text = TextView(context).apply {
			setTextSize(TypedValue.COMPLEX_UNIT_DIP, 13f)
			maxWidth = dp(220f).toInt()
			val pad = dp(10f).toInt()
			setPadding(pad, dp(6f).toInt(), pad, dp(6f).toInt())
			ggSans(context)?.let { typeface = it }
			visibility = View.GONE
		}
		root.addView(text, FrameLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT))
		bubble = text
		posReady = false
		Eater.attach(root)
	}

	private fun detach() {
		clearTreat()
		for (p in particles.toList()) remove(p)
		particles.clear()
		remove(bubble)
		remove(view)
		remove(trail)
		bubble = null
		view = null
		trail = null
		ScreenFx.cancel()
		Boss.detach()
		decor = null
		Eater.detach()
	}

	private fun remove(v: View?) {
		v ?: return
		runCatching { v.animate().cancel() }
		(v.parent as? ViewGroup)?.removeView(v)
	}

	// ---------------------------------------------------------------- the loop

	private fun tick() {
		if (!running) return
		runCatching { step() }.onFailure { android.util.Log.e("Sparkle", "tick failed", it) }
		if (running) schedule(nextDelay())
	}

	private fun nextDelay(): Long {
		if (view == null || paused) return 800
		if (partying || Boss.riding) return 250
		if (away) return 250
		val t = now()
		return when {
			state in setOf(State.PRESS, State.DRAG, State.PET, State.FLY, State.WALK, State.LEAVING, State.SEEK) -> 16
			hopActive || walkIn || slideV != 0f || peekMoving || (treat != null && !treatLanded) -> 16
			strip != null || Boss.busy -> 33
			mood != null && t < moodUntil -> 33
			state == State.HANG || state == State.PEEK || state == State.STUCK -> 33
			state == State.SLEEP -> 200
			else -> 50
		}
	}

	private var attachCheck = 0f

	private fun step() {
		val t = now()
		val dt = ((SystemClock.uptimeMillis() - lastTick) / 1000f).coerceIn(0f, 0.05f)
		lastTick = SystemClock.uptimeMillis()

		if (t >= attachCheck) {
			attachCheck = t + 1f
			ensureAttached()
			updateOutline()
			Eater.prune()
		}
		val root = decor ?: return
		val v = view ?: return
		// Backgrounded, or the window is hidden: nothing to draw, no sensors.
		val visible = root.windowVisibility == View.VISIBLE && root.width > 0
		if (!visible) {
			if (!paused) {
				paused = true
				Phone.stop()
			}
			return
		}
		if (paused) {
			paused = false
			lastTick = SystemClock.uptimeMillis()
		}
		if (partying || Boss.riding) return
		val b = bounds(t)
		if (voiceRestricted && Settings.show) {
			if (!posReady) {
				x = b[0] + (b[1] - b[0]) * (Settings.posX / 1000f)
				y = b[2] + (b[3] - b[2]) * (Settings.posY / 1000f)
				posReady = true
			}
			greet = false
			Phone.stop()
			v.visibility = if (Settings.voiceMode == 3 || (Settings.showWhen == 1 && keyboard <= 0)) View.INVISIBLE else View.VISIBLE
			v.frame = Looks.current.frame(Anim.IDLE, t)
			v.flip = facing < 0
			v.rotation = 0f
			v.layoutParams = v.layoutParams.apply { width = w.toInt(); height = h.toInt() }
			v.translationX = clamp(x, b[0], b[1]); v.translationY = clamp(y, b[2], b[3])
			v.invalidate()
			return
		}
		if (stepTyping(t, b, v)) return
		Phone.start(root.context)
		Sounds.attach(root.context)

		if (!posReady) {
			x = b[0] + (b[1] - b[0]) * (Settings.posX / 1000f)
			y = b[2] + (b[3] - b[2]) * (Settings.posY / 1000f)
			posReady = true
			lastInteraction = t
			if (greet) {
				greet = false
				hop(dp(420f), quiet = true)
				Sounds.appear()
				say(if (love() < LONELY) "missed" else "hello")
			}
		}

		if (state == State.LEAVING) {
			stepLeaving(t, b)
			render(t, v)
			return
		}
		if (state == State.PRESS && t - touchT0 >= 0.4f) startPet(t)

		when (state) {
			State.PET -> if (t >= nextHeart) {
				nextHeart = t + 0.45f
				spawn(Particle.HEART)
				Sounds.heart(petHearts++)
				haptic(HapticFeedbackConstants.CLOCK_TICK)
				addLove(2)
			}
			State.FLY -> stepFly(dt, t, b)
			State.STUCK -> stepStuck(t, b)
			State.HANG -> stepHang(t, b)
			State.PEEK -> stepPeek(dt, t, b)
			State.IDLE, State.WALK, State.SLEEP -> stepGround(dt, t, b)
			State.SEEK -> stepSeek(dt, t, b)
			else -> {}
		}
		Boss.tick(t, dt, b)
		stepTreat(dt, t, b)
		if (Settings.treats && treat == null) {
			if (nextTreat == 0f) nextTreat = t + (60f + Random.nextFloat() * 120f) * rateScale(Settings.treatRate)
			else if (t >= nextTreat) dropTreat()
		}

		if (hopActive) {
			hopOff += hopVy * dt
			hopVy += dp(2600f) * dt
			if (hopOff >= 0f) {
				hopOff = 0f
				hopVy = 0f
				hopActive = false
			}
		}
		render(t, v)
		updateBubble(t, b)
		stepBlow(t)
		if (Settings.magic && t >= nextMagic) castMagic()
		if (Settings.nyanParty && Settings.look == Looks.NYAN) {
			if (nextParty == 0f) nextParty = t + (900f + Random.nextFloat() * 1500f) * rateScale(Settings.partyRate)
			else if (t >= nextParty) {
				// As with spells: a sleeping pet wakes for it, a busy one gets another go shortly.
				if (state in FREE_FOR_EVENTS && !Boss.busy) {
					nextParty = t + (900f + Random.nextFloat() * 1500f) * rateScale(Settings.partyRate)
					if (state == State.SLEEP) {
						state = State.IDLE
						wokeAt = t
					}
					party()
				} else nextParty = t + EVENT_RETRY_SECONDS
			}
		}
	}

	/**
	 * The Nyan party (NyanParty.kt): the pet hides, a big Nyan Cat grows out of where it was, and it
	 * comes back when the party ends. Nyan Cat only. [force]: the settings page's test button, which
	 * also plays the music whatever the sound settings say.
	 */
	fun party(force: Boolean = false) {
		if (voiceConnected && Settings.voiceMode != 0) return
		val root = decor ?: return
		val v = view ?: return
		if (partying || Looks.current !== NyanLook || away || (paused && !force)) return
		val from = android.graphics.RectF(x, y + hopOff, x + w, y + hopOff + h)
		partying = true
		if (state == State.WALK) state = State.IDLE
		v.visibility = View.INVISIBLE
		bubble?.visibility = View.GONE
		trail?.let {
			it.off = true
			it.clear()
		}
		NyanParty.start(root, from, force) {
			partying = false
			v.visibility = if (away) View.INVISIBLE else View.VISIBLE
			setMood(Anim.HAPPY, 1.6f)
			lastTick = SystemClock.uptimeMillis()
			schedule(0)
		}
	}

	/** [minX, maxX, minY, maxY, width, height] for the view's top-left corner. */
	private fun bounds(t: Float, force: Boolean = false): FloatArray {
		if (!force && t - boundsAt < 0.4f) return bounds
		val root = decor ?: return bounds
		var top = 0
		var bottom = 0
		runCatching {
			val insets = root.rootWindowInsets
			if (insets != null) {
				// The keyboard is its own window over Discord's, so Sparkle stands on top of it rather
				// than going underneath; it is also how "while typing" mode knows you're typing.
				if (Build.VERSION.SDK_INT >= 30) {
					val bars = insets.getInsets(WindowInsets.Type.systemBars())
					val ime = insets.getInsets(WindowInsets.Type.ime()).bottom
					top = bars.top
					bottom = maxOf(bars.bottom, ime)
					keyboard = if (ime > bars.bottom) ime else 0
				} else {
					@Suppress("DEPRECATION")
					top = insets.systemWindowInsetTop
					@Suppress("DEPRECATION")
					bottom = insets.systemWindowInsetBottom
					keyboard = if (bottom > root.height * 0.15f) bottom else 0
				}
			}
		}
		val width = root.width.toFloat()
		val height = root.height.toFloat()
		bounds[0] = -pad
		bounds[1] = (width - w + pad).coerceAtLeast(-pad)
		// The top of every frame is empty headroom (for the bubbles and hops drawn into some frames),
		// so the view may tuck that part under the status bar.
		bounds[2] = top - h * 0.12f
		bounds[3] = (height - bottom - h).coerceAtLeast(bounds[2])
		bounds[4] = width
		bounds[5] = height
		boundsAt = t
		return bounds
	}

	// ---------------------------------------------------------------- states

	private fun stepGround(dt: Float, t: Float, b: FloatArray) {
		val (minX, maxX, minY, maxY) = b
		walkIn = false
		if (t < holdUntil && !hopActive) {
			if (state == State.WALK) state = State.IDLE
			return
		}
		if (state != State.WALK) {
			if (x < minX - 0.5f || x > maxX + 0.5f) {
				// Walks back in from wherever it was left, e.g. after a rotation or a peek.
				val stepX = dp(60f) * dt
				if (x < minX) { x = minOf(minX, x + stepX); facing = 1 } else { x = maxOf(maxX, x - stepX); facing = -1 }
				walkIn = true
			} else x = clamp(x, minX, maxX)
		}

		if (Settings.gravity) {
			if (y < maxY - 0.5f && !hopActive) {
				fall(if (state == State.WALK) dp(42f) * facing else 0f)
				return
			}
			if (!hopActive && liftAccel() > gravityAccel()) {
				// The top of the phone dipped far enough that "down" is now up the screen.
				if (state == State.SLEEP) Sounds.wake()
				fall(0f)
				vy = -dp(160f)
				if (Random.nextFloat() < 0.3f) say("float")
				return
			}
			y = minOf(y, maxY)
			if (stepSlide(dt, t, minX, maxX)) return
		} else {
			y = clamp(y, minY, maxY)
			slideV = 0f
		}

		if (state == State.WALK) {
			// Straight towards the target, sideways only with Gravity on (or with no target height).
			val ty = if (Settings.gravity || walkTargetY.isNaN()) y else walkTargetY
			val dx = walkTarget - x
			val dy = ty - y
			val dist = hypot(dx, dy)
			val step = dp(walkSpeed) * dt
			if (abs(dx) > 0.5f) facing = if (dx > 0) 1 else -1
			val reached = dist <= step
			if (reached) {
				x = walkTarget
				y = ty
			} else {
				x += dx / dist * step
				y += dy / dist * step
			}
			val edge = (dx < 0 && x <= minX) || (dx > 0 && x >= maxX)
			if (reached || edge) {
				x = clamp(x, minX, maxX)
				if (!Settings.gravity) y = clamp(y, minY, maxY)
				walkTargetY = Float.NaN
				walkSpeed = WALK_SPEED
				state = State.IDLE
				nextAction = t + activity.rest.pick()
				val side = peekPending
				peekPending = 0
				if (side != 0 && ((side < 0 && x <= minX + dp(4f)) || (side > 0 && x >= maxX - dp(4f)))) {
					startPeek(t, side)
					return
				}
				savePosition()
			}
			return
		}

		if (state == State.SLEEP) {
			// A nap, not for good: it wakes by itself, has a stretch and carries on.
			if (t >= napUntil) wakeUp(t)
			return
		}

		val timeout = SLEEP_SECONDS[Settings.sleepAfter.coerceIn(0, SLEEP_SECONDS.size - 1)]
		if (timeout > 0 && t - maxOf(lastInteraction, wokeAt) > timeout && !hopActive && !walkIn && mood == null) {
			state = State.SLEEP
			napUntil = t + activity.nap.pick()
			hideBubble()
			Sounds.sleep()
			return
		}
		if (t < nextAction || hopActive || walkIn || (mood != null && t < moodUntil)) return
		nextAction = t + activity.gap.pick()

		if (Settings.grudges && Eater.hasEaten() && repTier() == 2 && t - Eater.lastBite > ADORE_RETURN_AFTER) {
			giveBackKindly(t)
			return
		}
		val eatChance = if (Settings.grudges && repTier() < 0) 0.6f else 0.3f
		if (Settings.eat && Eater.ready(t) && Random.nextFloat() < eatChance) {
			val mouth = mouth()
			if (Eater.tryEat(t, bounds[2], mouth[0], mouth[1], x + w / 2f, y + along(0.5f))) {
				if (Settings.grudges && repTier() == -2 && Random.nextFloat() < 0.4f) Eater.hurry(t)
				return
			}
		}
		val love = love()
		if (love < LONELY && Random.nextFloat() < 0.35f) { askForAttention(minX, maxX); return }
		if (love >= 85 && Random.nextFloat() < 0.1f) {
			setMood(Anim.HAPPY, 1.8f)
			spawn(Particle.HEART)
			say("content")
			return
		}
		if (keyboard > 0 && Random.nextFloat() < 0.18f) { say("typing"); return }
		val roll = Random.nextFloat()
		if (!Settings.wander) {
			if (roll < 0.5f) facing = if (Random.nextBoolean()) 1 else -1
			return
		}
		if (t >= nextPeek && t - lastInteraction > PEEK_AFTER && roll < 0.3f) {
			val side = if (x - minX < maxX - x) -1 else 1
			walkTarget = if (side < 0) minX else maxX
			walkTargetY = Float.NaN
			walkSpeed = WALK_SPEED
			peekPending = side
			state = State.WALK
			return
		}
		val walkShare = activity.walk
		if (roll < walkShare) {
			wander(minX, maxX, minY, maxY)
			return
		}
		// Everything else keeps its old proportions, squeezed into what the walks leave.
		val r = 0.38f + (roll - walkShare) / (1f - walkShare) * 0.62f
		when {
			r < 0.55f -> facing = -facing
			r < 0.68f -> say("idle")
			r < 0.8f -> hop(dp(360f))
			r < 0.9f && Settings.bubbles -> blow()
			r < 0.95f -> setMood(Anim.VARIANT, 2.2f, Random.nextInt(4))
			else -> setMood(Anim.LOOK, Looks.current.duration(Anim.LOOK) + 0.4f)
		}
	}

	/**
	 * A walk of its own choosing: usually a short wander nearby, sometimes a long stroll to anywhere,
	 * now and then at a trot. With Gravity off it goes up and down too, not just sideways.
	 */
	private fun wander(minX: Float, maxX: Float, minY: Float, maxY: Float) {
		val a = activity
		var tx: Float
		var ty = Float.NaN
		if (Random.nextFloat() < a.stroll) {
			tx = minX + Random.nextFloat() * (maxX - minX)
			if (!Settings.gravity) ty = minY + Random.nextFloat() * (maxY - minY)
		} else {
			val d = dp(a.dist.pick())
			// Mostly sideways; with Gravity off, a random slant up or down.
			val angle = if (Settings.gravity) 0f else (Random.nextFloat() - 0.5f) * 1.6f
			tx = x + cos(angle) * d * (if (Random.nextBoolean()) 1 else -1)
			if (!Settings.gravity) ty = y + sin(angle) * d
		}
		tx = clamp(tx, minX, maxX)
		if (!ty.isNaN()) ty = clamp(ty, minY, maxY)
		if (hypot(tx - x, if (ty.isNaN()) 0f else ty - y) <= dp(12f)) return
		walkTarget = tx
		walkTargetY = ty
		walkSpeed = WALK_SPEED * (if (Random.nextFloat() < a.trot) 2f else 0.85f + Random.nextFloat() * 0.3f)
		state = State.WALK
	}

	/** Ends a nap by itself (or for a party or spell). Touches wake it through their own paths. */
	private fun wakeUp(t: Float) {
		state = State.IDLE
		wokeAt = t
		Sounds.wake()
		setMood(Anim.HAPPY, 1.2f)
		nextAction = t + 1f + Random.nextFloat()
	}

	private fun fall(startVx: Float) {
		state = State.FLY
		vx = startVx + slideV
		vy = 0f
		slideV = 0f
	}

	private fun gravityAccel() = dp(2600f)

	/** Upward pull from tipping the phone forward, px/s²; negative (tipped back) pushes down. */
	private fun liftAccel(): Float {
		if (!Phone.running) return 0f
		val dead = 0.12f
		if (abs(tiltY) <= dead) return 0f
		return (tiltY - dead * sign(tiltY)) * dp(9000f)
	}

	private fun tiltAccel(): Float {
		if (!Phone.running) return 0f
		val dead = 0.22f
		if (abs(tilt) <= dead) return 0f
		return (tilt - dead * sign(tilt)) * dp(2200f)
	}

	private fun stepSlide(dt: Float, t: Float, minX: Float, maxX: Float): Boolean {
		if (!hopActive) slideV += tiltAccel() * dt
		slideV *= exp(-2.5f * dt)
		if (abs(slideV) < dp(6f)) { slideV = 0f; return false }
		x += slideV * dt
		if (x < minX || x > maxX) {
			x = clamp(x, minX, maxX)
			if (abs(slideV) > dp(150f)) haptic(HapticFeedbackConstants.KEYBOARD_TAP)
			slideV = 0f
			return false
		}
		if (abs(slideV) < dp(60f)) return false
		if (state == State.SLEEP) setMood(Anim.SURPRISED, 0.8f)
		state = State.IDLE
		peekPending = 0
		facing = if (slideV > 0) 1 else -1
		if (Random.nextFloat() < 0.01f) say("slide")
		return true
	}

	private fun stepFly(dt: Float, t: Float, b: FloatArray) {
		val (minX, maxX, minY, maxY) = b
		x += vx * dt
		y += vy * dt
		if (Settings.gravity) {
			vy += (gravityAccel() - liftAccel()) * dt
			vx *= exp(-0.35f * dt)
			vx += tiltAccel() * dt
		} else {
			val friction = exp(-2f * dt)
			vx *= friction
			vy *= friction
		}
		var impact = 0f
		if (x < minX) { x = minX; impact = maxOf(impact, abs(vx)); vx = abs(vx) * 0.55f }
		else if (x > maxX) { x = maxX; impact = maxOf(impact, abs(vx)); vx = -abs(vx) * 0.55f }

		if (y < minY) {
			if (rocket) { stick(t); return }
			if (vy < -dp(250f) && !shakeDizzy) { startHang(t, minY); return }
			y = minY
			impact = maxOf(impact, abs(vy))
			vy = abs(vy) * 0.55f
		} else if (y > maxY) {
			y = maxY
			impact = maxOf(impact, abs(vy))
			if (Settings.gravity && vy < dp(380f)) {
				land(t)
			} else {
				vy = -abs(vy) * (if (Settings.gravity) 0.42f else 0.55f)
				if (Settings.gravity) vx *= 0.75f
			}
		}
		if (impact > dp(400f)) Sounds.thud(impact / dp(3000f))
		if (impact > dp(1500f)) crumbs(3)
		if (impact > dp(2300f)) {
			setMood(Anim.DIZZY, 2.6f)
			Sounds.dizzy()
			say("dizzy")
			haptic(HapticFeedbackConstants.LONG_PRESS)
		} else if (impact > dp(900f)) haptic(HapticFeedbackConstants.KEYBOARD_TAP)

		if (state == State.FLY && !Settings.gravity && hypot(vx, vy) < dp(45f)) land(t)
	}

	private fun land(t: Float) {
		state = State.IDLE
		rocket = false
		vx = 0f
		vy = 0f
		nextAction = t + Random.nextFloat() * 3f + 2f
		if (shakeDizzy) {
			shakeDizzy = false
			setMood(Anim.DIZZY, 3f)
			Sounds.dizzy()
			say("dizzy")
		}
		savePosition()
	}

	private fun startHang(t: Float, minY: Float) {
		state = State.HANG
		vx = 0f
		vy = 0f
		y = minY
		hangStart = t
		hangUntil = t + Random.nextFloat() * 1.5f + 2f
		haptic(HapticFeedbackConstants.KEYBOARD_TAP)
		Sounds.grab()
		if (Random.nextFloat() < 0.7f) say("hang")
	}

	/** Where the view sits when stuck: upside down, its rainbow tucked into the status bar. */
	private fun stuckY(): Float = bounds[2] + h * 0.07f

	private fun stick(t: Float) {
		state = State.STUCK
		stuck = true
		rocket = false
		vx = 0f
		vy = 0f
		y = stuckY()
		hangStart = t
		nextStuckTalk = t + 1.2f
		haptic(HapticFeedbackConstants.LONG_PRESS)
		Sounds.grab()
		Sounds.thud(0.6f)
		repeat(2) { spawn(Particle.SPARK) }
		savePosition()
	}

	/** Hangs on where it landed, swaying, and now and then comments on it. Only a drag frees it. */
	private fun stepStuck(t: Float, b: FloatArray) {
		x = clamp(x, b[0], b[1])
		y = stuckY()
		if (t >= nextStuckTalk) {
			nextStuckTalk = t + Random.nextFloat() * 25f + 20f
			if (t - hangStart < 2f || Random.nextFloat() < 0.5f) say("stuck")
		}
	}

	private fun stepHang(t: Float, b: FloatArray) {
		x = clamp(x, b[0], b[1])
		y = b[2]
		if (t < hangUntil) return
		state = State.FLY
		vx = 0f
		vy = if (Settings.gravity) dp(150f) else dp(700f)
		setMood(Anim.SURPRISED, 0.8f)
		Sounds.slip()
		if (Random.nextFloat() < 0.6f) say("hang_fall")
	}

	private fun startPeek(t: Float, side: Int) {
		state = State.PEEK
		peekSide = side
		peekOut = false
		peekPhaseUntil = t + Random.nextFloat() * 3f + 3f
		peekEnd = t + Random.nextFloat() * 30f + 30f
		facing = side
	}

	private fun stepPeek(dt: Float, t: Float, b: FloatArray) {
		val width = b[4]
		// Hidden: most of it past the edge. Out: enough showing to look back in.
		val body = w - pad * 2f
		val showing = pad + if (peekOut) body * 0.45f else body * 0.18f
		val target = if (peekSide > 0) width - showing else showing - w
		peekMoving = abs(target - x) > 0.5f
		if (peekMoving) {
			val stepX = dp(50f) * dt
			x = if (target > x) minOf(target, x + stepX) else maxOf(target, x - stepX)
		}
		facing = if (!peekOut && peekMoving) peekSide else -peekSide
		if (t < peekPhaseUntil || peekMoving) return
		if (t >= peekEnd) { endPeek(t); return }
		peekOut = !peekOut
		peekPhaseUntil = t + if (peekOut) Random.nextFloat() * 1.3f + 1.5f else Random.nextFloat() * 4f + 3f
		if (peekOut && Random.nextFloat() < 0.5f) say("peek")
	}

	private fun endPeek(t: Float) {
		val side = peekSide
		peekSide = 0
		peekMoving = false
		nextPeek = t + Random.nextFloat() * 60f + 60f
		state = State.IDLE
		if (side == 0) return
		walkTarget = if (side < 0) bounds[0] + dp(30f) else bounds[1] - dp(30f)
		walkTargetY = Float.NaN
		walkSpeed = WALK_SPEED
		state = State.WALK
		nextAction = t + Random.nextFloat() * 3f + 3f
	}

	private fun stepLeaving(t: Float, b: FloatArray) {
		// Flies off the top on its rainbow while the outro plays.
		y -= dp(420f) * (1f / 60f)
		x += dp(120f) * facing * (1f / 60f)
		if (t - animStart >= Looks.current.duration(Anim.OUTRO) + 0.2f || y + h < b[2] - dp(20f)) {
			val done = afterLeave
			afterLeave = null
			done?.invoke()
		}
	}

	// ---------------------------------------------------------------- drawing

	private fun setAnim(next: Anim) {
		if (next != anim) {
			anim = next
			animStart = now()
		}
	}

	private fun setMood(next: Anim, seconds: Float, still: Int = -1) {
		mood = next
		moodStill = still
		moodUntil = now() + seconds
		animStart = now()
		anim = next
	}

	private fun compose(t: Float): Anim {
		if (mood != null && t >= moodUntil) mood = null
		return when {
			state == State.LEAVING -> Anim.OUTRO
			stuck && state in setOf(State.STUCK, State.PRESS, State.PET) &&
				Looks.current.hasMotionPoses -> Anim.HANG
			state == State.DRAG && wound &&
				Looks.current.hasMotionPoses -> Anim.SPIN
			state == State.DRAG -> Anim.SURPRISED
			state == State.FLY && mood != Anim.DIZZY && !rocket && liftAccel() > gravityAccel() * 0.8f -> Anim.SURPRISED
			state == State.FLY -> when (mood) { Anim.DIZZY -> Anim.DIZZY; Anim.SHAKE -> Anim.SHAKE; else -> Anim.SPIN }
			state == State.SEEK -> Anim.WALK
			state == State.HANG -> Anim.SURPRISED
			state == State.STUCK -> mood ?: Anim.IDLE
			state == State.PET -> Anim.HAPPY
			state == State.SLEEP -> Anim.SLEEP
			mood != null -> mood!!
			hopActive -> Anim.JUMP
			state == State.WALK || walkIn || (state == State.PEEK && peekMoving) -> Anim.WALK
			abs(slideV) > dp(60f) -> Anim.SURPRISED
			else -> Anim.IDLE
		}
	}

	private fun render(t: Float, v: PetView) {
		val next = compose(t)
		setAnim(next)
		val still = if (next == mood) moodStill else -1
		val elapsed = if (next == Anim.JUMP) t - hopStart else t - animStart
		val motionName = Motion.name(next)
		val motionFrame = motionName?.let { Motion.frame(it, elapsed) }
		val motion = if (motionFrame != null) MotionData.strips.getValue(motionName!!) else null
		v.frame = motionFrame ?: playingFrame(t) ?: Looks.current.frame(next, elapsed, still)
		v.flip = Looks.current.directional(next) && facing < 0
		// Motion cells include room for a full tumble. Keep their native pixel
		// scale rather than squeezing them into the normal logical pet cell.
		val pixelScale = w / Looks.current.cellW
		val frameW = if (motion != null) motion.w * pixelScale else w
		val frameH = if (motion != null) motion.h * pixelScale else h
		if (v.layoutParams.width != frameW.toInt() || v.layoutParams.height != frameH.toInt()) {
			v.layoutParams = v.layoutParams.apply { width = frameW.toInt(); height = frameH.toInt() }
		}
		val offsetX = if (motion == null) 0 else if (v.flip) Looks.current.cellW - motion.dx - motion.w else motion.dx
		v.translationX = x + offsetX * pixelScale
		v.translationY = (if (next == Anim.HANG && motion != null) bounds[2] else y + hopOff) + (motion?.dy ?: 0) * pixelScale
		v.rotation = when {
			motion != null && next == Anim.HANG -> 0f
			// Upside down on the status bar, swaying a little; also while tapped or petted up there.
			stuck && state in setOf(State.STUCK, State.PRESS, State.PET) -> 180f + sin((t - hangStart) * 2.2f) * 5f
			state == State.DRAG && wound -> (t * 900f) % 360f
			state == State.FLY && rocket -> (t * 1100f) % 360f
			state == State.FLY -> clamp(vx / dp(70f), -25f, 25f)
			state == State.HANG -> sin((t - hangStart) * 3f) * 6f
			state == State.DRAG -> clamp(dragVx / dp(90f), -18f, 18f)
			slideV != 0f -> clamp(-slideV / dp(30f), -12f, 12f)
			else -> 0f
		}
		v.invalidate()
		stepTrail(next)
	}

	/** Feeds Nyan Cat's rainbow the cat's rear, mid-body; hides it for the unicorn, asleep, stuck or away. */
	private fun stepTrail(anim: Anim) {
		val tr = trail ?: return
		val look = Looks.current
		val hidden = look !== NyanLook || away || paused || partying || view?.visibility != View.VISIBLE ||
			state in setOf(State.SLEEP, State.LEAVING) || stuck || anim in setOf(Anim.SLEEP, Anim.SPIN, Anim.HANG)
		if (hidden) {
			if (!tr.off) {
				tr.off = true
				tr.clear()
			}
			return
		}
		tr.off = false
		tr.px = w / look.cellW
		tr.flung = state == State.FLY
		// Follows the pet's card flip, so the rainbow swings round with it.
		val turn = view?.turn ?: (if (facing < 0) -1f else 1f)
		tr.facing = turn
		// The rear of the pop-tart, half way down it: cell (OX + 7, OY + 9) in NyanLook's grid. Mirrored
		// with the eased flip, not cellPoint's instant one: the rainbow's start used to jump to the
		// cat's other side the moment it turned, while the rainbow itself was still easing round.
		val cx = look.cellW / 2f + (10f - look.cellW / 2f) * turn
		tr.add(x + cx * w / look.cellW, y + hopOff + 16f * h / look.cellH, if (facing < 0) -1 else 1)
	}

	// ---------------------------------------------------------------- touch

	fun onTouch(event: MotionEvent): Boolean {
		if (voiceRestricted) return false
		val t = now()
		val rx = event.rawX
		val ry = event.rawY
		when (event.actionMasked) {
			MotionEvent.ACTION_DOWN -> {
				val wasSleeping = state == State.SLEEP
				val wasPeeking = state == State.PEEK
				lastInteraction = t
				touchX0 = rx; touchY0 = ry; touchT0 = t
				touchOx = rx - x; touchOy = ry - y
				petAnchor = rx; petDir = 0; dragVx = 0f
				windAngle = 0f; windHeading = Float.NaN; windX = rx; windY = ry; windAt = t; wound = false; rocket = false
				history.clear()
				history.addLast(floatArrayOf(t, rx, ry))
				hopActive = false; hopOff = 0f; hopVy = 0f
				vx = 0f; vy = 0f; slideV = 0f
				peekSide = 0; peekPending = 0
				if (state == State.SEEK) treatClaimed = false
				state = State.PRESS
				if (wasSleeping) { setMood(Anim.SURPRISED, 0.9f); Sounds.wake(); say("wake") }
				else if (wasPeeking) { nextPeek = t + 90f; setMood(Anim.SURPRISED, 0.7f); Sounds.wake(); say("found") }
				schedule(0)
				return true
			}
			MotionEvent.ACTION_MOVE -> {
				history.addLast(floatArrayOf(t, rx, ry))
				while (history.size > 2 && t - history.first()[0] > 0.1f) history.removeFirst()
				if (state == State.PRESS && hypot(rx - touchX0, ry - touchY0) > dp(8f)) {
					state = State.DRAG
					haptic(HapticFeedbackConstants.KEYBOARD_TAP)
					Sounds.pickup()
					if (Random.nextFloat() < 0.25f) say("drag")
				}
				if (state == State.DRAG) {
					val root = decor
					val width = root?.width?.toFloat() ?: 0f
					val height = root?.height?.toFloat() ?: 0f
					x = clamp(rx - touchOx, -w * 0.3f, width - w * 0.7f)
					// Far enough up that a tall cell's body (cats, dogs) still reaches the top of the screen.
					y = clamp(ry - touchOy, -h * maxOf(0.2f, Looks.current.headroom), height - h * 0.5f)
					val first = history.first()
					if (t - first[0] > 0.005f) dragVx = (rx - first[1]) / (t - first[0])
					wind(t, rx, ry)
				} else if (state == State.PET) {
					val dx = rx - petAnchor
					if (abs(dx) > dp(10f)) {
						val dir = if (dx > 0) 1 else -1
						if (petDir != 0 && dir != petDir) {
							spawn(Particle.HEART)
							crumbs(1)
							Sounds.heart(petHearts++)
							haptic(HapticFeedbackConstants.CLOCK_TICK)
							addLove(1)
						}
						petDir = dir
						petAnchor = rx
					}
				}
				return true
			}
			MotionEvent.ACTION_UP, MotionEvent.ACTION_CANCEL -> {
				lastInteraction = t
				val cancelled = event.actionMasked == MotionEvent.ACTION_CANCEL
				when (state) {
					State.DRAG -> releaseDrag(t, cancelled)
					State.PET -> endPet(t)
					State.PRESS -> {
						state = State.IDLE
						if (!cancelled) tap(t)
						if (stuck) state = State.STUCK
					}
					else -> {}
				}
				schedule(0)
				return true
			}
		}
		return true
	}

	/**
	 * Adds up how far the drag path turns: each step's heading against the last, so circling adds up
	 * whichever way round and a straight drag adds nothing. A pause starts it over.
	 */
	private fun wind(t: Float, rx: Float, ry: Float) {
		if (t - windAt > 0.5f) { windAngle = 0f; windHeading = Float.NaN }
		val dx = rx - windX
		val dy = ry - windY
		if (hypot(dx, dy) < dp(10f)) return
		val heading = atan2(dy, dx)
		if (!windHeading.isNaN()) {
			var d = heading - windHeading
			while (d > PI) d -= 2f * PI.toFloat()
			while (d < -PI) d += 2f * PI.toFloat()
			windAngle += d
		}
		windHeading = heading
		windX = rx
		windY = ry
		windAt = t
		if (!wound && abs(windAngle) >= WIND_TURNS * 2f * PI.toFloat()) {
			wound = true
			haptic(HapticFeedbackConstants.LONG_PRESS)
			Sounds.twinkle()
			repeat(3) { spawn(Particle.SPARK) }
			say("wound")
		}
	}

	private fun releaseDrag(t: Float, cancelled: Boolean) {
		var fvx = 0f
		var fvy = 0f
		if (!cancelled && history.size >= 2) {
			val a = history.first()
			val z = history.last()
			if (z[0] - a[0] > 0.005f && t - z[0] < 0.08f) {
				fvx = (z[1] - a[1]) / (z[0] - a[0])
				fvy = (z[2] - a[2]) / (z[0] - a[0])
			}
		}
		val limit = dp(6000f)
		fvx = clamp(fvx, -limit, limit)
		fvy = clamp(fvy, -limit, limit)
		val speed = hypot(fvx, fvy)
		val minY = bounds[2]
		if (stuck) {
			// Still near the top: it grabs back on. Pulled down far enough: it lets go.
			if (y <= stuckY() + dp(UNSTICK_DP)) { stick(t); return }
			stuck = false
			Sounds.slip()
			say("unstuck")
		}
		if (wound && fvy < -dp(900f)) {
			// Wound up and flung upward: a rainbow rocket that sticks wherever it hits the top.
			state = State.FLY
			rocket = true
			vx = fvx * 0.5f
			vy = minOf(fvy, -dp(2600f))
			Sounds.swoosh(1f)
			say("rocket")
			return
		}
		if (wound) setMood(Anim.DIZZY, 2.6f)
		when {
			speed <= dp(700f) && y <= minY + dp(8f) -> startHang(t, minY)
			speed > dp(700f) || Settings.gravity -> {
				state = State.FLY
				vx = fvx
				vy = fvy
				if (speed > dp(1200f)) Sounds.swoosh(speed / limit)
				if (speed > dp(2600f)) {
					say("throw")
					addRep(-4)
				}
			}
			else -> {
				state = State.IDLE
				nextAction = t + Random.nextFloat() * 3f + 2f
				savePosition()
			}
		}
	}

	private fun tap(t: Float) {
		if (Eater.hasEaten()) {
			lastTap = 0f
			recentTaps.clear()
			setMood(Anim.SURPRISED, 0.9f)
			hop(dp(300f))
			haptic(HapticFeedbackConstants.LONG_PRESS)
			Sounds.spit()
			say("spit")
			val m = mouth()
			Eater.spitAll(t, m[0], m[1])
			return
		}
		if (t - lastTap < 0.32f) {
			lastTap = 0f
			hop(dp(720f))
			repeat(3) { spawn(Particle.SPARK) }
			haptic(HapticFeedbackConstants.LONG_PRESS)
			addLove(2)
			if (Random.nextFloat() < 0.4f) say("jump")
			return
		}
		lastTap = t
		recentTaps.removeAll { t - it > 2.5f }
		recentTaps.add(t)
		if (recentTaps.size >= 6) {
			recentTaps.clear()
			setMood(Anim.SAD, 2.5f)
			Sounds.sad()
			addLove(-5)
			say("annoyed", force = true)
			addRep(-6)
			haptic(HapticFeedbackConstants.LONG_PRESS)
			return
		}
		setMood(Anim.SURPRISED, 0.45f)
		hop(dp(330f), quiet = true)
		Sounds.tap()
		haptic(HapticFeedbackConstants.KEYBOARD_TAP)
		addLove(2)
		if (Random.nextFloat() < 0.35f) say(if (love() < LONELY) "lonely" else "tap")
	}

	private fun startPet(t: Float) {
		state = State.PET
		nextHeart = t + 0.1f
		petHearts = 0
		haptic(HapticFeedbackConstants.LONG_PRESS)
	}

	private fun endPet(t: Float) {
		state = if (stuck) State.STUCK else State.IDLE
		setMood(Anim.HAPPY, 2.2f)
		Sounds.happy()
		nextAction = t + Random.nextFloat() * 3f + 3f
		Settings.pets++
		addLove(6)
		addRep(4)
		if (!stuck && Settings.bubbles && Random.nextFloat() < 0.35f) blow()
		else if (Random.nextFloat() < 0.6f) say("pet")
	}

	// ---------------------------------------------------------------- reactions

	private fun canReact() = running && !voiceRestricted && !paused && !away && view != null && posReady &&
		state in setOf(State.IDLE, State.WALK, State.SLEEP, State.PEEK, State.STUCK)

	private fun wake(t: Float) {
		lastInteraction = t
		if (state == State.PEEK) endPeek(t)
		else if (state == State.SLEEP) state = State.IDLE
	}

	/** A Discord event, forwarded from JS (see js/lib/reactions.ts). [name] fills in {name}. */
	fun react(kind: String, name: String?, fx: Boolean = false, force: Boolean = false) {
		if (!Settings.discord || !canReact()) return
		val t = now()
		wake(t)
		// The reaction's own full-screen effect (ScreenFx.kt), when JS says it's on for this one.
		if (fx) decor?.let { root -> ScreenFx.play(root, view, kind, x + w / 2f, y + hopOff + h / 2f, force) }
		when (kind) {
			"love" -> {
				setMood(Anim.REACTION, 2.2f, Bubble.HEART)
				repeat(3) { spawn(Particle.HEART) }
				Sounds.twinkle()
				if (Settings.bubbles) mainHandler.postDelayed({ blow() }, 2300)
			}
			"laugh" -> { setMood(Anim.HAPPY, 1.6f); hop(dp(420f)); spawn(Particle.SPARK) }
			"hi" -> setMood(Anim.VARIANT, 1.8f, 1)
			"bye" -> { setMood(Anim.SAD, 1.4f); Sounds.sad() }
			"sleepy" -> { setMood(Anim.SLEEP, 2.4f); Sounds.sleep() }
			"sad" -> { setMood(Anim.SAD, 2f); Sounds.sad(); spawn(Particle.HEART) }
			"wow" -> { setMood(Anim.SURPRISED, 1.6f); hop(dp(380f)) }
			"party" -> {
				setMood(Anim.HAPPY, 2f)
				hop(dp(480f))
				repeat(4) { spawn(Particle.SPARK) }
				Sounds.chime()
				if (Settings.bubbles) mainHandler.postDelayed({ blow() }, 2100)
			}
			"cool" -> { setMood(Anim.VARIANT, 2f, 3); repeat(2) { spawn(Particle.SPARK) }; Sounds.twinkle() }
			"food" -> { setMood(Anim.HAPPY, 1.6f); hop(dp(300f), quiet = true); Sounds.gulp() }
			"music" -> { setMood(Anim.REACTION, 2.2f, Bubble.MUSIC); Sounds.chime() }
			"thanks" -> { setMood(Anim.VARIANT, 1.8f, 1); spawn(Particle.HEART) }
			"mention" -> { setMood(Anim.REACTION, 2.2f, Bubble.ALERT); hop(dp(360f), quiet = true); Sounds.alert(); haptic(HapticFeedbackConstants.KEYBOARD_TAP) }
			"mail" -> { setMood(Anim.REACTION, 2f, Bubble.MAIL); hop(dp(300f), quiet = true); Sounds.ding() }
			"sent", "essay" -> { setMood(Anim.HAPPY, 1.2f); hop(dp(520f)); repeat(2) { spawn(Particle.SPARK) } }
			"voice_join" -> { setMood(Anim.REACTION, 2.5f, Bubble.MUSIC); Sounds.chime() }
			"voice_leave" -> { setMood(Anim.SAD, 1.5f); Sounds.sad() }
			"channel_new", "channel_again" -> setMood(Anim.VARIANT, 1.4f, 2)
		}
		val talk = when (kind) {
			"sent" -> Random.nextFloat() < 0.3f
			"channel_new", "channel_again" -> Random.nextFloat() < 0.5f
			else -> true
		}
		if (talk) say(kind, name = name)
		nextAction = maxOf(nextAction, t + 2.5f)
		schedule(0)
	}

	fun onShake(power: Float) {
		if (voiceRestricted) return
		if (!running || paused || away || view == null || stuck || state in setOf(State.PRESS, State.DRAG, State.PET, State.LEAVING)) return
		val t = now()
		val wasSleeping = state == State.SLEEP
		if (state == State.PEEK) peekSide = 0
		peekPending = 0
		hopActive = false; hopOff = 0f; hopVy = 0f; slideV = 0f
		// A beat of the shake-burst pose, then off it goes.
		setMood(Anim.SHAKE, if (Looks.current.timedShake) Looks.current.duration(Anim.SHAKE) else 0.25f)
		crumbs(5)
		state = State.FLY
		val speed = dp(900f + minOf(power, 40f) * 55f)
		val angle = Random.nextFloat() * 6.2831855f
		vx = cos(angle) * speed
		vy = sin(angle) * speed - if (Settings.gravity) dp(700f) else 0f
		shakeDizzy = true
		lastInteraction = t
		addRep(-2)
		haptic(HapticFeedbackConstants.LONG_PRESS)
		Sounds.swoosh(1f)
		say(if (wasSleeping) "wake" else "shake")
		schedule(0)
	}

	fun onCharging() {
		if (!Settings.battery || !canReact()) return
		val t = now()
		wake(t)
		setMood(Anim.CHARGING, Looks.current.duration(Anim.CHARGING) + 1.5f)
		Sounds.charge()
		say("charging")
		nextAction = maxOf(nextAction, t + 4f)
		schedule(0)
	}

	fun onLowBattery() {
		if (!Settings.battery || !canReact()) return
		val t = now()
		wake(t)
		setMood(Anim.LOW_BATTERY, Looks.current.duration(Anim.LOW_BATTERY) + 4f)
		Sounds.lowBattery()
		say("low_battery")
		nextAction = maxOf(nextAction, t + 6f)
		schedule(0)
	}

	/** Eating: mouth open while something flies in. */
	fun onEatStart(targetX: Float) {
		facing = if (targetX > x + w / 2f) 1 else -1
		setMood(Anim.SURPRISED, 0.7f)
		nextAction = now() + 3f
	}

	fun onSwallowed() {
		setMood(Anim.HAPPY, 1.6f)
		haptic(HapticFeedbackConstants.KEYBOARD_TAP)
		Sounds.gulp()
		Settings.eaten++
		onPersist()
		if (Random.nextFloat() < 0.7f) say("eat")
	}

	/**
	 * Plays the blowing animation; [stepBlow] lets the bubbles go as the frames release them, then a
	 * stream follows (Bubbles.kt). [force] ignores the setting, for the test button.
	 */
	fun blow(force: Boolean = false) {
		if (voiceRestricted) return
		if (!force && !Settings.bubbles) return
		val root = decor ?: return
		if (view == null || paused || away || state !in setOf(State.IDLE, State.WALK, State.SLEEP, State.PEEK)) return
		val t = now()
		wake(t)
		if (state == State.WALK) state = State.IDLE
		setMood(Anim.BLOW, Looks.current.duration(Anim.BLOW) + 0.2f)
		blowLeft = 6 + Random.nextInt(5)
		released = 0
		if (Random.nextFloat() < 0.4f) say("bubbles")
		nextAction = maxOf(nextAction, t + Looks.current.duration(Anim.BLOW) + 1f)
		schedule(0)
	}

	/** Hands each drawn bubble to Bubbles on the frame it leaves the wand; the first starts the stream. */
	private fun stepBlow(t: Float) {
		if (mood != Anim.BLOW || t >= moodUntil) return
		val root = decor ?: return
		val frame = ((t - animStart) * Anim.BLOW.fps).toInt()
		val scale = w / Looks.current.cellW
		while (released < Looks.current.blowReleases.size && frame >= Looks.current.blowReleases[released].frame) {
			val r = Looks.current.blowReleases[released]
			val p = cellPoint(r.x, r.y)
			if (released == 0) Bubbles.blow(root, p[0], p[1], blowLeft, delay = 0.45f)
			Bubbles.release(root, p[0], p[1], r.size * scale, r.variant, facing)
			Sounds.bloop()
			released++
		}
		if (released > 0) {
			val first = Looks.current.blowReleases[0]
			val p = cellPoint(first.x, first.y)
			Bubbles.follow(p[0], p[1])
		}
	}

	/** A point in the sprite cell, in decor coordinates, mirrored with the frame when facing left. */
	private fun cellPoint(cx: Float, cy: Float): FloatArray {
		val look = Looks.current
		val px = if (facing < 0) look.cellW - cx else cx
		return floatArrayOf(x + px * w / look.cellW, y + hopOff + cy * h / look.cellH)
	}

	/**
	 * Casts a spell: a happy pose, sparkles and a line, while VFX (through JS) shows a random filter
	 * or effect for a few seconds. Only while it's idle or walking, unless [force]d by the test button.
	 */
	fun castMagic(force: Boolean = false) {
		if (voiceRestricted) return
		val t = now()
		val scale = rateScale(Settings.magicRate)
		if (nextMagic == 0f && !force) { nextMagic = t + (20f + Random.nextFloat() * 40f) * scale; return }
		// Busy (held, petted, hanging, hidden...): try again shortly. Skipping to a whole new wait
		// meant a pet that dozes off between spells (most of the time) almost never cast one.
		if (!force && (paused || away || view == null || state !in FREE_FOR_EVENTS || Boss.busy)) {
			nextMagic = t + EVENT_RETRY_SECONDS
			return
		}
		nextMagic = t + (60f + Random.nextFloat() * 120f) * scale
		if (state == State.SLEEP) wokeAt = t
		if (state == State.WALK || state == State.SLEEP) state = State.IDLE
		setMood(Anim.HAPPY, 1.8f)
		repeat(4) { spawn(Particle.SPARK) }
		Sounds.twinkle()
		say("magic")
		onMagic()
		schedule(0)
	}

	/**
	 * [f] of the way down a unicorn-shaped cell, moved onto the current look's body: the unicorn's
	 * cell has 12% headroom, so these fractions were tuned on that. For the unicorn this is h * f.
	 */
	private fun along(f: Float): Float {
		val room = Looks.current.headroom
		return h * (room + (f - 0.12f) * (1f - room) / 0.88f)
	}

	/** Where the mouth is, in decor coordinates: the look's own point, else an estimate. */
	private fun mouth(): FloatArray =
		Looks.current.mouthAt?.let { cellPoint(it[0], it[1]) } ?: floatArrayOf(x + w / 2f, y + hopOff + along(0.42f))

	// ---------------------------------------------------------------- happiness

	/**
	 * Happiness, 0..100, brought up to date first: it drains a point every couple of minutes by the
	 * wall clock, so a day away leaves it lonely when Discord next opens.
	 */
	fun love(): Int {
		val nowMs = System.currentTimeMillis()
		if (Settings.loveAt <= 0L || Settings.loveAt > nowMs) {
			Settings.loveAt = nowMs
			return Settings.love
		}
		val points = (nowMs - Settings.loveAt) / LOVE_DRAIN_MS
		if (points > 0) {
			Settings.love = (Settings.love - points).coerceAtLeast(0L).toInt()
			Settings.loveAt += points * LOVE_DRAIN_MS
		}
		return Settings.love
	}

	// ---------------------------------------------------------------- reputation

	/**
	 * How it feels about you, -100..100, opt-in ([Settings.grudges]). Unlike [love], which is how
	 * lonely it is right now, this is a memory: pets and treats raise it, tap-spam, hard throws,
	 * shaking and ignored treats lower it, and it drifts back toward 0 by one point every
	 * [REP_DRIFT_MS]. It only changes how it eats your buttons (Eater.maxEaten, Eater.wait).
	 */
	fun reputation(): Int {
		val nowMs = System.currentTimeMillis()
		if (Settings.repAt <= 0L || Settings.repAt > nowMs) {
			Settings.repAt = nowMs
			return Settings.rep
		}
		val steps = (nowMs - Settings.repAt) / REP_DRIFT_MS
		if (steps > 0) {
			val rep = Settings.rep
			Settings.rep = if (rep > 0) (rep - steps).coerceAtLeast(0L).toInt() else (rep + steps).coerceAtMost(0L).toInt()
			Settings.repAt += steps * REP_DRIFT_MS
		}
		return Settings.rep
	}

	/** 2 adores you, 1 likes you, 0 neutral, -1 grumpy, -2 holds a grudge. Thresholds match the settings page. */
	fun repTier(rep: Int = reputation()): Int = when {
		rep >= 60 -> 2
		rep >= 20 -> 1
		rep > -20 -> 0
		rep > -60 -> -1
		else -> -2
	}

	/** Multiplies the wait between bites: 2^(rep/40), so about 5.7x at +100 and 0.18x at -100. */
	fun repWaitScale(): Float = if (!Settings.grudges) 1f else Math.pow(2.0, reputation() / 40.0).toFloat()

	private fun addRep(points: Int) {
		if (!Settings.grudges || !Settings.eat) return
		val before = repTier()
		Settings.rep = (Settings.rep + points).coerceIn(-100, 100)
		val after = repTier(Settings.rep)
		if (after != before) {
			say(
				when {
					after == 2 -> "rep_adore"
					after == -2 -> "rep_grudge"
					after > before -> "rep_up"
					else -> "rep_down"
				},
			)
		}
		onPersist()
	}

	/** It adores you: whatever it took comes back without being asked. */
	private fun giveBackKindly(t: Float) {
		setMood(Anim.HAPPY, 1.2f)
		Sounds.spit()
		say("give_back")
		val m = mouth()
		Eater.spitAll(t, m[0], m[1])
	}

	private fun addLove(points: Int) {
		val before = love()
		Settings.love = (before + points).coerceIn(0, 100)
		// Cheered up: a little burst so it shows.
		if (before < LONELY && Settings.love >= LONELY) repeat(3) { spawn(Particle.HEART) }
		onPersist()
	}

	/** Lonely: a sad look, a line asking for attention, and now and then a shuffle towards the middle. */
	private fun askForAttention(minX: Float, maxX: Float) {
		setMood(Anim.SAD, 2.4f)
		if (Random.nextFloat() < 0.3f) Sounds.sad()
		say("lonely")
		if (Settings.wander && Random.nextFloat() < 0.4f) {
			val middle = (minX + maxX) / 2f
			if (abs(middle - x) > dp(40f)) {
				walkTarget = middle + (Random.nextFloat() - 0.5f) * dp(60f)
				walkTargetY = Float.NaN
				walkSpeed = WALK_SPEED
				state = State.WALK
			}
		}
	}

	// ---------------------------------------------------------------- while typing

	/**
	 * "While typing" mode: hidden until the keyboard comes up, then it pops in on top of the keyboard,
	 * and flies off a few seconds after it goes away. True when this tick should do nothing else.
	 */
	private fun stepTyping(t: Float, b: FloatArray, v: PetView): Boolean {
		if (Settings.showWhen != shownWhen) {
			shownWhen = Settings.showWhen
			typingSeen = t
		}
		val typing = keyboard > 0
		if (Settings.showWhen != 1) {
			if (away) comeBack(t, b, v, quiet = true)
			return false
		}
		if (typing) typingSeen = t
		if (away) {
			if (!typing) return true
			comeBack(t, b, v, quiet = false)
			return false
		}
		if (!posReady) {
			// Opened with no keyboard up: start hidden, without the fuss of leaving.
			if (typing) return false
			greet = false
			goAwayNow(v)
			return true
		}
		if (!typing && t - typingSeen > TYPING_LINGER && state in setOf(State.IDLE, State.WALK, State.SLEEP, State.PEEK, State.SEEK)) {
			goAway()
			return true
		}
		return false
	}

	private fun goAway() {
		Eater.giveBackNow()
		Bubbles.clear()
		hideBubble()
		clearTreat()
		stuck = false; rocket = false; peekSide = 0; peekPending = 0
		hopActive = false; hopOff = 0f; hopVy = 0f; slideV = 0f
		savePosition()
		state = State.LEAVING
		setAnim(Anim.OUTRO)
		Sounds.leave()
		afterLeave = { view?.let { goAwayNow(it) } }
		schedule(0)
	}

	private fun goAwayNow(v: PetView) {
		away = true
		Boss.cancel()
		afterLeave = null
		state = State.IDLE
		mood = null
		v.visibility = View.INVISIBLE
		hideBubble()
		clearTreat()
		Phone.stop()
	}

	private fun comeBack(t: Float, b: FloatArray, v: PetView, quiet: Boolean) {
		away = false
		v.visibility = View.VISIBLE
		// Where it was last left along the floor, standing on the keyboard.
		x = clamp(b[0] + (b[1] - b[0]) * (Settings.posX / 1000f), b[0], b[1])
		y = b[3]
		posReady = true
		greet = false
		state = State.IDLE
		vx = 0f; vy = 0f; slideV = 0f
		lastInteraction = t
		nextAction = t + 2f + Random.nextFloat() * 2f
		if (quiet) return
		hop(dp(420f), quiet = true)
		repeat(2) { spawn(Particle.SPARK) }
		Sounds.appear()
		if (love() < LONELY) say("missed") else if (Random.nextFloat() < 0.6f) say("typing_hello")
	}

	// ---------------------------------------------------------------- treats

	/** A pixel treat: its name for the speech bubbles, and its rows (each letter a colour in [colours]). */
	private class Treat(val name: String, val rows: List<String>, val colours: Map<Char, Int>)

	private val treats = listOf(
		Treat(
			"cupcake",
			listOf(
				".....R.....",
				"....RR.....",
				"..PPPPPPP..",
				".PPWPPPBPP.",
				"PPPPPPPPPPP",
				"PBPPPWPPPWP",
				".YYYYYYYYY.",
				".YoYoYoYoY.",
				"..YoYoYoY..",
				"..YYYYYYY..",
			),
			mapOf('R' to 0xFFE8344E.toInt(), 'P' to 0xFFFF9CCB.toInt(), 'W' to 0xFFFFFFFF.toInt(), 'B' to 0xFF6EC8FF.toInt(), 'Y' to 0xFF7FE0C9.toInt(), 'o' to 0xFF45B39C.toInt()),
		),
		Treat(
			"cookie",
			listOf(
				"..TTTTT..",
				".TTDTTTT.",
				"TTTTTTDTT",
				"TDTTTTTTT",
				"TTTTDTTTT",
				"TTTTTTTDT",
				"TDTTTTTTT",
				".TTTTDTT.",
				"..TTTTT..",
			),
			mapOf('T' to 0xFFE0A35E.toInt(), 'D' to 0xFF5B3520.toInt()),
		),
		Treat(
			"strawberry",
			listOf(
				"...GGG...",
				"..GGGGG..",
				".RRRRRRR.",
				"RRYRRRYRR",
				"RRRRRRRRR",
				"RRRYRRRYR",
				".RRRRRRR.",
				"..RRYRR..",
				"...RRR...",
				"....R....",
			),
			mapOf('G' to 0xFF4CC26A.toInt(), 'R' to 0xFFF0384A.toInt(), 'Y' to 0xFFFFE27A.toInt()),
		),
		Treat(
			"candy",
			listOf(
				"LL..CCCCC..LL",
				"LLLCCWCCCCLLL",
				".LLCCCCWCCLL.",
				"LLLCCCCCCCLLL",
				"LL..CCCCC..LL",
			),
			mapOf('L' to 0xFFD9B8FF.toInt(), 'C' to 0xFF9B5CFF.toInt(), 'W' to 0xFFFFFFFF.toInt()),
		),
		Treat(
			"carrot",
			listOf(
				"......G.G",
				".....GGG.",
				"....OOG..",
				"...OOOO..",
				"..OOdOO..",
				"..OOOO...",
				".OdOO....",
				".OOO.....",
				"OO.......",
			),
			mapOf('G' to 0xFF4CC26A.toInt(), 'O' to 0xFFFF8A2A.toInt(), 'd' to 0xFFC85A10.toInt()),
		),
	)

	/** Nyan Cat's treats: pop-tarts and party food, plus a cat's favourites. */
	private val nyanTreats = listOf(
		Treat(
			"pop-tart",
			listOf(
				"CCCCCCCCCC",
				"CFFFFFFFFC",
				"CFsFFFsFFC",
				"CFFFsFFFFC",
				"CFsFFFFsFC",
				"CFFFFsFFFC",
				"CFFsFFFsFC",
				"CFFFFFFFFC",
				"CCCCCCCCCC",
			),
			mapOf('C' to 0xFFFFCC99.toInt(), 'F' to 0xFFFF99FF.toInt(), 's' to 0xFFFF3399.toInt()),
		),
		Treat(
			"slice of cake",
			listOf(
				"....r.....",
				"...WWW....",
				"..WWWWWW..",
				".SSSSSSSSS",
				".WWWWWWWWW",
				".SSSSSSSSS",
				".PPPPPPPPP",
				".SSSSSSSSS",
			),
			mapOf('r' to 0xFFE8344E.toInt(), 'W' to 0xFFFFF6E8.toInt(), 'S' to 0xFFF2C48A.toInt(), 'P' to 0xFFFF9CCB.toInt()),
		),
		Treat(
			"donut",
			listOf(
				"..PPPPP..",
				".PsPPPwP.",
				"PPPDDDPPP",
				"PwPD.DPsP",
				"PPPDDDPPP",
				".DPPsPPD.",
				"..DDDDD..",
			),
			mapOf('P' to 0xFFFF9CCB.toInt(), 'D' to 0xFFD9944F.toInt(), 's' to 0xFF6EC8FF.toInt(), 'w' to 0xFFFFFFFF.toInt()),
		),
		Treat(
			"ice cream",
			listOf(
				"...PPP...",
				"..PPwPP..",
				"..PPPPP..",
				".MMMMMMM.",
				".MMwMMMM.",
				"..WWWWW..",
				"..WwWwW..",
				"...WWW...",
				"...WwW...",
				"....W....",
			),
			mapOf('P' to 0xFFFF9CCB.toInt(), 'M' to 0xFFFFF0C8.toInt(), 'w' to 0xFFFFFFFF.toInt(), 'W' to 0xFFD9944F.toInt()),
		),
		Treat(
			"fish",
			listOf(
				"..BBBB.....T",
				".BBBBBB..TTT",
				"BkBBBBBBTTT.",
				"BBBBBBBBTTT.",
				".BBBBBB..TTT",
				"..BBBB.....T",
			),
			mapOf('B' to 0xFF6EC8FF.toInt(), 'k' to 0xFF2A1E3A.toInt(), 'T' to 0xFF3E9BD6.toInt()),
		),
		Treat(
			"milk",
			listOf(
				"..BBBB..",
				".WWWWWW.",
				"WWWWWWWW",
				"WBBBBBBW",
				"WBbbbbBW",
				"WBBBBBBW",
				"WWWWWWWW",
				"WWWWWWWW",
			),
			mapOf('W' to 0xFFFFFFFF.toInt(), 'B' to 0xFF6EC8FF.toInt(), 'b' to 0xFF3E9BD6.toInt()),
		),
	)

	/** A cat's favourites: fish, milk, and a drumstick. */
	private val catTreats by lazy { nyanTreats.filter { it.name == "fish" || it.name == "milk" } + drumstick }
	/** A dog's: a bone, a sausage, a drumstick. */
	private val dogTreats by lazy {
		listOf(
			Treat(
				"bone",
				listOf(
					"WW.......WW",
					"WWWWWWWWWWW",
					".WWWWWWWWW.",
					"WWWWWWWWWWW",
					"WW.......WW",
				),
				mapOf('W' to 0xFFF6EEDC.toInt()),
			),
			Treat(
				"sausage",
				listOf(
					"..SSSSSSS..",
					".SSsSSSsSSS",
					"SSSSSSSSSSS",
					".SSSSSSSSS.",
					"..SSSSSSS..",
				),
				mapOf('S' to 0xFFC8553D.toInt(), 's' to 0xFFE88A6E.toInt()),
			),
			drumstick,
		)
	}
	private val drumstick = Treat(
		"drumstick",
		listOf(
			"..BBBB....",
			".BBBBBB...",
			"BBbBBBBB..",
			"BBBBBBBB..",
			".BBBBBB...",
			"..BBBBWW..",
			"......WWW.",
			".......WW.",
		),
		mapOf('B' to 0xFFC27A3A.toInt(), 'b' to 0xFFE0A35E.toInt(), 'W' to 0xFFF6EEDC.toInt()),
	)

	/** The current pet's treats. */
	private val currentTreats get() = when (Looks.kind) {
		Looks.Kind.NYAN -> nyanTreats
		Looks.Kind.CAT -> catTreats
		Looks.Kind.DOG -> dogTreats
		Looks.Kind.GARY -> catTreats
		Looks.Kind.SEASONAL -> treats
		Looks.Kind.UNICORN -> treats
	}
	/** Which list [treatKind] came from, kept with the dropped treat so a pet switch can't mismatch it. */
	private var treatList = treats

	private val treatBitmaps = HashMap<Treat, Bitmap>()

	/** Drawn like the particles, with a dark outline so it reads on light and dark themes. */
	private fun treatBitmap(treat: Treat): Bitmap = treatBitmaps.getOrPut(treat) {
		val cols = treat.rows.maxOf { it.length }
		val rows = treat.rows.size
		fun filled(cx: Int, cy: Int) = cy in 0 until rows && cx in 0 until treat.rows[cy].length && treat.rows[cy][cx] != '.'
		val s = maxOf(2, dp(2.6f).toInt())
		val bmp = Bitmap.createBitmap((cols + 2) * s, (rows + 2) * s, Bitmap.Config.ARGB_8888)
		val canvas = Canvas(bmp)
		val paint = Paint()
		for (gy in -1..rows) for (gx in -1..cols) {
			val colour = if (filled(gx, gy)) treat.colours[treat.rows[gy][gx]] ?: continue
			else if ((-1..1).any { dy -> (-1..1).any { dx -> (dx == 0 || dy == 0) && filled(gx + dx, gy + dy) } }) 0xFF2A1E3A.toInt()
			else continue
			paint.color = colour
			val px = ((gx + 1) * s).toFloat()
			val py = ((gy + 1) * s).toFloat()
			canvas.drawRect(px, py, px + s, py + s, paint)
		}
		bmp
	}

	private var treat: ImageView? = null
	private var treatKind = 0
	private var treatX = 0f
	private var treatY = 0f
	private var treatVy = 0f
	private var treatLanded = false
	/** Gravity off: where the treat floats (its top, decor coordinates). */
	private var treatFloatY = 0f
	/** Sparkle has already reacted to this treat (it can land twice: gravity turned on, floor moved). */
	private var treatSeen = false
	private var treatAt = 0f
	/** Tapped, and Sparkle is on its way (or it is flying to Sparkle). */
	private var treatClaimed = false
	private var treatFlying = false
	private var nextTreat = 0f

	/** After a how-often change: every wait starts again at the new rate (0 means "schedule next frame"). */
	// ---------------------------------------------------------------- the boss pets (Boss.kt)

	val petX get() = x
	val petY get() = y
	val petW get() = w
	val petH get() = h
	val petFacing get() = facing
	val petView: View? get() = view
	val petDecor: ViewGroup? get() = decor
	val petBubble: View? get() = bubble
	val petTrail: View? get() = trail
	val keyboardUp get() = keyboard > 0
	/** On screen, idle, walking or asleep, not stuck, hidden or partying: free for an event. */
	val freeForEvents get() = view != null && !paused && !away && !partying && !stuck && state in FREE_FOR_EVENTS
	fun boundsNow(t: Float) = bounds(t)
	fun pointInCell(cx: Float, cy: Float) = cellPoint(cx, cy)
	fun mood(next: Anim, seconds: Float) = setMood(next, seconds)
	fun sayNow(category: String) = say(category)
	fun poke() = schedule(0)
	fun wakeUpNow() {
		if (state == State.SLEEP) { state = State.IDLE; wokeAt = now() }
		if (state == State.WALK) state = State.IDLE
	}
	/** Puts the pet down at ([nx], [ny]) standing still: where a ride ended. */
	fun placeAt(nx: Float, ny: Float) {
		x = nx; y = ny; hopOff = 0f; hopActive = false; hopVy = 0f
		if (state != State.LEAVING) state = State.IDLE
	}

	private class StripPlay(val name: String, val start: Float, val fps: Float, val loop: Boolean, val until: Float)
	private var strip: StripPlay? = null
	private var holdUntil = 0f

	/** Plays one of the current sheet pet's own strips for [seconds], in place of the mood animation. */
	fun playStrip(name: String, fps: Float, seconds: Float, loop: Boolean = false) {
		val look = Looks.current as? SheetLook ?: return
		if (!look.has(name)) return
		val t = now()
		strip = StripPlay(name, t, fps, loop, t + seconds)
		schedule(0)
	}

	/** Keeps the pet standing where it is for [seconds], while something of its own plays. */
	fun hold(seconds: Float) {
		holdUntil = now() + seconds
		if (state == State.WALK) state = State.IDLE
	}

	private fun playingFrame(t: Float): Bitmap? {
		val s = strip ?: return null
		if (t >= s.until) { strip = null; return null }
		return (Looks.current as? SheetLook)?.stripFrame(s.name, t - s.start, s.fps, s.loop)
	}

	fun rescheduleTimers() {
		nextMagic = 0f
		nextParty = 0f
		Boss.reschedule()
		if (treat == null) nextTreat = 0f
		Eater.reschedule(now())
	}

	private fun scheduleTreat(t: Float) {
		// Sooner when it's lonely: treats are one way to cheer it up.
		nextTreat = t + rateScale(Settings.treatRate) *
			if (love() < LONELY) 120f + Random.nextFloat() * 120f else 240f + Random.nextFloat() * 300f
	}

	/** Drops a treat from the top somewhere away from Sparkle. [force]: the settings page's button. */
	fun dropTreat(force: Boolean = false) {
		if (voiceRestricted) return
		val root = decor ?: return
		val pet = view ?: return
		val t = now()
		if (!force) scheduleTreat(t)
		if (treat != null || away || paused) return
		if (!force && (!Settings.treats || Boss.busy || state !in setOf(State.IDLE, State.WALK, State.SLEEP, State.PEEK))) return
		runCatching {
			treatList = currentTreats
			treatKind = Random.nextInt(treatList.size)
			val bmp = treatBitmap(treatList[treatKind])
			val iv = ImageView(pet.context)
			iv.setImageBitmap(bmp)
			iv.elevation = dp(1f)
			root.addView(iv, FrameLayout.LayoutParams(bmp.width, bmp.height))
			val b = bounds(t, force = true)
			val margin = dp(16f)
			var tx = 0f
			for (i in 0 until 5) {
				tx = margin + Random.nextFloat() * maxOf(1f, b[4] - margin * 2f - bmp.width)
				if (abs(tx + bmp.width / 2f - (x + w / 2f)) > dp(80f)) break
			}
			treatX = tx
			treatY = b[2] + h * 0.12f
			// Gravity off: it drifts down into a spot somewhere on screen and floats there.
			val floor = b[3] + h - bmp.height
			treatFloatY = treatY + Random.nextFloat() * maxOf(0f, floor - treatY)
			treatVy = 0f
			treatLanded = false
			treatSeen = false
			treatClaimed = false
			treatFlying = false
			treatAt = t
			iv.translationX = treatX
			iv.translationY = treatY
			iv.setOnTouchListener { _, e -> runCatching { onTreatTouch(e) }.getOrDefault(false) }
			treat = iv
			Sounds.twinkle()
		}.onFailure { android.util.Log.e("Sparkle", "treat failed", it) }
		schedule(0)
	}

	fun clearTreat() {
		val iv = treat ?: return
		treat = null
		treatClaimed = false
		treatFlying = false
		if (state == State.SEEK) state = State.IDLE
		remove(iv)
	}

	private fun stepTreat(dt: Float, t: Float, b: FloatArray) {
		val iv = treat ?: return
		if (treatFlying) return
		if (treatClaimed && state != State.SEEK) treatClaimed = false
		val tw = iv.width.toFloat().takeIf { it > 0f } ?: return
		val th = iv.height.toFloat()
		// On the same floor Sparkle stands on (its feet are the bottom of its frame).
		val floor = b[3] + h - th
		if (!Settings.gravity) {
			// Floating: drift down to its spot, then bob there.
			val spot = treatFloatY.coerceAtMost(floor)
			if (!treatLanded) {
				treatY += (spot - treatY) * minOf(1f, dt * 3f)
				if (abs(spot - treatY) < dp(2f)) {
					treatLanded = true
					if (!treatSeen) noticeTreat(t)
				}
			} else treatY = spot + sin((t - treatAt) * 2.2f) * dp(5f)
		} else if (!treatLanded || treatY < floor - dp(1f)) {
			// Falling: dropped with gravity on, or gravity turned on while it floated.
			if (treatY < floor - dp(1f) && treatLanded) treatLanded = false
			treatVy += dp(2600f) * dt
			treatY += treatVy * dt
			if (treatY >= floor) {
				treatY = floor
				if (treatVy > dp(500f)) {
					treatVy = -treatVy * 0.35f
					Sounds.thud(0.1f)
				} else {
					treatVy = 0f
					treatLanded = true
					if (!treatSeen) noticeTreat(t)
				}
			}
		} else treatY = floor
		treatX = clamp(treatX, 0f, b[4] - tw)
		iv.translationX = treatX
		iv.translationY = treatY
		// A little wobble so it catches the eye.
		iv.rotation = if (treatLanded) sin((t - treatAt) * 4f) * 7f else 0f
		if (!treatClaimed && t - treatAt > TREAT_LIFETIME) {
			treat = null
			iv.animate().alpha(0f).scaleX(0.4f).scaleY(0.4f).setDuration(400).withEndAction { remove(iv) }.start()
			if (canReact() && state != State.SLEEP && Random.nextFloat() < 0.6f) {
				setMood(Anim.SAD, 1.6f)
				say("treat_gone", name = treatList[treatKind].name)
			}
			addRep(-4)
		}
	}

	private fun noticeTreat(t: Float) {
		treatSeen = true
		if (!canReact() || state == State.SLEEP || state == State.STUCK) return
		val iv = treat ?: return
		facing = if (treatX + iv.width / 2f > x + w / 2f) 1 else -1
		setMood(Anim.SURPRISED, 0.6f)
		nextAction = maxOf(nextAction, t + 2f)
		say("treat_spotted", name = treatList[treatKind].name)
	}

	private fun onTreatTouch(event: MotionEvent): Boolean {
		when (event.actionMasked) {
			MotionEvent.ACTION_DOWN -> return true
			MotionEvent.ACTION_UP -> feed()
		}
		return true
	}

	/** The treat was tapped: Sparkle walks (or floats) over to it, or it flies over if Sparkle is busy. */
	private fun feed() {
		if (treat == null || treatClaimed || treatFlying) return
		val t = now()
		lastInteraction = t
		haptic(HapticFeedbackConstants.KEYBOARD_TAP)
		treatClaimed = true
		if (!stuck && state in setOf(State.IDLE, State.WALK, State.SLEEP, State.PEEK)) {
			if (state == State.SLEEP) { Sounds.wake(); setMood(Anim.SURPRISED, 0.6f) }
			peekSide = 0; peekPending = 0; peekMoving = false
			state = State.SEEK
		} else flyTreatToMouth()
		schedule(0)
	}

	private fun stepSeek(dt: Float, t: Float, b: FloatArray) {
		val iv = treat
		if (iv == null) { state = State.IDLE; return }
		val (minX, maxX, minY, maxY) = b
		val targetX = clamp(treatX + iv.width / 2f - w / 2f, minX, maxX)
		// With gravity it's on the floor; floating, it's wherever the treat is.
		val targetY = if (Settings.gravity) maxY else clamp(treatY + iv.height / 2f - along(0.5f), minY, maxY)
		val dx = targetX - x
		val dy = targetY - y
		val dist = hypot(dx, dy)
		if (dist < dp(5f)) {
			x = targetX
			y = targetY
			flyTreatToMouth()
			return
		}
		// Hurrying: a treat!
		val step = minOf(dist, dp(170f) * dt)
		x += dx / dist * step
		y += dy / dist * step
		if (abs(dx) > dp(2f)) facing = if (dx > 0) 1 else -1
	}

	/** The last bit: the treat shrinks into Sparkle's mouth, then it's eaten. */
	private fun flyTreatToMouth() {
		val iv = treat ?: return
		treatFlying = true
		treatClaimed = true
		if (state == State.SEEK) state = State.IDLE
		val m = mouth()
		iv.animate()
			.translationX(m[0] - iv.width / 2f)
			.translationY(m[1] - iv.height / 2f)
			.scaleX(0.3f).scaleY(0.3f).rotation(0f)
			.setDuration(260)
			.withEndAction {
				runCatching {
					if (treat === iv) treat = null
					remove(iv)
					treatFlying = false
					treatClaimed = false
					onTreatEaten()
				}
			}
			.start()
	}

	private fun onTreatEaten() {
		val t = now()
		Settings.treatsEaten++
		addLove(25)
		addRep(5)
		if (state in setOf(State.IDLE, State.WALK, State.SEEK)) state = State.IDLE
		setMood(Anim.HAPPY, 2f)
		repeat(3) { spawn(Particle.HEART) }
		Sounds.gulp()
		haptic(HapticFeedbackConstants.KEYBOARD_TAP)
		nextAction = t + 3f
		lastInteraction = t
		say("treat_eaten", name = treatList[treatKind].name)
		schedule(0)
	}

	// ---------------------------------------------------------------- helpers

	/** A hop of [strength] (px/s upward). Big ones boing; [quiet] when the caller plays its own sound. */
	fun hop(strength: Float, quiet: Boolean = false) {
		if (state != State.IDLE && state != State.WALK) return
		if (!quiet) {
			if (strength >= dp(700f)) Sounds.boing() else if (strength >= dp(400f)) Sounds.hop(strength / dp(700f))
		}
		if (!hopActive) hopStart = now()
		hopActive = true
		hopVy = -strength
		if (hopOff > 0f) hopOff = 0f
	}

	private fun haptic(kind: Int) {
		if (!Settings.haptics) return
		runCatching { view?.performHapticFeedback(kind) }
	}

	private fun savePosition() {
		val b = bounds
		Settings.posX = (clamp((x - b[0]) / maxOf(1f, b[1] - b[0]), 0f, 1f) * 1000).toInt()
		Settings.posY = (clamp((y - b[2]) / maxOf(1f, b[3] - b[2]), 0f, 1f) * 1000).toInt()
		onPersist()
	}

	private fun say(category: String, force: Boolean = false, name: String? = null) {
		if (voiceRestricted) return
		val bubbleView = bubble ?: return
		if (!force && !Settings.talks) return
		// The lines any pet says, plus the current pet's own for this moment.
		val own = when (Looks.kind) {
			Looks.Kind.NYAN -> Phrases.nyan
			Looks.Kind.CAT -> Phrases.cat
			Looks.Kind.DOG -> Phrases.dog
			Looks.Kind.GARY -> mapOf("happy" to listOf("Meow!"), "wake" to listOf("Meow?"), "sad" to listOf("Mrrrow…"))
			Looks.Kind.SEASONAL -> Boss.phrases() ?: Phrases.seasonal
			Looks.Kind.UNICORN -> Phrases.unicorn
		}
		var options = (Phrases.shared[category].orEmpty() + own[category].orEmpty()).ifEmpty { return }
		if (name.isNullOrBlank()) options = options.filter { "{name}" !in it }.ifEmpty { return }
		val pick = options.filter { it != lastPhrase }.ifEmpty { options }.random()
		val text = (if (name.isNullOrBlank()) pick else pick.replace("{name}", name)).replace("{me}", Settings.name)
		lastPhrase = pick
		val palette = discordPalette(bubbleView.context)
		bubbleView.background = GradientDrawable().apply {
			cornerRadius = dp(12f)
			setColor(palette.surface)
			setStroke(maxOf(1, dp(1f).toInt()), palette.border)
		}
		bubbleView.setTextColor(palette.text)
		bubbleView.elevation = dp(2f)
		bubbleView.animate().cancel()
		bubbleView.text = text
		bubbleView.alpha = 0f
		bubbleView.visibility = View.VISIBLE
		bubbleView.animate().alpha(1f).setDuration(150).start()
		Sounds.talk()
		bubbleUntil = now() + 2f + text.length * 0.05f
	}

	private fun hideBubble() {
		val b = bubble ?: return
		if (b.visibility != View.VISIBLE) return
		b.animate().alpha(0f).setDuration(180).withEndAction { b.visibility = View.GONE }.start()
	}

	private fun updateBubble(t: Float, b: FloatArray) {
		val bubbleView = bubble ?: return
		if (bubbleView.visibility != View.VISIBLE) return
		if (t >= bubbleUntil) { hideBubble(); return }
		val bw = bubbleView.width
		val bh = bubbleView.height
		if (bw <= 0) return
		val margin = dp(4f)
		// Just above its head (the frame has headroom above it).
		val head = y + hopOff + along(0.12f)
		bubbleView.translationX = clamp(x + w / 2f - bw / 2f, margin, b[4] - bw - margin)
		var by = head - bh - margin
		if (by < b[2] + h * 0.12f) by = y + hopOff + h + margin
		bubbleView.translationY = by
	}

	// ---------------------------------------------------------------- particles

	/** Hearts and sparks float up; Nyan Cat's pop-tart crumbs ([crumbs]) fall. */
	private enum class Particle { HEART, SPARK, CRUMB_SPRINKLE, CRUMB_FROSTING, CRUMB_CRUST }

	/** Nyan Cat sheds a few bits of its pop-tart: petted, shaken or landing hard. */
	private fun crumbs(count: Int) {
		if (Settings.look != Looks.NYAN) return
		val kinds = listOf(Particle.CRUMB_SPRINKLE, Particle.CRUMB_FROSTING, Particle.CRUMB_CRUST)
		repeat(count) { spawn(kinds[Random.nextInt(kinds.size)]) }
	}

	private val particleBitmaps = HashMap<Particle, Bitmap>()

	private fun particleBitmap(kind: Particle): Bitmap = particleBitmaps.getOrPut(kind) {
		// Tiny pixel shapes to match the sprites: a heart and a four-point twinkle.
		val rows = when (kind) {
			Particle.HEART -> listOf(".##.##.", "#######", "#######", ".#####.", "..###..", "...#...")
			Particle.SPARK -> listOf("...#...", "...#...", "..###..", "#######", "..###..", "...#...", "...#...")
			Particle.CRUMB_SPRINKLE -> listOf("##")
			Particle.CRUMB_FROSTING -> listOf("##", "##")
			Particle.CRUMB_CRUST -> listOf("###", "##.")
		}
		val colour = when (kind) {
			Particle.HEART -> 0xFFFF5C9A.toInt()
			Particle.SPARK -> 0xFFFFD35C.toInt()
			Particle.CRUMB_SPRINKLE -> 0xFFFF3399.toInt()
			Particle.CRUMB_FROSTING -> 0xFFFF99FF.toInt()
			Particle.CRUMB_CRUST -> 0xFFFFCC99.toInt()
		}
		val s = maxOf(2, dp(2.2f).toInt())
		val bmp = Bitmap.createBitmap(rows[0].length * s, rows.size * s, Bitmap.Config.ARGB_8888)
		val canvas = Canvas(bmp)
		val paint = Paint().apply { color = colour }
		rows.forEachIndexed { ry, row ->
			row.forEachIndexed { rx, ch ->
				if (ch == '#') canvas.drawRect((rx * s).toFloat(), (ry * s).toFloat(), ((rx + 1) * s).toFloat(), ((ry + 1) * s).toFloat(), paint)
			}
		}
		bmp
	}

	private fun spawn(kind: Particle) {
		val root = decor ?: return
		val pet = view ?: return
		if (particles.size >= 14) return
		runCatching {
			val bmp = particleBitmap(kind)
			val p = ImageView(pet.context)
			p.setImageBitmap(bmp)
			root.addView(p, FrameLayout.LayoutParams(bmp.width, bmp.height))
			particles.add(p)
			val crumb = kind in setOf(Particle.CRUMB_SPRINKLE, Particle.CRUMB_FROSTING, Particle.CRUMB_CRUST)
			if (crumb) {
				// From the pop-tart, falling and tumbling as they fade.
				p.translationX = x + w * (0.3f + Random.nextFloat() * 0.45f)
				p.translationY = y + hopOff + along(0.4f + Random.nextFloat() * 0.3f)
				p.animate()
					.translationXBy((Random.nextFloat() - 0.5f) * dp(40f))
					.translationYBy(dp(50f + Random.nextFloat() * 40f))
					.rotationBy((Random.nextFloat() - 0.5f) * 540f)
					.alpha(0f)
					.setInterpolator(android.view.animation.AccelerateInterpolator())
					.setDuration(800)
					.withEndAction {
						particles.remove(p)
						remove(p)
					}
					.start()
				return@runCatching
			}
			p.translationX = x + w / 2f - bmp.width / 2f + (Random.nextFloat() - 0.5f) * w * 0.5f
			p.translationY = y + hopOff + along(0.2f)
			p.scaleX = 0.5f
			p.scaleY = 0.5f
			p.animate()
				.translationXBy((Random.nextFloat() - 0.5f) * dp(32f))
				.translationYBy(-dp(40f + Random.nextFloat() * 18f))
				.scaleX(1f).scaleY(1f).alpha(0f)
				.setDuration(1100)
				.withEndAction {
					particles.remove(p)
					remove(p)
				}
				.start()
		}
	}
}
