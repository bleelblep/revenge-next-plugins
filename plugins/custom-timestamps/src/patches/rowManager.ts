import renderTimestamp, { type TimestampStorage } from "../lib/renderTimestamp"

const { lookupModule } = revenge.modules.finders
const { withName } = revenge.modules.finders.filters

// This runs inside RowManager.generate, i.e. on the chat render path. Anything that
// escapes here crashes the entire ChatView, so the whole body is guarded.
export default function patchRowManager(
	jsonStorage: RevengeJsonStorageApi<TimestampStorage>,
): () => void {
	const found = lookupModule<any>(withName("RowManager"))
	const RowManager = found?.[0]

	if (!RowManager?.prototype?.generate) {
		console.error("[CustomTimestamps] RowManager.prototype.generate not found")
		return () => {}
	}

	const moment = revenge.discord.common.moment

	const unpatchBefore = revenge.patcher.before(
		RowManager.prototype,
		"generate",
		([row]: any[]) => {
			try {
				const { selected, customFormat, separateMessages } = jsonStorage.cache
				if (row?.rowType === 1) {
					if (separateMessages) row.isFirst = true
					if (row.message?.timestamp) {
						row.message.__customTimestamp = renderTimestamp(
							row.message.timestamp,
							selected,
							customFormat,
						)
					}
				} else if (row?.rowType === "day" && typeof row.text === "string") {
					row.text = renderTimestamp(moment(row.text, "LL"), selected, customFormat)
				}
			} catch (error) {
				console.error("[CustomTimestamps] generate hook failed:", error)
			}
		},
	)

	const unpatchAfter = revenge.patcher.after(
		RowManager.prototype,
		"generate",
		([row]: any[], ret: any) => {
			try {
				if (row?.rowType !== 1) return ret

				const message = ret?.message
				if (
					message &&
					row.message?.__customTimestamp &&
					message.state === "SENT" &&
					message.timestamp
				) {
					message.timestamp = row.message.__customTimestamp
				}
			} catch (error) {
				console.error("[CustomTimestamps] generate return hook failed:", error)
			}
			return ret
		},
	)

	return () => {
		unpatchBefore()
		unpatchAfter()
	}
}
