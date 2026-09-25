import {
	copyText,
	type Diagnosis,
	findPlugin,
	formatBytes,
	formatPluginReport,
	formatVersion,
	hostOf,
	lastCheckup,
	onCheckup,
} from '../../lib/doctor'
import { rowIcon } from '../icon'
import { DOCTOR_PLUGIN_ROUTE } from '../routes'
import { useBottomPadding } from '../safeArea'

let selected: string | undefined

/**
 * Opens one plugin's details. The id travels in a module variable rather than route params: the
 * route is registered through Revenge's settings API, which gives no documented way to pass them.
 * `push` where the navigator has it, so following a dependency builds a back stack.
 */
export function openPlugin(navigation: any, id: string) {
	selected = id
	if (typeof navigation?.push === 'function') navigation.push(DOCTOR_PLUGIN_ROUTE)
	else navigation?.navigate?.(DOCTOR_PLUGIN_ROUTE)
}

export function selectedPluginName(): string {
	return (selected && findPlugin(selected)?.name) || 'Plugin'
}

function showToast(content: string) {
	revenge.discord.actions.ToastActionCreators.open({ key: 'PluginHubDoctorToast', content })
}

const ORIGIN: Record<Diagnosis['origin'], string> = {
	core: 'Built into Revenge',
	mine: 'bleelblep',
	'third-party': 'Third-party',
	'side-loaded': 'Side-loaded',
}

/**
 * Everything the Doctor knows about one plugin. No popups: every detail, errors and their stacks
 * included, is on the page itself, drawn with Discord's own components so it follows the theme.
 */
export default function DoctorPlugin() {
	// Read per-render, never at module scope -- see docs/porting-rules.md rule 1.
	const { React } = revenge.react
	const { Page } = revenge.components
	const { ScrollView, View } = revenge.react.ReactNative
	const { Stack, Text, Card, TableRowGroup, TableRow } = revenge.discord.design.Design
	const { useNavigation } = revenge.externals.ReactNavigation.ReactNavigationNative
	const navigation = useNavigation() as any

	// Pinned on mount: opening another plugin from here pushes a new screen with its own id.
	const [id] = React.useState(selected)
	const [, rerender] = React.useReducer((n: number) => n + 1, 0)
	React.useEffect(() => onCheckup(rerender), [])

	const checkup = lastCheckup()
	const plugin = id ? findPlugin(id) : undefined
	if (!plugin || !checkup) {
		return (
			<Page>
				<View style={{ padding: 16 }}>
					<Text color="text-muted" variant="text-sm/normal">
						Nothing to show. Go back to Plugin Doctor and run a checkup.
					</Text>
				</View>
			</Page>
		)
	}

	const nameOf = (other: string) => findPlugin(other)?.name ?? other
	const copy = (text: string, what: string) =>
		showToast(copyText(text) ? `${what} copied.` : 'Could not reach the clipboard.')

	const healthIcon =
		plugin.health === 'error'
			? rowIcon('CircleErrorIcon')
			: plugin.health === 'warning'
				? rowIcon('ic_warning_24px', 'CircleErrorIcon')
				: rowIcon('CircleCheckIcon')

	const live = plugin.live
	const yesNo = (value: boolean | null | undefined) => (value == null ? 'unknown' : value ? 'Yes' : 'No')

	return (
		<Page>
			<ScrollView contentContainerStyle={{ paddingBottom: useBottomPadding() }}>
				<Stack spacing={24}>
					<Card variant="secondary" border="none">
						<View style={{ paddingHorizontal: 16, paddingVertical: 12, gap: 4 }}>
							<Text color="text-default" variant="text-lg/bold">
								{plugin.name}
							</Text>
							<Text color="text-muted" variant="text-sm/medium">
								{[formatVersion(plugin.version), plugin.author ? `by ${plugin.author}` : null, ORIGIN[plugin.origin]]
									.filter(Boolean)
									.join(' · ')}
							</Text>
							{plugin.description ? (
								<Text color="text-default" variant="text-sm/normal" style={{ marginTop: 6 }}>
									{plugin.description}
								</Text>
							) : null}
						</View>
					</Card>

					<TableRowGroup title="Health" hasIcons>
						{plugin.notes.length ? (
							plugin.notes.map(note => (
								<TableRow key={note} label={note} icon={healthIcon} />
							))
						) : (
							<TableRow label="Loaded, nothing to report" icon={healthIcon} />
						)}
					</TableRowGroup>

					{live ? (
						<TableRowGroup title="Right now (Developer Mode)">
							<TableRow label="Turned on" trailing={<Text color="text-muted" variant="text-sm/normal">{yesNo(live.enabled)}</Text>} />
							<TableRow label="State" trailing={<Text color="text-muted" variant="text-sm/normal">{live.status ?? 'unknown'}</Text>} />
							<TableRow label="Waiting for a restart" trailing={<Text color="text-muted" variant="text-sm/normal">{yesNo(live.pendingReload)}</Text>} />
							<TableRow label="Update waiting to apply" trailing={<Text color="text-muted" variant="text-sm/normal">{yesNo(live.pendingUpdate)}</Text>} />
							<TableRow label="Turned on mid-session" trailing={<Text color="text-muted" variant="text-sm/normal">{yesNo(live.startedLate)}</Text>} />
						</TableRowGroup>
					) : null}

					{plugin.errors.length ? (
						<View style={{ gap: 8 }}>
							<Text color="text-muted" variant="text-sm/semibold">
								{`ERRORS (${plugin.errors.length})`}
							</Text>
							{plugin.errors.map((error, index) => (
								<Card key={`${error.code}-${index}`} variant="secondary" border="none">
									<View style={{ paddingHorizontal: 16, paddingVertical: 12, gap: 6 }}>
										<Text color="text-feedback-critical" variant="text-sm/semibold">
											{error.code}
										</Text>
										<Text color="text-default" variant="text-sm/normal" selectable>
											{error.message || 'No message.'}
										</Text>
										{error.stack ? (
											<Text
												color="text-muted"
												variant="text-xs/normal"
												selectable
												style={{ fontFamily: 'monospace' }}
											>
												{error.stack}
											</Text>
										) : null}
									</View>
									<TableRow
										label="Copy this error"
										icon={rowIcon('CopyIcon')}
										onPress={() =>
											copy(
												[`${plugin.id} ${formatVersion(plugin.version)}`, `${error.code}: ${error.message}`, error.stack ?? '']
													.filter(Boolean)
													.join('\n'),
												'Error',
											)
										}
									/>
								</Card>
							))}
						</View>
					) : null}

					{plugin.dependencies.length ? (
						<TableRowGroup title="Needs" hasIcons>
							{plugin.dependencies.map(dependency => {
								const installed = !!findPlugin(dependency.id)
								return (
									<TableRow
										key={dependency.id}
										label={nameOf(dependency.id)}
										subLabel={`${dependency.range === '*' ? 'any version' : dependency.range}${dependency.optional ? ' · optional' : ''} · ${dependency.installed ? `has ${formatVersion(dependency.installed)}` : 'not installed'}`}
										icon={
											dependency.satisfied
												? rowIcon('CircleCheckIcon')
												: dependency.optional
													? rowIcon('ic_warning_24px', 'CircleErrorIcon')
													: rowIcon('CircleErrorIcon')
										}
										arrow={installed}
										onPress={installed ? () => openPlugin(navigation, dependency.id) : undefined}
									/>
								)
							})}
						</TableRowGroup>
					) : null}

					{plugin.dependents.length ? (
						<TableRowGroup title={`Used by (${plugin.dependents.length})`}>
							{plugin.dependents.map(other => (
								<TableRow
									key={other}
									label={nameOf(other)}
									subLabel={other}
									arrow
									onPress={() => openPlugin(navigation, other)}
								/>
							))}
						</TableRowGroup>
					) : null}

					{plugin.repo || plugin.published.length ? (
						<TableRowGroup title="Updates">
							<TableRow
								label="Installed"
								trailing={<Text color="text-muted" variant="text-sm/normal">{formatVersion(plugin.version)}</Text>}
							/>
							<TableRow
								label="Latest"
								subLabel={plugin.indexProblem}
								trailing={
									<Text color="text-muted" variant="text-sm/normal">
										{plugin.latest
											? `${formatVersion(plugin.latest)}${plugin.latestSize != null ? ` · ${formatBytes(plugin.latestSize)}` : ''}`
											: 'unknown'}
									</Text>
								}
							/>
							{plugin.repo ? (
								<TableRow
									label="Repository"
									subLabel={`${plugin.repo} · ${plugin.channel ?? 'latest'} channel`}
									onPress={() => copy(plugin.repo!, 'Repository link')}
								/>
							) : null}
						</TableRowGroup>
					) : null}

					{plugin.published.length ? (
						<TableRowGroup title={`Published versions (${plugin.published.length})`}>
							{plugin.published.slice(0, 15).map(published => {
								const current = published.version === formatVersion(plugin.version)
								return (
									<TableRow
										key={published.version}
										label={current ? `${published.version} (installed)` : published.version}
										trailing={<Text color="text-muted" variant="text-sm/normal">{formatBytes(published.size)}</Text>}
									/>
								)
							})}
						</TableRowGroup>
					) : null}

					<TableRowGroup title="Details">
						<TableRow label="Id" subLabel={plugin.id} onPress={() => copy(plugin.id, 'Id')} />
						<TableRow
							label="Native code"
							subLabel={plugin.hasNative ? 'Has a Kotlin/Java part that runs outside JavaScript' : 'JavaScript only'}
						/>
						<TableRow label="Script size" trailing={<Text color="text-muted" variant="text-sm/normal">{formatBytes(plugin.scriptBytes)}</Text>} />
						{plugin.isApi ? (
							<TableRow label="API plugin" subLabel="Adds to the plugin API every other plugin gets" />
						) : null}
						{plugin.enabledByDefault != null ? (
							<TableRow label="On by default" trailing={<Text color="text-muted" variant="text-sm/normal">{yesNo(plugin.enabledByDefault)}</Text>} />
						) : null}
						<TableRow
							label="Source"
							subLabel={plugin.repo ? `Installed from ${hostOf(plugin.repo)}` : ORIGIN[plugin.origin]}
						/>
					</TableRowGroup>

					<TableRowGroup hasIcons>
						<TableRow
							label="Copy everything about this plugin"
							subLabel="Versions, dependencies, notes and errors with stacks"
							icon={rowIcon('CopyIcon')}
							onPress={() => copy(formatPluginReport(plugin, checkup), 'Details')}
						/>
					</TableRowGroup>
				</Stack>
			</ScrollView>
		</Page>
	)
}
