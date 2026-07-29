const { lookupModule } = revenge.modules.finders
const { withProps } = revenge.modules.finders.filters

// The input component is a named `InputView` export on classic Revenge builds, not the
// module's default -- never destructure a finder result, keep both fallbacks.
const InputModule = lookupModule<any>(withProps("ClearButtonVisibility"))?.[0]
const ClearButtonVisibility = InputModule?.ClearButtonVisibility
const InputView = InputModule?.InputView ?? InputModule?.default

export function CustomTimeInputRow({
	value,
	onChangeText,
	placeholder,
	disabled,
}: {
	value: string
	onChangeText: (text: string) => void
	placeholder: string
	disabled?: boolean
}) {
	if (!InputView) return null

	return (
		<InputView
			value={value}
			onChangeText={onChangeText}
			placeholder={placeholder}
			clearButtonVisibility={ClearButtonVisibility?.WITH_CONTENT}
			showBorder={false}
			showTopContainer={false}
			disabled={disabled}
			style={{ paddingHorizontal: 15, paddingVertical: 13 }}
		/>
	)
}
