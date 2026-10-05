import { ATMOSPHERES, type Settings as Preferences } from '../model'
import { native, update, useSettings } from '../state'
import { useBottomPadding } from '../../../../shared/ui/safeArea'

export default function Settings() {
	const React = revenge.react.React
	const { ScrollView } = revenge.react.ReactNative
	const { Page } = revenge.components
	const { Stack, Text, TableRow, TableRowGroup } = revenge.discord.design.Design
	const s = useSettings()
	const bottom = useBottomPadding()
	const [message, setMessage] = React.useState('Choose an atmosphere to start playing. Everything runs locally.')
	const [diagnostics, setDiagnostics] = React.useState('')
	const apply = async (patch: Partial<Preferences>) => {
		try {
			const result = await update(patch)
			setMessage(result?.message ?? 'Updated')
		} catch (error) { setMessage(String(error)) }
	}
	return <Page><ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: bottom }}>
		<Stack spacing={16}>
			<Text variant="heading-lg/bold" color="text-default">Scenes</Text>
			<Text variant="text-sm/normal" color="text-muted">Living light, weather and atmosphere across Discord.</Text>
			<TableRowGroup>
				<TableRow label={s.enabled ? 'Stop atmosphere' : 'Play selected atmosphere'} subLabel={ATMOSPHERES.find(v => v.id === s.scene)?.name} onPress={() => void apply({ enabled: !s.enabled })} />
			</TableRowGroup>
			<Text variant="text-sm/normal" color="text-muted">{message}</Text>
			<TableRowGroup title="Built-in atmospheres · tap to play">
				{ATMOSPHERES.map(scene => <TableRow key={scene.id} label={`${s.scene === scene.id ? '✓ ' : ''}${scene.name}`} subLabel={scene.description} onPress={() => void apply({ enabled: true, scene: scene.id })} />)}
			</TableRowGroup>
			<TableRowGroup title="Atmosphere strength">
				{[{ value: .35, name: 'Soft' }, { value: .65, name: 'Balanced' }, { value: 1, name: 'Immersive' }].map(option => <TableRow key={option.value} label={`${s.intensity === option.value ? '✓ ' : ''}${option.name}`} onPress={() => void apply({ intensity: option.value })} />)}
			</TableRowGroup>
			<TableRowGroup title="Motion">
				{[{ value: .3, name: 'Slow drift' }, { value: .6, name: 'Natural' }, { value: 1, name: 'Lively' }].map(option => <TableRow key={option.value} label={`${s.speed === option.value ? '✓ ' : ''}${option.name}`} onPress={() => void apply({ speed: option.value })} />)}
				<TableRow label={`Reduced motion · ${s.reducedMotion ? 'On' : 'Off'}`} subLabel="Freeze the atmosphere in place" onPress={() => void apply({ reducedMotion: !s.reducedMotion })} />
			</TableRowGroup>
			<TableRowGroup title="Frame rate">
				{[30, 60, 90].map(fps => <TableRow key={fps} label={`${s.fps === fps ? '✓ ' : ''}${fps} FPS`} subLabel={fps === 90 ? 'Needs an active 90 Hz or faster display' : fps === 60 ? 'Smooth · default' : 'Lower frame budget'} onPress={() => void apply({ fps })} />)}
			</TableRowGroup>
			<TableRowGroup title="Renderer">
				<TableRow label="Refresh diagnostics" subLabel="Android 13+ runtime shaders · shared VFX compositor" onPress={async () => {
					try {
						const d = await native('status')
						setDiagnostics(`${d.message}\nScene: ${d.scene}\nTarget: ${d.targetFps} FPS · updates: ${d.updateFps} FPS\nDisplay: ${d.displayHz} Hz\nShader: ${d.shaderError ?? 'OK'}`)
					} catch (error) { setDiagnostics(String(error)) }
				}} />
			</TableRowGroup>
			{!!diagnostics && <Text variant="text-sm/normal" color="text-muted">{diagnostics}</Text>}
		</Stack>
	</ScrollView></Page>
}
