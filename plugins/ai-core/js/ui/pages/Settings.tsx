import { DEFAULTS } from '../../defaults'
import { listDependents } from '../../lib/dependents'
import { callsRemaining, today } from '../../lib/state'
import { rowIcon } from '../icon'
import { DEBUG_ROUTE, PROVIDER_ROUTE, USAGE_ROUTE } from '../routes'
import { useBottomPadding } from '../safeArea'
import type { AiCoreStorage } from '../../types'

/**
 * The root index. A neutral notice card rather than a warning one: nothing here is dangerous,
 * but "a plugin sends your text to a company" is easy to misread in either direction, so the
 * scope of what leaves the device is stated before any control.
 */
export default function Settings({
	api,
}: {
	api: RevengePluginStartApi<AiCoreStorage>
}) {
	// Read per-render, never at module scope -- see docs/porting-rules.md rule 1.
	const { Page } = revenge.components
	const { ScrollView, View } = revenge.react.ReactNative
	const { Stack, Text, Card, TableRowGroup, TableRow } =
		revenge.discord.design.Design
	const { useNavigation } =
		revenge.externals.ReactNavigation.ReactNavigationNative

	const navigation = useNavigation() as { navigate: (route: string) => void }
	const s = { ...DEFAULTS, ...(api.jsonStorage.use() ?? {}) }

	const used = s.usageDay === today() ? s.usageCalls : 0
	const counts = s.usageDay === today() ? s.usageByPlugin : {}
	const users = listDependents().map(d => ({ ...d, calls: counts[d.id] ?? 0 }))
	const host = (() => {
		try {
			return s.baseUrl.replace(/^https?:\/\//, '').replace(/\/.*$/, '')
		} catch {
			return s.baseUrl
		}
	})()

	return (
		<Page>
			<ScrollView contentContainerStyle={{ paddingBottom: useBottomPadding() }}>
				<Stack spacing={24}>
					<Card variant="secondary" border="none">
						<View style={{ paddingHorizontal: 16, paddingVertical: 12 }}>
							<Text color="text-default" variant="text-md/semibold">
								This plugin does nothing on its own
							</Text>
							<Text
								color="text-muted"
								variant="text-sm/normal"
								style={{ marginTop: 8 }}
							>
								It holds one API key, one daily spending cap and one request
								queue on behalf of the plugins that ask for them. Text only
								leaves this device when one of those plugins decides it needs an
								answer, and only the text that plugin chose to send. Nothing is
								stored here but your key and a running count.
							</Text>
						</View>
					</Card>

					<Text color="text-muted" variant="text-sm/normal">
						Your key is kept in this plugin's storage in plain text, where any
						other plugin you install can read it. Use one you can revoke.
					</Text>

					<TableRowGroup hasIcons>
						<TableRow
							label="Provider"
							subLabel={
								s.apiKey
									? `${s.model} via ${host}`
									: 'No key set — nothing can call out'
							}
							icon={rowIcon('LinkIcon', 'ic_link')}
							arrow
							onPress={() => navigation.navigate(PROVIDER_ROUTE)}
						/>
						<TableRow
							label="Usage and limits"
							subLabel={`${used} of ${s.dailyCallCap} calls today, ${callsRemaining()} left`}
							icon={rowIcon('SpeedometerIcon', 'ic_analytics')}
							arrow
							onPress={() => navigation.navigate(USAGE_ROUTE)}
						/>
					</TableRowGroup>

					{/*
					 * Whoever opened this screen almost certainly came from one of these, so the
					 * quickest way out is back to the plugin that sent them. The list is built from
					 * what has actually registered this session -- see `lib/dependents.ts`.
					 */}
					{users.length ? (
						<TableRowGroup title="Plugins using AI Core" hasIcons>
							{users.map(dependent => (
								<TableRow
									key={dependent.id}
									label={dependent.name}
									subLabel={
										dependent.calls
											? `${dependent.calls} call${dependent.calls === 1 ? '' : 's'} today`
											: 'No calls today'
									}
									icon={rowIcon(dependent.icon ?? 'MagicWandIcon', 'MagicWandIcon', 'ic_star')}
									arrow={!!dependent.route}
									onPress={
										dependent.route
											? () => navigation.navigate(dependent.route!)
											: undefined
									}
								/>
							))}
						</TableRowGroup>
					) : (
						<TableRowGroup title="Plugins using AI Core">
							<View style={{ paddingHorizontal: 16, paddingVertical: 12 }}>
								<Text color="text-muted" variant="text-sm/normal">
									Nothing is using it yet. Install a plugin that asks for AI
									Core — Second Thoughts is the one in this repository — and it
									will appear here.
								</Text>
							</View>
						</TableRowGroup>
					)}

					<TableRowGroup title="Developer" hasIcons>
						<TableRow
							label="Debug"
							subLabel="Logging and a connection test"
							icon={rowIcon('BugIcon', 'ic_debug')}
							arrow
							onPress={() => navigation.navigate(DEBUG_ROUTE)}
						/>
					</TableRowGroup>
				</Stack>
			</ScrollView>
		</Page>
	)
}
