const TAG = '[GhostLogNativeBeta]'

function stores() {
	return revenge.discord.flux.Stores as any
}

function describeChannelMessages(channelId: string | undefined) {
	if (!channelId) return { channel: null }
	const s = stores()
	const cm = s.MessageStore?._channelMessages?.[channelId]
	const first = cm?._array?.[0]
	return {
		channel: channelId,
		cmPresent: !!cm,
		cmKeys: cm ? Object.keys(cm) : null,
		arrayLen: cm?._array?.length ?? null,
		mapType: cm?._map ? typeof cm._map : null,
		sampleMsgKeys: first ? Object.keys(first).slice(0, 24) : null,
		sampleMsgFlags: first ? { id: first.id, hasDeleted: !!first.__vml_deleted, type: first.type, state: first.state } : null,
	}
}

/** Log the current channel's MessageStore structure immediately. */
export function inspectCurrentChannel(): string {
	const s = stores()
	const channelId = s.SelectedChannelStore?.getChannelId?.()
	const info = describeChannelMessages(channelId)
	console.log(`${TAG} inspect`, JSON.stringify(info))
	return info.cmPresent ? `channel ${channelId}: ${info.arrayLen} cached msgs` : `no channel messages cached for ${channelId ?? 'none'}`
}

/** Log every method/property name on MessageStore, like the SortedGuildStore probe. */
export function dumpMessageStore(): string {
	const ms = stores().MessageStore
	if (!ms) return 'no MessageStore'
	const keys = new Set<string>()
	let o: any = ms
	while (o && o !== Object.prototype) {
		for (const k of Object.getOwnPropertyNames(o)) keys.add(k)
		o = Object.getPrototypeOf(o)
	}
	const list = [...keys].sort()
	console.log(`${TAG} MessageStore props (${list.length})`, JSON.stringify(list))
	return `MessageStore: ${list.length} props (see logcat)`
}

/**
 * Hooks MessageStore.getMessages to confirm it is the render data source and to inspect the shape
 * of the object it returns (constructor, keys, _array length, first-row keys). Logs a capped number
 * of calls. Shapes only — never content.
 */
export function watchGetMessages(): () => void {
	const ms = stores().MessageStore
	if (typeof ms?.getMessages !== 'function') {
		console.log(`${TAG} getMessages NOT FOUND on MessageStore`)
		return () => {}
	}

	let pendingChannel: any
	let logged = 0
	const MAX = 20
	const before = revenge.patcher.before(ms, 'getMessages', (args: any[]) => {
		pendingChannel = args?.[0]
		return args
	})
	const after = revenge.patcher.after(ms, 'getMessages', (ret: any) => {
		const channelId = pendingChannel
		pendingChannel = undefined
		try {
			if (logged < MAX && ret) {
				logged++
				const first = ret?._array?.[0]
				console.log(
					`${TAG} getMessages(${channelId}) ->`,
					JSON.stringify({
						ctor: ret?.constructor?.name,
						keys: Object.keys(ret).slice(0, 24),
						arrayLen: ret?._array?.length ?? null,
						firstMsgKeys: first ? Object.keys(first).slice(0, 24) : null,
						firstFlags: first ? { id: first.id, type: first.type, state: first.state } : null,
					}),
				)
			}
		} catch (e) {
			console.error(`${TAG} getMessages probe failed:`, e)
		}
		return ret
	})

	return () => {
		try { before() } catch (e) { /* ignore */ }
		try { after() } catch (e) { /* ignore */ }
	}
}

/**
 * Inspect one real _array message instance deeply: constructor, field types (timestamp format),
 * author shape, and every method it exposes (own + prototype). This is what buildRenderMessage must
 * match for the injected message to survive isNewMessageGroup without crashing. Shapes/types only.
 */
export function inspectMessageInstance(): string {
	const s = stores()
	const ms = s.MessageStore
	const channelId = s.SelectedChannelStore?.getChannelId?.()
	const cm = channelId ? ms?.getMessages?.(channelId) : null
	const arr = cm?._array
	if (!Array.isArray(arr) || !arr.length) return 'no messages in current channel'

	const m = arr.find((x: any) => x && x.type === 0 && x.content) ?? arr[0]
	const funcsOf = (obj: any) => {
		const out: string[] = []
		if (!obj) return out
		for (const k of Object.getOwnPropertyNames(obj)) {
			try { if (typeof obj[k] === 'function') out.push(k) } catch { /* ignore */ }
		}
		return out
	}
	const proto = m ? Object.getPrototypeOf(m) : null
	const info = m
		? {
				ctor: m.constructor?.name ?? 'plain',
				timestampType: m.timestamp == null ? String(m.timestamp) : m.timestamp instanceof Date ? 'Date' : typeof m.timestamp,
				editedTimestampType: m.editedTimestamp == null ? String(m.editedTimestamp) : m.editedTimestamp instanceof Date ? 'Date' : typeof m.editedTimestamp,
				authorCtor: m.author?.constructor?.name ?? typeof m.author,
				authorKeys: m.author ? Object.keys(m.author).slice(0, 24) : null,
				ownFuncs: funcsOf(m),
				protoCtor: proto?.constructor?.name ?? null,
				protoFuncs: proto && proto !== Object.prototype ? funcsOf(proto) : [],
			}
		: null
	console.log(`${TAG} messageInstance`, JSON.stringify(info))
	if (!info) return 'no usable message'
	return `${info.ctor} ts=${info.timestampType} methods=${info.ownFuncs.length + info.protoFuncs.length}`
}

/**
 * Watches flux traffic for message/channel-load events and, on the first occurrence of each type,
 * logs the payload keys plus the current channel's MessageStore shape. This is how we find the
 * injection point for persistent restore. Shapes and counts only — never message content.
 */
export function startMessageLoadProbe(): () => void {
	const { onAnyFluxEventDispatched } = revenge.discord.flux
	const interesting = /MESSAGE|MESSAGES|LOAD|CHANNEL|GUILD/i
	const seen = new Set<string>()

	const unsub = onAnyFluxEventDispatched((payload: any) => {
		try {
			const type = payload?.type
			if (typeof type !== 'string' || !interesting.test(type)) return payload
			if (seen.has(type)) return payload
			seen.add(type)

			const s = stores()
			const channelId =
				payload?.channelId ?? payload?.channel_id ?? s.SelectedChannelStore?.getChannelId?.()
			const info = describeChannelMessages(channelId)
			console.log(
				`${TAG} probe ${type}`,
				JSON.stringify({ payloadKeys: Object.keys(payload ?? {}).slice(0, 14), ...info }),
			)
		} catch (error) {
			console.error(`${TAG} probe handler failed:`, error)
		}
		return payload
	})

	return unsub
}
