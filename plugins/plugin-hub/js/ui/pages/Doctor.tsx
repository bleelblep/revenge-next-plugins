import {
	type Checkup,
	copyText,
	type Diagnosis,
	formatReport,
	formatVersion,
	lastCheckup,
	onCheckup,
	runCheckup,
} from '../../lib/doctor'
import { refreshSettingsUI } from '../../lib/settingsUi'
import { getStorage } from '../../lib/state'
import { rowIcon } from '../icon'
import { useBottomPadding } from '../safeArea'
import { openPlugin } from './DoctorPlugin'

function showToast(content: string) {
	revenge.discord.actions.ToastActionCreators.open({ key: 'PluginHubDoctorToast', content })
}

type Filter = 'all' | 'attention' | 'updates' | 'mine' | 'third-party'

const FILTERS: Array<[Filter, string]> = [
	['all', 'Everything'],
	['attention', 'Needs attention'],
	['updates', 'Has an update'],
	['mine', 'bleelblep plugins'],
	['third-party', 'Other authors'],
]

function matches(plugin: Diagnosis, filter: Filter, query: string): boolean {
	if (query) {
		const haystack = `${plugin.name} ${plugin.id} ${plugin.author ?? ''}`.toLowerCase()
		if (!haystack.includes(query)) return false
	}
	switch (filter) {
		case 'attention':
			return plugin.health !== 'ok'
		case 'updates':
			return plugin.notes.some(note => note.startsWith('Update available'))
		case 'mine':
			return plugin.origin === 'mine'
		case 'third-party':
			return plugin.origin === 'third-party' || plugin.origin === 'side-loaded'
		default:
			return true
	}
}

/**
 * Plugin Doctor: every installed plugin, whether it loaded, and whether it is out of date. Tapping
 * one opens everything known about it (`DoctorPlugin.tsx`).
 *
 * Hidden until unlocked from Hub settings (tap the version row seven times), and hideable again
 * from the bottom of this page.
 *
 * Runs a checkup on open and on "Check again", since the answer is only as fresh as the last look.
 * The result is kept for the session so the settings row can show a problem count.
 */
export default function Doctor() {
	// Read per-render, never at module scope -- see docs/porting-rules.md rule 1.
	const { React } = revenge.react
	const { Page } = revenge.components
	const { ScrollView, View } = revenge.react.ReactNative
	const { Stack, Text, Card, TableRowGroup, TableRow, TableRadioGroup, TableRadioRow, TextInput } =
		revenge.discord.design.Design
	const { useNavigation } = revenge.externals.ReactNavigation.ReactNavigationNative
	const navigation = useNavigation() as any

	const [checkup, setCheckup] = React.useState<Checkup | undefined>(lastCheckup())
	const [busy, setBusy] = React.useState(false)
	const [query, setQuery] = React.useState('')
	const [filter, setFilter] = React.useState<Filter>('all')

	const check = React.useCallback(async () => {
		setBusy(true)
		try {
			setCheckup(await runCheckup())
		} catch (error) {
			console.error('[PluginHub] checkup failed:', error)
			showToast('The checkup failed — see the log.')
		} finally {
			setBusy(false)
		}
	}, [])

	React.useEffect(() => {
		check()
		return onCheckup(() => setCheckup(lastCheckup()))
	}, [])

	const icon = (plugin: Diagnosis) =>
		plugin.health === 'error'
			? rowIcon('CircleErrorIcon')
			: plugin.health === 'warning'
				? rowIcon('ic_warning_24px', 'CircleErrorIcon')
				: rowIcon('CircleCheckIcon')

	const rows = (list: Diagnosis[]) =>
		list.map(plugin => (
			<TableRow
				key={plugin.id}
				label={plugin.name}
				subLabel={
					plugin.notes[0]
						? `${formatVersion(plugin.version)} · ${plugin.notes[0]}`
						: formatVersion(plugin.version)
				}
				icon={icon(plugin)}
				arrow
				onPress={() => openPlugin(navigation, plugin.id)}
			/>
		))

	const needle = query.trim().toLowerCase()
	const shown = (checkup?.plugins ?? []).filter(plugin => matches(plugin, filter, needle))
	const own = checkup?.plugins.filter(plugin => !plugin.core) ?? []
	const problems = shown.filter(plugin => !plugin.core && plugin.health === 'error')
	const warnings = shown.filter(plugin => !plugin.core && plugin.health === 'warning')
	const healthy = shown.filter(plugin => !plugin.core && plugin.health === 'ok')
	const core = shown.filter(plugin => plugin.core)

	const allProblems = own.filter(plugin => plugin.health === 'error').length
	const allWarnings = own.filter(plugin => plugin.health === 'warning').length
	const summary = !checkup
		? 'Checking…'
		: checkup.problem
			? 'Could not check'
			: allProblems
				? `${allProblems} plugin${allProblems === 1 ? '' : 's'} not working`
				: allWarnings
					? `All plugins loaded · ${allWarnings} to look at`
					: 'All plugins loaded'

	const hide = () => {
		getStorage()?.set({ doctorUnlocked: false })
		refreshSettingsUI()
		showToast('Plugin Doctor hidden. Tap the version in Hub settings seven times to bring it back.')
		navigation?.goBack?.()
	}

	return (
		<Page>
			<ScrollView
				keyboardShouldPersistTaps="handled"
				contentContainerStyle={{ paddingBottom: useBottomPadding() }}
			>
				<Stack spacing={24}>
					<Card variant="secondary" border="none">
						<View style={{ paddingHorizontal: 16, paddingVertical: 12, gap: 4 }}>
							<Text color="text-default" variant="text-md/semibold">
								{summary}
							</Text>
							<Text color="text-muted" variant="text-sm/normal">
								{checkup?.problem ??
									(checkup
										? `Discord ${formatVersion(checkup.discord)} · Revenge API ${formatVersion(checkup.revengeApi)} · ${own.length} plugins${checkup.liveState ? ' · live state from Developer Mode' : ''}`
										: 'Reading the plugin list and checking each repository for updates.')}
							</Text>
						</View>
					</Card>

					<TableRowGroup hasIcons>
						<TableRow
							label={busy ? 'Checking…' : 'Check again'}
							subLabel="Re-reads the plugin list and every repository's index"
							icon={rowIcon('RefreshIcon')}
							disabled={busy}
							onPress={check}
						/>
						<TableRow
							label="Copy report"
							subLabel="Every plugin with its versions, dependencies and errors, as text"
							icon={rowIcon('CopyIcon')}
							disabled={!checkup}
							onPress={() => {
								if (!checkup) return
								showToast(
									copyText(formatReport(checkup))
										? 'Report copied.'
										: 'Could not reach the clipboard.',
								)
							}}
						/>
					</TableRowGroup>

					{checkup && !checkup.problem ? (
						<>
							<TextInput
								placeholder="Search by name, id or author"
								value={query}
								onChange={(value: string) => setQuery(value)}
								isClearable
								returnKeyType="search"
							/>
							<TableRadioGroup
								title="Show"
								defaultValue={filter}
								onChange={(value: string) => setFilter(value as Filter)}
							>
								{FILTERS.map(([value, label]) => (
									<TableRadioRow key={value} label={label} value={value} />
								))}
							</TableRadioGroup>
						</>
					) : null}

					{problems.length ? (
						<TableRowGroup title="Not working" hasIcons>
							{rows(problems)}
						</TableRowGroup>
					) : null}
					{warnings.length ? (
						<TableRowGroup title="Worth a look" hasIcons>
							{rows(warnings)}
						</TableRowGroup>
					) : null}
					{healthy.length ? (
						<TableRowGroup title="Healthy" hasIcons>
							{rows(healthy)}
						</TableRowGroup>
					) : null}
					{core.length ? (
						<TableRowGroup title="Built into Revenge" hasIcons>
							{rows(core)}
						</TableRowGroup>
					) : null}
					{checkup && !checkup.problem && !shown.length ? (
						<Text color="text-muted" variant="text-sm/normal">
							Nothing matches.
						</Text>
					) : null}

					<TableRowGroup hasIcons>
						<TableRow
							label="Hide Plugin Doctor"
							subLabel="Removes the row from settings. Tap the version in Hub settings seven times to bring it back."
							icon={rowIcon('EyeSlashIcon', 'ic_hide')}
							onPress={hide}
						/>
					</TableRowGroup>
				</Stack>
			</ScrollView>
		</Page>
	)
}
