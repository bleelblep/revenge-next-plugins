import { addRule, type RuleKind, setEditing, useRules } from '../../lib/ruleStore'
import { compileRule, type Rule } from '../../lib/textReplace'
import { rowIcon } from '../icon'
import { EDIT_RULE_ROUTE, READY_LINKS_ROUTE, READY_TEXT_ROUTE } from '../routes'
import { useBottomPadding } from '../safeArea'

export function TextRules() {
	return <Rules kind="text" />
}

export function LinkRules() {
	return <Rules kind="links" />
}

/** "find → replace", short enough for one row. */
function summary(rule: Rule): string {
	const clip = (text: string) => (text.length > 40 ? `${text.slice(0, 39)}…` : text)
	if (!rule.find) return 'Empty — tap to set it up'
	return `${clip(rule.find)} → ${rule.replace ? clip(rule.replace) : '(removed)'}`
}

/**
 * A rule list: one row per rule, opening the rule on its own screen (`EditRule.tsx`). Its ready-made
 * rules and import box are on a screen of their own, reachable only from this list, so link rules
 * are only ever offered from Link rules and text rules from Replacement rules.
 */
function Rules({ kind }: { kind: RuleKind }) {
	// Read per-render, never at module scope -- see docs/porting-rules.md rule 1.
	const { Page } = revenge.components
	const { ScrollView } = revenge.react.ReactNative
	const { Stack, Text, TableRowGroup, TableRow } = revenge.discord.design.Design
	const { useNavigation } = revenge.externals.ReactNavigation.ReactNavigationNative
	const navigation = useNavigation() as any

	const links = kind === 'links'
	const rules = useRules(kind)

	const openReadyMade = () => navigation.navigate(links ? READY_LINKS_ROUTE : READY_TEXT_ROUTE)

	const open = (rule: Rule) => {
		setEditing(kind, rule.id)
		navigation.navigate(EDIT_RULE_ROUTE)
	}

	const icon = (rule: Rule) => {
		const broken = rule.find && compileRule(rule).error
		if (broken) return rowIcon('CircleErrorIcon')
		return rule.enabled && rule.find ? rowIcon('CircleCheckIcon') : rowIcon('CircleMinusIcon', 'CircleErrorIcon')
	}

	return (
		<Page>
			<ScrollView contentContainerStyle={{ paddingBottom: useBottomPadding() }}>
				<Stack spacing={24}>
					<Text color="text-muted" variant="text-sm/normal">
						{links
							? 'These run only inside links, after tracking is removed, and never inside code blocks — for swapping a site for a better-embedding one, like twitter.com for fxtwitter.com.'
							: 'These run top to bottom, each on the result of the one before. They never touch code blocks, links, mentions, custom emoji or timestamps.'}
					</Text>

					{rules.length ? (
						<TableRowGroup title={links ? 'Your link rules' : 'Your rules'} hasIcons>
							{rules.map((rule, index) => {
								const error = rule.find ? compileRule(rule).error : undefined
								return (
									<TableRow
										key={rule.id}
										label={rule.name || `Rule ${index + 1}`}
										subLabel={error ? `Not working: ${error}` : `${rule.enabled ? '' : 'Off · '}${summary(rule)}`}
										icon={icon(rule)}
										arrow
										onPress={() => open(rule)}
									/>
								)
							})}
						</TableRowGroup>
					) : null}

					<TableRowGroup hasIcons>
						<TableRow
							label={links ? 'Add a link rule' : 'Add a rule'}
							subLabel={
								rules.length
									? undefined
									: links
										? 'For example: find twitter.com, replace with fxtwitter.com'
										: 'For example: find "teh", replace with "the"'
							}
							icon={rowIcon('PlusSmallIcon', 'PlusLargeIcon', 'ic_add_24px')}
							arrow
							onPress={() => open(addRule(kind))}
						/>
						<TableRow
							label={links ? 'Ready-made link rules and import' : 'Ready-made rules and import'}
							subLabel="Shared in the Vendetta server's Text Replace thread, or paste your own"
							icon={rowIcon('DownloadIcon', 'ic_download_24px')}
							arrow
							onPress={openReadyMade}
						/>
					</TableRowGroup>
				</Stack>
			</ScrollView>
		</Page>
	)
}
