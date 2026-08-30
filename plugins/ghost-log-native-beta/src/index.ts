import { callNativeMethod } from './lib/native'
import { DEFAULT_BACKUP_PATH, DEFAULTS } from './defaults'
import { patchRenderRestore } from './lib/restore'
import { patchVisuals } from './lib/visuals'
import { registerPages } from './ui/routes'
import { addToCache, refreshLog, setSettingsStorage } from './ui/state'
import { saveRichContent } from './lib/richContent'
import Settings from './ui/pages/Settings'
import type { GhostLogSettings } from './types'

const TAG = '[GhostLogNativeBeta]'
const ID = 'bleelblep.ghost-log-native-beta'

let settingsStorage: any

function settings(): GhostLogSettings {
	return { ...DEFAULTS, ...(settingsStorage?.cache ?? {}) }
}

function stores() {
	return revenge.discord.flux.Stores as any
}

function describe(message: any, channelId: string) {
	const s = stores()
	const channel = s.ChannelStore?.getChannel?.(channelId)
	const guild = channel?.guild_id ? s.GuildStore?.getGuild?.(channel.guild_id) : undefined

	return {
		channelName: channel?.name ? `#${channel.name}` : 'Direct message',
		guildId: channel?.guild_id as string | undefined,
		guildName: guild?.name as string | undefined,
		guildIcon: guild?.icon as string | undefined,
		authorName:
			message.author?.globalName ??
			message.author?.global_name ??
			message.author?.username ??
			'Unknown',
	}
}

async function capture(entry: Record<string, unknown>, toast: boolean, authorName: string, channelName: string) {
	try {
		await callNativeMethod(`${ID}.captureDeleted`, [entry])
		addToCache(entry as any)
		const cfg = settings()
		if (cfg.autoBackupEnabled) scheduleBackup(cfg)
		if (toast) {
			revenge.discord.actions.ToastActionCreators.open({
				key: `${ID}:${entry.id}`,
				content: `Message deleted by ${authorName} in ${channelName}`,
			})
		}
	} catch (error) {
		console.error(`${TAG} capture bridge failed:`, error)
	}
}

// Auto-backup once per burst, not once per catch: previously every captured deletion fired a
// full-log encrypt+write to the backup file, so N rapid deletions meant 2N full rewrites
// (capture + backup each) serialized through the native mutex. Under a purge that I/O storm
// is the only beta-only work that scales with delete rate. Trailing-debounce it instead.
let backupTimer: ReturnType<typeof setTimeout> | undefined
function scheduleBackup(cfg: GhostLogSettings) {
	if (backupTimer !== undefined) return
	backupTimer = setTimeout(() => {
		backupTimer = undefined
		void callNativeMethod(`${ID}.exportBackup`, [cfg.backupFilePath || DEFAULT_BACKUP_PATH]).catch(() => {})
	}, 2000)
}

function handle(channelId: string, messageId: string) {
	const s = stores()
	const message = s.MessageStore?.getMessage?.(channelId, messageId)
	if (!message) return

	const cfg = settings()
	if (!cfg.countOwnMessages) {
		const me = s.UserStore?.getCurrentUser?.()?.id
		if (me && message.author?.id === me) return
	}
	if (cfg.ignoreBots && message.author?.bot) return
	if (!cfg.logDeletions) return

	const meta = describe(message, channelId)
	const deletedAt = Date.now()
	void capture(
		{
			id: String(messageId),
			channelId: String(channelId),
			guildId: meta.guildId,
			authorId: String(message.author?.id ?? ''),
			authorName: meta.authorName,
			channelName: meta.channelName,
			guildName: meta.guildName,
			authorAvatar: message.author?.avatar,
			guildIcon: meta.guildIcon,
			content: String(message.content ?? '').slice(0, 2000),
			sentAt: message.timestamp ? new Date(message.timestamp).getTime() : Date.now(),
			deletedAt,
		},
		cfg.toastOnCatch,
		meta.authorName,
		meta.channelName,
	)
	saveRichContent(message, String(messageId), String(channelId), deletedAt, cfg)
}

export default plugin<{ jsonStorage: GhostLogSettings }>({
	jsonStorage: {
		load: true,
		default: DEFAULTS,
	},

	start(api) {
		console.log(`${TAG} JS started`)
		settingsStorage = api.jsonStorage
		setSettingsStorage(api.jsonStorage)

		// Load the native log into the JS cache so restore injection has entries on channel load.
		void refreshLog()

		// Sync log limits into the native store.
		void callNativeMethod(`${ID}.setLimits`, [settings().maxEntries, settings().unlimitedEntries]).catch(() => {})

		try {
			api.cleanup(registerPages())
		} catch (error) {
			console.error(`${TAG} failed to register settings pages:`, error)
		}

		// The dispatcher hook inside patchVisuals provably sees every raw MESSAGE_DELETE (it
		// converts them to MESSAGE_UPDATE), so single-delete capture is driven from that hook.
		// The flux subscribers stay as a fallback (and are the only path for BULK deletes, which
		// the visual patch intentionally doesn't convert).
		const { onFluxEventDispatched } = revenge.discord.flux
		api.cleanup(
			onFluxEventDispatched('MESSAGE_DELETE', (payload: any) => {
				try {
					// __vml_cleanup deletes are emitted by this plugin's own stop-cleanup for
					// messages already flagged/logged — re-capturing them would spam the log
					// (and the bridge) with the entire flagged set on every reload.
					if (payload?.__vml_cleanup) return payload
					handle(payload.channelId, payload.id)
				} catch (error) {
					console.error(`${TAG} MESSAGE_DELETE handler failed:`, error)
				}
				return payload
			}),
			onFluxEventDispatched('MESSAGE_DELETE_BULK', (payload: any) => {
				try {
					if (payload?.__vml_cleanup) return payload
					for (const id of payload.ids ?? []) handle(payload.channelId, id)
				} catch (error) {
					console.error(`${TAG} MESSAGE_DELETE_BULK handler failed:`, error)
				}
				return payload
			}),
			() => {
				if (backupTimer !== undefined) {
					clearTimeout(backupTimer)
					backupTimer = undefined
				}
			},
		)

		// Discord 343.11 may still be completing Metro module registration during the
		// AppRegistry startup turn. Defer the hooks until the next turn; a partial export
		// must disable the feature, never crash the host during launch.
		let cancelled = false
		const timer = setTimeout(() => {
			if (cancelled) return
			try {
				api.cleanup(patchVisuals(settings, handle))
			} catch (error) {
				console.error(`${TAG} failed to start deferred visual patching:`, error)
			}
			try {
				api.cleanup(patchRenderRestore())
			} catch (error) {
				console.error(`${TAG} failed to start deferred render restore:`, error)
			}
		}, 0)
		api.cleanup(() => {
			cancelled = true
			clearTimeout(timer)
		})
	},

	stop() {
		console.log(`${TAG} JS stopped`)
	},

	SettingsComponent: Settings,
})

declare module '@revenge-mod/modules/native' {
	export interface NativeMethods {
		'bleelblep.ghost-log-native-beta.captureDeleted': [args: [entry: Record<string, unknown>], returnValue: boolean]
		'bleelblep.ghost-log-native-beta.getLog': [args: any[], returnValue: string]
		'bleelblep.ghost-log-native-beta.getLogCount': [args: any[], returnValue: number]
		'bleelblep.ghost-log-native-beta.clearLog': [args: any[], returnValue: boolean]
		'bleelblep.ghost-log-native-beta.getLogFilePath': [args: any[], returnValue: string]
		'bleelblep.ghost-log-native-beta.setLimits': [args: [max: number, unlimited: boolean], returnValue: boolean]
		'bleelblep.ghost-log-native-beta.exportBackup': [args: [path: string], returnValue: { path: string; count: number } | null]
		'bleelblep.ghost-log-native-beta.importBackup': [args: [path: string], returnValue: number]
		'bleelblep.ghost-log-native-beta.seedEntries': [args: [entries: Record<string, unknown>[]], returnValue: number]
	}
}
