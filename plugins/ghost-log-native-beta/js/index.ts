import { callNativeMethod } from './lib/native'
import { DEFAULT_BACKUP_PATH, DEFAULTS } from './defaults'
import { patchRenderRestore } from './lib/restore'
import { patchVisuals } from './lib/visuals'
import { registerPages } from './ui/routes'
import { addToCache, flushPendingAdds, refreshLog, refreshStorageStatus, setSettingsStorage } from './ui/state'
import { stopAllProbes } from './lib/probe'
import { richContentForCapture } from './lib/richContent'
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
		// Keep the live cache in the same complete shape that a later reload gets
		// from the native rich-content sidecar.
		addToCache({ ...entry, ...((entry as any).richContent ?? {}) } as any)
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
		const path = cfg.backupFilePath || DEFAULT_BACKUP_PATH
		callNativeMethod(`${ID}.exportBackup`, [path])
			.then(() => console.log(`${TAG} auto backup written to ${path}`))
			.catch(error => console.error(`${TAG} auto backup failed:`, error))
	}, 2000)
}

/**
 * UserRecord stores its fields as non-enumerable getters, so `{ ...user }` yields an empty object
 * and every id/username is silently lost -- the same trap that once crashed createMessageRecord on
 * other users' deletes. Read the fields by name instead.
 */
/**
 * A timestamp as finite epoch milliseconds, or `fallback`. A NaN crossing the bridge reaches the
 * native log as a Double, and org.json refuses to serialize non-finite numbers -- so one bad
 * timestamp made every later write and every getLog throw, not just this entry.
 */
function epochMs(value: unknown, fallback: number): number {
	if (value == null || value === '') return fallback
	const ms = value instanceof Date ? value.getTime() : new Date(value as any).getTime()
	return Number.isFinite(ms) ? ms : fallback
}

function plainUser(user: any): any | undefined {
	if (!user) return undefined
	return {
		id: String(user.id ?? ''),
		username: user.username ?? user.globalName ?? user.global_name ?? 'Unknown',
		global_name: user.globalName ?? user.global_name ?? undefined,
		avatar: user.avatar ?? undefined,
		discriminator: String(user.discriminator ?? '0'),
		bot: !!user.bot,
	}
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
	const richContent = richContentForCapture(message, cfg)
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
			// Everything below is what a bulk-deleted message needs to come back looking like itself.
			// A single delete never leaves the store, so it keeps its real record; a bulk delete is a
			// real removal and is rebuilt entirely from this entry.
			mentions: Array.isArray(message.mentions)
				? message.mentions.map(plainUser).filter(Boolean).slice(0, 64)
				: undefined,
			mentionRoles: Array.isArray(message.mention_roles)
				? message.mention_roles.map(String).slice(0, 64)
				: undefined,
			mentionEveryone: !!message.mention_everyone,
			editedAt: message.edited_timestamp ? epochMs(message.edited_timestamp, deletedAt) : undefined,
			messageType: typeof message.type === 'number' ? message.type : 0,
			flags: typeof message.flags === 'number' ? message.flags : 0,
			pinned: !!message.pinned,
			tts: !!message.tts,
			referencedMessage: message.referenced_message
				? {
						id: String(message.referenced_message.id ?? ''),
						channelId: String(message.referenced_message.channel_id ?? channelId),
						author: plainUser(message.referenced_message.author),
						content: String(message.referenced_message.content ?? '').slice(0, 500),
				  }
				: undefined,
			...(richContent
				? {
						richContent,
						richContentPerFile: cfg.embedsPerFile,
						// Tells native where to put the encrypted media: <backupDir>/media, so it
						// survives an app uninstall/data-wipe alongside the portable backup file.
						backupPath: cfg.backupFilePath || DEFAULT_BACKUP_PATH,
				  }
				: {}),
			sentAt: epochMs(message.timestamp, deletedAt),
			deletedAt,
		},
		cfg.toastOnCatch,
		meta.authorName,
		meta.channelName,
	)
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

		// Point native at the portable base dir FIRST (awaited) so the log, rolling shards and media
		// all resolve to the backup location, THEN load the log and sync limits. Ordering matters:
		// refreshLog reads the native log, so it must run after setBaseDir switches the directory.
		async function bootstrap() {
			// jsonStorage's `load: true` only STARTS the disk read -- it does not finish before
			// start() runs, so settingsStorage.cache can still be undefined here and settings()
			// then silently returns pure DEFAULTS. Pushing those to native is what made a mass
			// delete lose entries: DEFAULTS say maxEntries 100 / unlimitedEntries false, so
			// trimLocked() capped the log at 100 and dropped the rest of a purge mid-burst even
			// though the user had unlimited on. The same stale read sent DEFAULT_BACKUP_PATH
			// instead of the configured one, putting the log, shards and media in the wrong dir.
			// Nothing re-pushed either value until the user manually toggled the setting, so the
			// app could run for its whole lifetime on defaults it was never configured with.
			// Await the load first; whether the race is lost is timing-dependent, which is why
			// this reproduced only sometimes.
			await settingsStorage.get().catch(() => {})
			await callNativeMethod(`${ID}.setBaseDir`, [settings().backupFilePath || DEFAULT_BACKUP_PATH]).catch(() => {})
			await callNativeMethod(`${ID}.setLimits`, [settings().maxEntries, settings().unlimitedEntries]).catch(() => {})
			// Read back where native actually ended up. The configured location may be unwritable with
			// no permission available to fix it, in which case native falls back to app-private storage
			// and this is what lets the UI say so instead of the plugin appearing to work and losing
			// everything.
			await refreshStorageStatus()
			void refreshLog()
		}
		bootstrap().catch(error => console.error(`${TAG} bootstrap failed:`, error))

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
				api.cleanup(patchRenderRestore(settings))
			} catch (error) {
				console.error(`${TAG} failed to start deferred render restore:`, error)
			}
		}, 0)
		api.cleanup(() => {
			cancelled = true
			clearTimeout(timer)
		})

		// The Debug page's probes hang off module scope, so without this they survive a plugin
		// disable and keep a second before/after pair installed on MessageStore.getMessages.
		api.cleanup(stopAllProbes)
		// Fold any staged captures into the cache before teardown rather than dropping them.
		api.cleanup(flushPendingAdds)
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
		'bleelblep.ghost-log-native-beta.getRichContent': [args: [ids: string[]], returnValue: string]
		'bleelblep.ghost-log-native-beta.getMedia': [args: [name: string], returnValue: string | null]
		'bleelblep.ghost-log-native-beta.setBaseDir': [args: [backupPath: string], returnValue: boolean]
		'bleelblep.ghost-log-native-beta.getLogCount': [args: any[], returnValue: number]
		'bleelblep.ghost-log-native-beta.clearLog': [args: any[], returnValue: boolean]
		'bleelblep.ghost-log-native-beta.getLogFilePath': [args: any[], returnValue: string]
		'bleelblep.ghost-log-native-beta.setLimits': [args: [max: number, unlimited: boolean], returnValue: boolean]
		'bleelblep.ghost-log-native-beta.exportBackup': [args: [path: string], returnValue: { path: string; count: number } | null]
		'bleelblep.ghost-log-native-beta.importBackup': [args: [path: string], returnValue: number]
		'bleelblep.ghost-log-native-beta.getStorageStatus': [args: any[], returnValue: string]
		'bleelblep.ghost-log-native-beta.exportBundle': [
			args: [path: string],
			returnValue: { path: string; files: number; count: number } | null,
		]
		'bleelblep.ghost-log-native-beta.importBundle': [args: [path: string], returnValue: number]
		'bleelblep.ghost-log-native-beta.seedEntries': [args: [entries: Record<string, unknown>[]], returnValue: number]
	}
}
