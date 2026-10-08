import { getAi } from '../lib/state'
import AiRules from './pages/AiRules'
import Debug from './pages/Debug'
import EditRule from './pages/EditRule'
import Options from './pages/Options'
import { ReadyMadeLinks, ReadyMadeText } from './pages/ReadyMade'
import { LinkRules, TextRules } from './pages/Rules'
// import Styles from './pages/Styles' -- Restyle is commented out for now, see lib/preview.ts
import TryIt from './pages/TryIt'
import { safePage } from './safePage'
import Templates, { TemplateGuide, TemplateHelper, TemplatePlayground, TemplateSnippets, TemplateFormats } from './pages/Templates'

const PREFIX = 'bleelblep.send-tweaks'

export const OPTIONS_ROUTE = `${PREFIX}.options`
export const RULES_ROUTE = `${PREFIX}.rules`
export const LINK_RULES_ROUTE = `${PREFIX}.link-rules`
export const EDIT_RULE_ROUTE = `${PREFIX}.edit-rule`
/** The AI screen. Registered only while AI Core is installed. */
export const AI_ROUTE = `${PREFIX}.ai`
export const READY_LINKS_ROUTE = `${PREFIX}.ready-made-links`
export const READY_TEXT_ROUTE = `${PREFIX}.ready-made-text`
export const TRY_ROUTE = `${PREFIX}.try`
export const STYLES_ROUTE = `${PREFIX}.styles`
export const DEBUG_ROUTE = `${PREFIX}.debug`
export const TEMPLATE_ROUTE = `${PREFIX}.templates`
export const TEMPLATE_HELPER_ROUTE = `${PREFIX}.template-helper`
export const TEMPLATE_GUIDE_ROUTE = `${PREFIX}.template-guide`
export const TEMPLATE_PLAY_ROUTE = `${PREFIX}.template-playground`
export const TEMPLATE_SNIPPETS_ROUTE = `${PREFIX}.template-snippets`
export const TEMPLATE_FORMATS_ROUTE = `${PREFIX}.template-formats`

/**
 * Upstream commit 10371ff merged `refreshSettingsNavigator` + `refreshSettingsOverviewScreen`
 * into `refreshSettings`. Which exists depends on the bundle the user is running.
 */
function refreshSettingsUI() {
	const settings = revenge.discord.modules.settings as any
	if (typeof settings.refreshSettings === 'function') {
		settings.refreshSettings()
		return
	}
	settings.refreshSettingsNavigator?.()
	settings.refreshSettingsOverviewScreen?.()
}

export function registerPages(): () => void {
	const { registerSettingsItem, onSettingsModulesLoaded } =
		revenge.discord.modules.settings

	const route = (key: string, title: string, component: any) =>
		registerSettingsItem(key, {
			parent: null,
			type: 'route',
			useTitle: () => title,
			screen: { route: key, getComponent: () => safePage(component, title) },
		})

	// Registered inside `onSettingsModulesLoaded`: it fires immediately when Discord's
	// settings modules are already loaded, and waits when they are not. Registering
	// before they exist is how a page ends up missing until the app is restarted.
	let unregister: Array<() => void> = []
	const unsubscribe = onSettingsModulesLoaded(() => {
		unregister = [
			route(OPTIONS_ROUTE, 'Settings', Options),
			route(RULES_ROUTE, 'Replacement rules', TextRules),
			route(LINK_RULES_ROUTE, 'Link rules', LinkRules),
			route(EDIT_RULE_ROUTE, 'Edit rule', EditRule),
			route(READY_LINKS_ROUTE, 'Ready-made link rules', ReadyMadeLinks),
			route(READY_TEXT_ROUTE, 'Ready-made rules', ReadyMadeText),
			route(TRY_ROUTE, 'Try a message', TryIt),
			// route(STYLES_ROUTE, 'Styles', Styles),
			route(DEBUG_ROUTE, 'Debug', Debug),
			route(TEMPLATE_ROUTE, 'Template helpers', Templates),
			route(TEMPLATE_HELPER_ROUTE, 'Insert helper', TemplateHelper),
			route(TEMPLATE_GUIDE_ROUTE, 'Placeholders', TemplateGuide),
			route(TEMPLATE_PLAY_ROUTE, 'Try a template', TemplatePlayground),
			route(TEMPLATE_SNIPPETS_ROUTE, 'Snippets', TemplateSnippets),
			route(TEMPLATE_FORMATS_ROUTE, 'Date & time', TemplateFormats),
		]
		// Only with AI Core installed: without it there is nothing to show and nothing links here.
		if (getAi()) unregister.push(route(AI_ROUTE, 'Write a rule with AI', AiRules))

		refreshSettingsUI()
	})

	return () => {
		unsubscribe()
		for (const remove of unregister) remove()
		unregister = []
		refreshSettingsUI()
	}
}
