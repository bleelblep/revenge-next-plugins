package com.bleelblep.sparkle

import kotlin.random.Random

internal enum class BossKind { HORSEMAN, KRAMPUS }

/**
 * The boss pets' mischief, on top of what every pet does: the Headless Horseman and Krampus
 * (BossData.kt) attack the screen now and then, the Horseman's horse visits, and tapping it with him
 * out starts the ride (Ride.kt). Scheduled from Pet's tick like magic and treats: a wait scaled by the
 * rate setting, only while the pet is free, retried shortly when it is busy.
 *
 * An attack is a strip of the pet's own (attack / throw / horn / pull), held in place by Pet.hold, with
 * the effect fired at the strike frame: ScreenBreak for the cuts, hook and head-butt, Projectile for
 * the thrown scythe. Main thread only.
 */
internal object Boss {
	private const val RETRY = 10f
	private val RATE_SCALE = floatArrayOf(0f, 2.5f, 1f, 0.4f, 0.15f)

	fun kindOf(lookId: Int): BossKind? = when (lookId - (Looks.FIRST_SEASONAL + SeasonalData.pets.size)) {
		0 -> BossKind.HORSEMAN
		1 -> BossKind.KRAMPUS
		else -> null
	}

	val kind: BossKind? get() = kindOf(Settings.look)
	val riding get() = Ride.active
	/** Something of ours is mid-flight: no spell, party or treat should start now. */
	val busy get() = attacking || Ride.active || ScreenBreak.active || Projectile.active

	private var attacking = false
	private var attackUntil = 0f
	private var fireAt = 0f
	private var pending: (() -> Unit)? = null
	private var nextAttack = 0f
	private var nextVisit = 0f

	private fun rateScale(rate: Int) = RATE_SCALE[rate.coerceIn(0, 4)]
	private fun now() = android.os.SystemClock.uptimeMillis() / 1000f

	/** The pet's own lines, when it is a boss. */
	fun phrases(): Map<String, List<String>>? = when (kind) {
		BossKind.HORSEMAN -> Phrases.horseman
		BossKind.KRAMPUS -> Phrases.krampus
		null -> null
	}

	fun reschedule() {
		nextAttack = 0f
		nextVisit = 0f
	}

	/** Called from Pet's tick each step, with its bounds. */
	fun tick(t: Float, dt: Float, b: FloatArray) {
		val k = kind
		if (k == null) {
			if (Companion.active || Ride.active || attacking) cancel()
			return
		}
		val floor = b[3] + Pet.petH
		if (Companion.active) Companion.tick(t, dt, floor, b[4])
		// The strike, when its moment comes.
		if (attacking) {
			val fire = pending
			if (fire != null && t >= fireAt) { pending = null; runCatching { fire() } }
			if (t >= attackUntil && !ScreenBreak.active && !Projectile.active) attacking = false
		}
		if (Settings.attacks) {
			val scale = rateScale(Settings.attackRate)
			if (nextAttack == 0f) nextAttack = t + (120f + Random.nextFloat() * 180f) * scale
			else if (t >= nextAttack) {
				if (canAttack()) { nextAttack = t + (120f + Random.nextFloat() * 180f) * scale; attack(force = false) }
				else nextAttack = t + RETRY
			}
		}
		if (k == BossKind.HORSEMAN && Settings.companion && !Companion.active && !Ride.active) {
			val scale = rateScale(Settings.companionRate)
			if (nextVisit == 0f) nextVisit = t + (1200f + Random.nextFloat() * 1200f) * scale
			else if (t >= nextVisit) {
				if (Pet.freeForEvents && !busy && !Pet.keyboardUp) { nextVisit = t + (1200f + Random.nextFloat() * 1200f) * scale; visit(force = false) }
				else nextVisit = t + RETRY
			}
		}
	}

	private fun canAttack() = Pet.freeForEvents && !busy && !Pet.voiceRestricted && !(Pet.keyboardUp && Settings.attackFx)

	/** An attack now: the weapon is random. [force] from the settings page skips the free-and-idle check. */
	fun attack(force: Boolean) {
		val k = kind ?: return
		if (Pet.voiceRestricted) return
		if (!force && !canAttack()) return
		if (busy) return
		val root = Pet.petDecor ?: return
		val view = Pet.petView ?: return
		val t = now()
		Pet.wakeUpNow()
		val fx = Settings.attackFx && !Pet.keyboardUp
		attacking = true
		val hide = listOf(Pet.petView, Pet.petBubble, Pet.petTrail)
		val facing = Pet.petFacing
		when (k) {
			BossKind.HORSEMAN -> {
				// The thrown scythe needs no snapshot; the rest do. Flurry, pumpkin and reap are shader-only.
				val moves = mutableListOf("throw")
				if (fx) {
					moves += "cut"
					if (ScreenBreak.shadersReady) moves += listOf("flurry", "pumpkin", "reap")
				}
				when (moves.random()) {
					"throw" -> {
						Pet.playStrip("throw", 10f, 0.6f)
						Pet.hold(0.8f)
						attackUntil = t + 8f
						fireAt = t + 0.3f
						pending = {
							val hand = Pet.pointInCell(31f, 23f)
							val px = Pet.petW / Looks.current.cellW
							Sounds.swoosh(0.9f)
							Projectile.throwScythe(root, view, hand[0], hand[1], facing, px,
								top = { Pet.boundsNow(now())[2] }, floor = { Pet.boundsNow(now())[3] + Pet.petH },
								home = { Pet.pointInCell(31f, 23f) }, onBounce = { Sounds.thud(0.35f) }) {
								Pet.playStrip("catch", 10f, 0.4f)
								Pet.hold(0.5f)
								Sounds.grab()
								attacking = false
							}
						}
					}
					"cut" -> {
						Pet.playStrip("attack", 10f, 0.6f)
						Pet.hold(1.6f)
						attackUntil = t + 1.6f
						fireAt = t + 0.3f
						pending = {
							val tip = Pet.pointInCell(52f, 22f)
							Sounds.swoosh(1f)
							val ok = ScreenBreak.play(root, view, hide, ScreenBreak.Kind.CUT, tip[0], tip[1], facing, null) { attacking = false }
							if (!ok) attacking = false
						}
					}
					"flurry" -> { // three swings, one cut each
						Pet.playStrip("attack", 15f, 1.2f, loop = true)
						Pet.hold(2.1f)
						attackUntil = t + 2.1f
						fireAt = t + 0.2f
						pending = {
							val tip = Pet.pointInCell(52f, 22f)
							Sounds.swoosh(1f)
							val ok = ScreenBreak.play(root, view, hide, ScreenBreak.Kind.FLURRY, tip[0], tip[1], facing, null) { attacking = false }
							if (!ok) attacking = false
						}
					}
					"pumpkin" -> { // the jack-o'-lantern leaves his hand on the lob strip's 5th frame
						Pet.playStrip("lob", 10f, 1.1f)
						Pet.hold(3.2f)
						attackUntil = t + 3.2f
						fireAt = t + 0.45f
						pending = {
							val hand = Pet.pointInCell(26f, 12f)
							Sounds.swoosh(0.7f)
							val ok = ScreenBreak.play(root, view, hide, ScreenBreak.Kind.PUMPKIN, hand[0], hand[1], facing, hand) { attacking = false }
							if (!ok) attacking = false
						}
					}
					else -> { // the reaping
						Pet.playStrip("reap", 8f, 1.25f)
						Pet.hold(2.4f)
						attackUntil = t + 2.4f
						fireAt = t + 0.3f
						pending = {
							val tip = Pet.pointInCell(52f, 22f)
							Sounds.appear(force = true)
							val ok = ScreenBreak.play(root, view, hide, ScreenBreak.Kind.REAP, tip[0], tip[1], facing, null) { attacking = false }
							if (!ok) attacking = false
						}
					}
				}
				Pet.sayNow("attack")
			}
			BossKind.KRAMPUS -> {
				val weapon = if (!fx) 2 else Random.nextInt(3)
				when (weapon) {
					0 -> { // the chain: hook, then haul
						Pet.playStrip("attack", 10f, 0.3f)
						Pet.hold(2.6f)
						attackUntil = t + 2.6f
						fireAt = t + 0.25f
						pending = {
							val hand = Pet.pointInCell(18f, 31f)
							Sounds.swoosh(0.7f)
							val ok = ScreenBreak.play(root, view, hide, ScreenBreak.Kind.HOOK, hand[0], hand[1], facing, hand,
								onBite = { Sounds.grab(); Pet.playStrip("pull", 8f, 1.9f) }) { attacking = false }
							if (!ok) attacking = false
						}
						Pet.sayNow("chain")
					}
					1 -> { // claws
						Pet.playStrip("attack", 10f, 0.6f)
						Pet.hold(1.4f)
						attackUntil = t + 1.4f
						fireAt = t + 0.3f
						pending = {
							val claw = Pet.pointInCell(42f, 37f)
							Sounds.swoosh(1f)
							val ok = ScreenBreak.play(root, view, hide, ScreenBreak.Kind.CLAWS, claw[0], claw[1], facing, null) { attacking = false }
							if (!ok) attacking = false
						}
						Pet.sayNow("attack")
					}
					else -> { // the horn
						Pet.playStrip("horn", 10f, 0.6f)
						Pet.hold(1.2f)
						attackUntil = t + 1.2f
						fireAt = t + 0.3f
						pending = {
							val horn = Pet.pointInCell(44f, 23f)
							Sounds.thud(1f)
							if (fx) {
								val ok = ScreenBreak.play(root, view, hide, ScreenBreak.Kind.HORN, horn[0], horn[1], facing, null) { attacking = false }
								if (!ok) attacking = false
							} else attacking = false
						}
						Pet.sayNow("attack")
					}
				}
			}
		}
		Pet.poke()
	}

	/** The horse walks in. [force] from the settings page. */
	fun visit(force: Boolean) {
		if (kind != BossKind.HORSEMAN && !force) return
		if (Ride.active || Companion.active) return
		val root = Pet.petDecor ?: return
		val t = now()
		val b = Pet.boundsNow(t)
		val px = Pet.petW / Looks.current.cellW
		Companion.visit(root, Pet.petView, px, b[3] + Pet.petH, b[4], t) { tryRide() }
		Pet.sayNow("horse")
	}

	private fun tryRide(): Boolean {
		if (kind != BossKind.HORSEMAN || !Companion.standing) return false
		if (!Pet.freeForEvents || attacking || ScreenBreak.active || Projectile.active) return false
		startRide()
		return true
	}

	/** The settings page's button: brings the horse if it isn't here and rides straight away. */
	fun rideNow() {
		if (kind != BossKind.HORSEMAN || Ride.active) return
		if (Pet.petView == null) return
		Pet.wakeUpNow()
		if (!Companion.active) {
			val root = Pet.petDecor ?: return
			val t = now()
			val b = Pet.boundsNow(t)
			val px = Pet.petW / Looks.current.cellW
			Companion.visit(root, Pet.petView, px, b[3] + Pet.petH, b[4], t) { tryRide() }
		}
		startRide()
	}

	fun endRide() = Ride.stop()

	private fun startRide() {
		val root = Pet.petDecor ?: return
		val look = Looks.current as? SheetLook ?: return
		val where = Companion.where()
		val px = Pet.petW / Looks.current.cellW
		val startX = if (Companion.active) where[0] else Pet.petX
		val facing = if (Companion.active) where[4].toInt() else Pet.petFacing
		Companion.cancel()
		Pet.petView?.visibility = android.view.View.INVISIBLE
		Pet.petBubble?.visibility = android.view.View.GONE
		Pet.sayNow("ride")
		Sounds.hop(0.8f)
		Ride.start(root, look, px, startX, facing, Settings.rideMinutes.coerceIn(1, 5), { Pet.boundsNow(now())[3] + Pet.petH }) { x, f ->
			val t = now()
			val b = Pet.boundsNow(t)
			val hw = Companion.horseLook().cellW * px
			Pet.placeAt((x + hw / 2f - Pet.petW / 2f).coerceIn(b[0], b[1]), b[3])
			Pet.petView?.visibility = android.view.View.VISIBLE
			Pet.mood(Anim.HAPPY, 1.5f)
			Pet.petDecor?.let { Companion.dismissFrom(it, Pet.petView, px, x, b[3] + Pet.petH, f, t) }
			Pet.poke()
		}
	}

	/** Everything off, the pet back: on hide, on another pet, on stop. */
	fun cancel() {
		pending = null
		attacking = false
		ScreenBreak.cancel()
		Projectile.cancel()
		if (Ride.active) {
			Ride.cancel()
			Pet.petView?.visibility = android.view.View.VISIBLE
		}
		Companion.cancel()
	}

	fun detach() = cancel()
	fun stop() = cancel()
}
