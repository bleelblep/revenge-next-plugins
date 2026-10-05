import { FEATURES } from '../features/catalog'
import { PRESETS } from '../core/scenes'
import { channel, generate, native, previewScene, scenes, selected, sync, update, useSettings } from '../core/state'
import { useBottomPadding } from '../../../../shared/ui/safeArea'

export default function Settings() {
	const React = revenge.react.React
	const { ScrollView, View, TextInput, Alert } = revenge.react.ReactNative
	const { Page } = revenge.components
	const { Stack, Text, TableRow, TableRowGroup } = revenge.discord.design.Design
	const s = useSettings()
	const [prompt, setPrompt] = React.useState('')
	const [busy, setBusy] = React.useState(false)
	const [status, setStatus] = React.useState('Tap a scene to preview it. Play everywhere keeps it running.')
	const [tab, setTab] = React.useState('features')
	const act = async (name: string, args: unknown[] = []) => {
		try {
			if (name === 'cast' || name === 'gesture') { await update({ enabled: true, spellbook: true }); await sync(true) }
			const r = await native(name, args); setStatus(typeof r === 'string' ? r : JSON.stringify(r))
		}
		catch (e) { setStatus(String(e)) }
	}
	const preview = async (scene = selected()) => {
		try { setStatus(await previewScene(scene)) } catch (e) { setStatus(String(e)) }
	}
	const cycle = (key: 'glassStyle' | 'holoStyle', options: string[]) => update({ [key]: options[(options.indexOf(s[key]) + 1) % options.length] } as any)
	const current = channel()
	return <Page><ScrollView contentContainerStyle={{ padding: 16, paddingBottom: useBottomPadding() }} keyboardShouldPersistTaps="handled">
		<Stack spacing={16}>
			<View style={{ padding: 20, borderRadius: 24, backgroundColor: '#28233D' }}>
				<Text variant="heading-lg/bold" color="text-default">Dreamscape</Text>
				<Text variant="text-sm/normal" color="text-muted">Glass, foil and small worlds inside Discord.</Text>
			</View>
			<TableRowGroup>
				<TableRow label={`Dreamscape · ${s.enabled ? 'On' : 'Off'}`} subLabel="Tap to enable or disable all modules" onPress={() => update({ enabled: !s.enabled })} />
				{['features', 'scenes', 'spells'].map(name => <TableRow key={name} label={`${tab === name ? '✓ ' : ''}${name[0].toUpperCase()}${name.slice(1)}`} onPress={() => setTab(name)} />)}
			</TableRowGroup>
			<Text variant="text-sm/normal" color="text-muted">{status}</Text>
			{tab === 'features' && <>
				<TableRowGroup title="Independent modules">{FEATURES.map(f => <TableRow key={f.key} label={`${f.title} · ${s[f.key] ? 'On' : 'Off'}`} subLabel={f.description} onPress={() => update({ [f.key]: !s[f.key] })} />)}</TableRowGroup>
				<TableRowGroup title="Look and motion">
					<TableRow label={`Demo surfaces · ${s.demo ? 'On' : 'Off'}`} subLabel="Glass lens and foil card. Turn off for detected surfaces only." onPress={() => update({ demo: !s.demo })} />
					<TableRow label={`Glass · ${s.glassStyle}`} onPress={() => cycle('glassStyle', ['clear', 'frosted', 'smoked'])} />
					<TableRow label={`Hologram · ${s.holoStyle}`} onPress={() => cycle('holoStyle', ['foil', 'prismatic', 'ghost'])} />
					<TableRow label={`Strength · ${Math.round(s.strength * 100)}%`} onPress={() => update({ strength: s.strength >= 0.9 ? 0.25 : Math.min(1, s.strength + 0.25) })} />
					<TableRow label={`Tilt · ${s.tilt ? 'On' : 'Off'}`} onPress={() => update({ tilt: !s.tilt })} />
					<TableRow label={`Reduced motion · ${s.reducedMotion ? 'On' : 'Off'}`} onPress={() => update({ reducedMotion: !s.reducedMotion })} />
					{[30, 60, 90].map(fps => <TableRow key={fps} label={`${s.fps === fps ? '✓ ' : ''}${fps} FPS`} subLabel={fps === 90 ? 'Display-synced target; requires an active 90 Hz or faster display' : fps === 60 ? 'Smooth animation' : 'Lower frame budget'} onPress={() => update({ fps })} />)}
				</TableRowGroup>
			</>}
			{tab === 'scenes' && <>
				<TableRowGroup title="Scene library · tap to preview">{scenes().map(scene => <TableRow key={scene.id} label={`${scene.id === s.sceneId ? '✓ ' : ''}${scene.name}`} subLabel={`${scene.world} · 12-second live preview`} onPress={() => void preview(scene)} />)}</TableRowGroup>
				<TableRowGroup title={selected().name}>
					<TableRow label="Preview for 12 seconds" subLabel="Enables Dreamscape and plays immediately" onPress={() => void preview()} />
					<TableRow label={`${s.playEverywhere ? '✓ ' : ''}Play everywhere`} subLabel="Keep the selected atmosphere visible throughout Discord" onPress={() => update({ enabled: true, dreams: true, playEverywhere: true })} />
					<TableRow label={`${!s.playEverywhere ? '✓ ' : ''}Channel-only`} subLabel="Play only in channels with an assigned scene" onPress={() => update({ playEverywhere: false })} />
					<TableRow label="Stop scene playback" onPress={async () => { await update({ dreams: false, playEverywhere: false }); await act('clear') }} />
					<TableRow label="Assign to current channel" subLabel={current ?? 'Open a channel first'} onPress={() => current ? update({ enabled: true, dreams: true, channels: { ...s.channels, [current]: s.sceneId } }) : setStatus('Open a channel first.')} />
					<TableRow label="Remove current channel assignment" onPress={() => { if (current) { const channels = { ...s.channels }; delete channels[current]; update({ channels }) } }} />
					<TableRow label="Duplicate selected scene" onPress={() => { if (s.scenes.length >= 40) return setStatus('Scene library is full.'); const copy = { ...selected(), id: `copy_${Date.now()}`, name: `${selected().name.slice(0, 50)} copy` }; update({ scenes: [...s.scenes, copy], sceneId: copy.id }) }} />
					<TableRow label="Rename selected custom scene" subLabel="Uses the text field below" onPress={() => { if (PRESETS.some(v => v.id === s.sceneId)) return setStatus('Duplicate a built-in scene before editing it.'); if (!prompt.trim()) return; update({ scenes: s.scenes.map(v => v.id === s.sceneId ? { ...v, name: prompt.trim().slice(0, 60) } : v) }) }} />
					<TableRow label="Adjust selected scene intensity" subLabel={`${Math.round(selected().intensity * 100)}% · duplicate a preset to edit it`} onPress={() => { if (PRESETS.some(v => v.id === s.sceneId)) return setStatus('Duplicate this preset first.'); update({ scenes: s.scenes.map(v => v.id === s.sceneId ? { ...v, intensity: v.intensity >= .6 ? .1 : Math.min(.7, v.intensity + .1) } : v) }) }} />
					<TableRow label="Delete selected custom scene" onPress={() => { if (PRESETS.some(v => v.id === s.sceneId)) return setStatus('Built-in scenes cannot be deleted.'); Alert.alert('Delete scene?', selected().name, [{ text: 'Cancel' }, { text: 'Delete', onPress: () => update({ scenes: s.scenes.filter(v => v.id !== s.sceneId), sceneId: 'space' }) }]) }} />
				</TableRowGroup>
				<TextInput accessibilityLabel="Scene description or new name" value={prompt} onChangeText={setPrompt} placeholder="A moonlit aquarium with slow teal bubbles" placeholderTextColor="#9992AC" multiline maxLength={1200} style={{ backgroundColor: '#28233D', color: '#FFFFFF', padding: 16, borderRadius: 16, minHeight: 96 }} />
				<TableRowGroup><TableRow label={busy ? 'Creating scene…' : 'Create with AI Core'} subLabel="Only this description is sent. Saved scenes play locally." onPress={async () => { if (busy) return; setBusy(true); try { const scene = await generate(prompt); setStatus(`Saved ${scene.name}`) } catch (e) { setStatus(String(e)) } finally { setBusy(false) } }} /></TableRowGroup>
			</>}
			{tab === 'spells' && <TableRowGroup title="Tap to cast, or use the star handle">
				<TableRow label="Draw a spell" subLabel="Use your saved symbol bindings below" onPress={() => void act('gesture')} />
				{(['circle', 'zigzag', 'v'] as const).map(symbol => <TableRow key={symbol} label={`${symbol} → ${s.bindings[symbol]}`} subLabel="Tap to change this binding" onPress={() => { const options = ['portal', 'frost', 'prism', 'meteor']; update({ bindings: { ...s.bindings, [symbol]: options[(options.indexOf(s.bindings[symbol]) + 1) % options.length] } }) }} />)}
				{['portal', 'frost', 'prism', 'meteor'].map(spell => <TableRow key={spell} label={spell} onPress={() => void act('cast', [spell])} />)}
			</TableRowGroup>}
			<TableRowGroup title="Status"><TableRow label="Refresh diagnostics" onPress={() => void act('status')} /><TableRow label="Stop previews and spells" onPress={() => void act('clear')} /></TableRowGroup>
		</Stack>
	</ScrollView></Page>
}
