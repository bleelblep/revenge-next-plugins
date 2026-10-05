import { greetingsUnlocked } from '../../lib/greetings'
import { rowIcon } from '../icon'
import { TEMPLATE_ROUTE } from '../routes'
import { openTemplateSession } from '../templateSession'

/** A navigation shortcut, not a modal: each template task gets a full screen. */
export function TemplateHelpButton({ initial = '', apply }: { initial?: string; apply?: (text: string) => void }) {
	const { Pressable } = revenge.react.ReactNative
	const { useNavigation } = revenge.externals.ReactNavigation.ReactNavigationNative
	const navigation = useNavigation() as any
	if (!greetingsUnlocked()) return null
	return <Pressable accessibilityRole="button" accessibilityLabel="Template tools" onPress={() => {
		if (!greetingsUnlocked()) return
		openTemplateSession(initial, apply)
		navigation.navigate(TEMPLATE_ROUTE)
	}} style={{ minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center', marginRight: 8 }}>{rowIcon('MagicWandIcon', 'InfoIcon')}</Pressable>
}
