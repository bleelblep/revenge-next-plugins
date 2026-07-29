import patchGuildMenu from "./patches/guildMenu"

export default plugin({
	start({ cleanup }) {
		try {
			cleanup(patchGuildMenu())
		} catch (error) {
			console.error("[PurgeMyMessages] failed to apply guildMenu patch:", error)
		}
	},
})
