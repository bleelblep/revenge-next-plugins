/**
 * The languages offered in the picker.
 *
 * Each has its English name for finding it and its own name for recognising it -- someone looking
 * for Japanese may well be looking for 日本語. The code is the one the plugin stores; each service
 * adapter translates it into whatever that service actually expects (see `codeFor` in
 * `providers.ts`), because they do not agree.
 *
 * Anything not listed can still be typed as a raw code at the bottom of the picker.
 */

export interface Language {
	code: string
	name: string
	native: string
}

export const LANGUAGES: Language[] = [
	{ code: 'en', name: 'English', native: 'English' },
	{ code: 'es', name: 'Spanish', native: 'Español' },
	{ code: 'fr', name: 'French', native: 'Français' },
	{ code: 'de', name: 'German', native: 'Deutsch' },
	{ code: 'it', name: 'Italian', native: 'Italiano' },
	{ code: 'pt', name: 'Portuguese', native: 'Português' },
	{ code: 'nl', name: 'Dutch', native: 'Nederlands' },
	{ code: 'ru', name: 'Russian', native: 'Русский' },
	{ code: 'uk', name: 'Ukrainian', native: 'Українська' },
	{ code: 'pl', name: 'Polish', native: 'Polski' },
	{ code: 'cs', name: 'Czech', native: 'Čeština' },
	{ code: 'sv', name: 'Swedish', native: 'Svenska' },
	{ code: 'no', name: 'Norwegian', native: 'Norsk' },
	{ code: 'da', name: 'Danish', native: 'Dansk' },
	{ code: 'fi', name: 'Finnish', native: 'Suomi' },
	{ code: 'el', name: 'Greek', native: 'Ελληνικά' },
	{ code: 'tr', name: 'Turkish', native: 'Türkçe' },
	{ code: 'ro', name: 'Romanian', native: 'Română' },
	{ code: 'hu', name: 'Hungarian', native: 'Magyar' },
	{ code: 'bg', name: 'Bulgarian', native: 'Български' },
	{ code: 'sr', name: 'Serbian', native: 'Српски' },
	{ code: 'hr', name: 'Croatian', native: 'Hrvatski' },
	{ code: 'ar', name: 'Arabic', native: 'العربية' },
	{ code: 'he', name: 'Hebrew', native: 'עברית' },
	{ code: 'fa', name: 'Persian', native: 'فارسی' },
	{ code: 'hi', name: 'Hindi', native: 'हिन्दी' },
	{ code: 'bn', name: 'Bengali', native: 'বাংলা' },
	{ code: 'ur', name: 'Urdu', native: 'اردو' },
	{ code: 'th', name: 'Thai', native: 'ไทย' },
	{ code: 'vi', name: 'Vietnamese', native: 'Tiếng Việt' },
	{ code: 'id', name: 'Indonesian', native: 'Bahasa Indonesia' },
	{ code: 'ms', name: 'Malay', native: 'Bahasa Melayu' },
	{ code: 'tl', name: 'Filipino', native: 'Filipino' },
	{ code: 'zh-CN', name: 'Chinese (Simplified)', native: '简体中文' },
	{ code: 'zh-TW', name: 'Chinese (Traditional)', native: '繁體中文' },
	{ code: 'ja', name: 'Japanese', native: '日本語' },
	{ code: 'ko', name: 'Korean', native: '한국어' },
	{ code: 'mi', name: 'Māori', native: 'Te Reo Māori' },
	{ code: 'sm', name: 'Samoan', native: 'Gagana Sāmoa' },
	{ code: 'to', name: 'Tongan', native: 'Lea Faka-Tonga' },
	{ code: 'sw', name: 'Swahili', native: 'Kiswahili' },
	{ code: 'af', name: 'Afrikaans', native: 'Afrikaans' },
	{ code: 'ga', name: 'Irish', native: 'Gaeilge' },
	{ code: 'cy', name: 'Welsh', native: 'Cymraeg' },
	{ code: 'la', name: 'Latin', native: 'Latina' },
]

export function languageFor(code: string): Language | undefined {
	const wanted = code.toLowerCase()
	return (
		LANGUAGES.find(language => language.code.toLowerCase() === wanted) ??
		// "zh" and "zh-cn" should both find Simplified Chinese.
		LANGUAGES.find(
			language => language.code.toLowerCase().split('-')[0] === wanted,
		)
	)
}

/** "Spanish (es)" for a known code, or the bare code for one typed by hand. */
export function describeCode(code: string): string {
	const language = languageFor(code)
	return language ? `${language.name} (${language.code})` : code
}

/**
 * Codes the services *report* that are not the ones stored above: Bing's script-tagged Chinese,
 * its `nb` and `fil`, and the retired `iw` Google still sometimes returns for Hebrew.
 */
const ALIASES: Record<string, string> = {
	iw: 'he',
	nb: 'no',
	nn: 'no',
	fil: 'tl',
	in: 'id',
	'zh-hans': 'zh-CN',
	'zh-hant': 'zh-TW',
}

/**
 * The name for a language a service detected, for the label under a translation.
 *
 * Falls back from an exact code, to an alias, to the base code, and finally to the code itself,
 * so an unfamiliar answer still shows something rather than nothing. A base-only match drops the
 * variant -- "zh" was detected, not specifically Simplified -- so it reads "Chinese".
 */
export function nameForDetected(code: string): string {
	const lower = code.toLowerCase()
	const exact = languageFor(ALIASES[lower] ?? code)
	if (
		exact &&
		exact.code.toLowerCase() === (ALIASES[lower] ?? code).toLowerCase()
	) {
		return exact.name
	}

	const base = (ALIASES[lower] ?? lower).split(/[-_]/)[0]
	const byBase = LANGUAGES.find(
		language => language.code.toLowerCase().split('-')[0] === base,
	)
	return byBase ? byBase.name.replace(/ \(.*\)$/, '') : code
}
