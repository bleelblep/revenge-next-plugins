import { getProgress, subscribeProgress } from "./progressStore"

const { React } = revenge.react
const { View, Text, ActivityIndicator, StyleSheet } = revenge.react.ReactNative

/** Passed as `content` to the confirmation alert -- see progressStore.ts for why this works. */
export default function ProgressContent() {
	const [info, setInfo] = React.useState(() => getProgress())
	React.useEffect(() => subscribeProgress(setInfo), [])

	return (
		<View style={st.row}>
			<ActivityIndicator style={st.spinner} />
			<Text style={st.text}>{info.label}</Text>
		</View>
	)
}

const st = StyleSheet.create({
	row: { flexDirection: "row", alignItems: "center", paddingVertical: 8 },
	spinner: { marginRight: 10 },
	text: { color: "#dbdee1", fontSize: 14, flexShrink: 1 },
})
