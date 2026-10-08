/**
 * Wraps a settings page so a render error shows "This page couldn't load" instead of closing
 * Discord. A broken shared lookup (`revenge.discord.design.Design` coming back empty) crashed the
 * app from a settings page on 2026-10-06; any other render error would have done the same.
 *
 * Built on first use, because `React.Component` must not be read at module scope. Each page gets
 * one wrapper, kept, so the navigator sees the same component on every render.
 */

const TAG = '[SendTweaks]'

let Boundary: any
const wrapped = new Map<any, any>()

function getBoundary(): any {
	if (Boundary) return Boundary
	const React = revenge.react.React
	Boundary = class extends React.Component<{ children?: any; name: string }, { error: unknown }> {
		state = { error: undefined as unknown }
		static getDerivedStateFromError(error: unknown) {
			return { error: error ?? new Error('Unknown error') }
		}
		componentDidCatch(error: unknown) {
			console.error(`${TAG} ${this.props.name} page failed to render:`, error)
		}
		render() {
			if (this.state.error === undefined) return this.props.children
			// Only React Native's own parts here: Discord's may be what failed.
			const { View, Text } = revenge.react.ReactNative
			const message = this.state.error instanceof Error ? this.state.error.message : String(this.state.error)
			return (
				<View style={{ padding: 16, gap: 8 }}>
					<Text style={{ fontSize: 16, fontWeight: '600', color: '#9a9aa2' }}>This page couldn't load</Text>
					<Text style={{ fontSize: 14, color: '#9a9aa2' }}>
						Something went wrong while drawing it. Discord is fine; go back and try again, or reload Discord. If it keeps
						happening, send the plugin's developer this error:
					</Text>
					<Text selectable style={{ fontSize: 12, color: '#9a9aa2', fontFamily: 'monospace' }}>
						{message}
					</Text>
				</View>
			)
		}
	}
	return Boundary
}

/** `Page`, wrapped so a render error stays on the page. */
export function safePage(Page: any, name = Page?.displayName || Page?.name || 'Settings'): any {
	let Safe = wrapped.get(Page)
	if (Safe) return Safe
	Safe = (props: any) => {
		const Boundary = getBoundary()
		return (
			<Boundary name={name}>
				<Page {...props} />
			</Boundary>
		)
	}
	Safe.displayName = `SafePage(${name})`
	wrapped.set(Page, Safe)
	return Safe
}
