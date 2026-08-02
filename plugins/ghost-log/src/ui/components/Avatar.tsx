/**
 * Small round image for a user or server, falling back to an initial on a flat circle when there
 * is no hash — which covers default-avatar users, iconless servers, and any entry logged before
 * those fields were captured.
 */
export default function Avatar({
	kind,
	id,
	hash,
	name,
	size = 32,
}: {
	kind: "user" | "guild"
	id?: string
	hash?: string
	name: string
	size?: number
}) {
	const { Image, Text, View } = revenge.react.ReactNative

	const url =
		id && hash
			? `https://cdn.discordapp.com/${kind === "user" ? "avatars" : "icons"}/${id}/${hash}.${
					hash.startsWith("a_") ? "gif" : "png"
				}?size=64`
			: undefined

	if (url) {
		return <Image source={{ uri: url }} style={{ width: size, height: size, borderRadius: size / 2 }} />
	}

	return (
		<View
			style={{
				width: size,
				height: size,
				borderRadius: size / 2,
				backgroundColor: "#4E5058",
				alignItems: "center",
				justifyContent: "center",
			}}
		>
			<Text style={{ color: "#fff", fontSize: size * 0.42, fontWeight: "600" }}>
				{(name?.[0] ?? "?").toUpperCase()}
			</Text>
		</View>
	)
}
