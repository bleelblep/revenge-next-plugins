/**
 * How a redacted name is rendered.
 *
 * - `pseudonym` — "User 1", "User 2", numbered in order of first appearance. The conversation
 *   still reads as a conversation, which is the point: a screenshot of a support thread or an
 *   argument is only useful if you can still tell who said what.
 * - `block`   — "████". Unambiguously redacted, but everyone looks identical.
 * - `initial` — "U1" / "A", compact enough not to reflow a narrow message header.
 */
export type RedactionStyle = "pseudonym" | "block" | "initial"

export interface ScreenshotRedactorStorage {
	/** Master toggle. Off by default — this plugin does nothing until deliberately armed. */
	enabled: boolean
	style: RedactionStyle
	/** Swap avatars for Discord's own default avatars, which carry no identity. */
	redactAvatars: boolean
	/** Redact your own messages too. Off by default: it's usually your screenshot. */
	redactSelf: boolean
	/** Restart placeholder numbering from 1 each time redaction is switched on. */
	resetNumberingOnEnable: boolean
	/**
	 * Add a redaction toggle to the message long-press sheet. The default quick toggle: hidden
	 * until asked for, so it can never appear in the screenshot.
	 */
	showSheetToggle: boolean
	/**
	 * Show a floating toggle over the chat instead. Off by default — it sits in the corner of
	 * every screenshot, which is the one place this plugin's control shouldn't be.
	 */
	showOverlayToggle: boolean
	/**
	 * Redact names wherever the client resolves them — the DM channel header, inline
	 * @mentions, the member list — not just message rows.
	 */
	redactResolvedNames: boolean
	/**
	 * Verbose logging to the console — the generated row's field names, and per-call detail
	 * from the channel-title hooks. Reaches `adb logcat -s ReactNativeJS`. Shapes and key names
	 * only; never a name, id or URL.
	 */
	verboseLogging: boolean
}
