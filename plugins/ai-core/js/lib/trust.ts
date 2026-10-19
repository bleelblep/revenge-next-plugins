/**
 * Which plugins may use AI Core: only the user's own.
 *
 * A plugin's id and name are whatever its author wrote, so they prove nothing on their own. Where it
 * was installed from does: Revenge records that itself (`source.repo`, the repository URL the user
 * added), and a plugin can't change it. So a plugin is trusted when its id is one of the user's
 * (`bleelblep.`) and it came from one of the user's repositories, their local dev server, or a file
 * they sideloaded themselves.
 *
 * This decides who gets `api.ai`. The native half backs it up: its paid and dialog methods need
 * AI Core's session token, so skipping `api.ai` and calling native directly doesn't work either
 * (lib/vault.ts, AiCore.kt).
 */

import * as hiddenPlugins from '@revenge-mod/plugins/_'

const OWN_ID = /^bleelblep\./

/** The user's repositories: the public one on GitHub Pages and the Lab. */
const OWN_REPO_HOSTS = new Set(['bleelblep.github.io', 'bleelblep-lab.pages.dev'])

/** The local dev server (`bun run serve`), on this phone or the home network. */
function isPrivateHost(host: string): boolean {
	if (host === 'localhost' || host === '127.0.0.1') return true
	const parts = host.split('.')
	if (parts.length !== 4 || parts.some(p => !/^\d{1,3}$/.test(p))) return false
	const [a, b] = parts.map(Number)
	return a === 10 || (a === 192 && b === 168) || (a === 172 && b >= 16 && b <= 31)
}

function hostOf(url: string): string {
	try {
		return new URL(url).hostname.toLowerCase()
	} catch {
		return url.replace(/^[a-z]+:\/\//i, '').replace(/[/:?#].*$/, '').toLowerCase()
	}
}

export function trusted(plugin: any): { ok: true } | { ok: false; reason: string } {
	const id: string = plugin?.manifest?.id ?? ''
	if (!OWN_ID.test(id)) return { ok: false, reason: "it isn't one of your plugins" }
	let source: { repo: string | null } | null | undefined
	try {
		source = (hiddenPlugins as any).getInternalPluginMeta(plugin)?.source
	} catch {
		return { ok: false, reason: "Revenge wouldn't say where it was installed from" }
	}
	// No repository: a file the user sideloaded.
	if (!source || source.repo == null) return { ok: true }
	const host = hostOf(source.repo)
	if (OWN_REPO_HOSTS.has(host) || isPrivateHost(host)) return { ok: true }
	return { ok: false, reason: `it was installed from ${host}, which isn't one of your repositories` }
}
