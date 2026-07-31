import type { ServiceType } from "../types"

/**
 * Trimmed from the original's `utils/debug.ts`. The asset fields exist because album-art
 * resolution has several silent failure points and there's no way to observe them from the
 * device -- the settings page renders these so a broken step is visible without a debugger.
 */
export const debugState = {
	apiCalls: 0,
	successfulUpdates: 0,
	lastError: undefined as string | undefined,
	lastErrorService: undefined as ServiceType | undefined,
	info: {} as Record<string, unknown>,

	/** Album-art pipeline, in order. Overwritten on every track change. */
	httpUtilsResolved: false,
	lastTrack: undefined as string | undefined,
	lastAlbumArtUrl: undefined as string | undefined,
	lastAssetStage: undefined as string | undefined,
	lastAssetResult: undefined as string | undefined,
}

export function incrementApiCall() {
	debugState.apiCalls++
}

export function recordSuccessfulUpdate() {
	debugState.successfulUpdates++
}

export function recordServiceError(service: ServiceType | undefined, error: string) {
	debugState.lastError = error
	debugState.lastErrorService = service
}

export function setDebugInfo(key: string, value: unknown) {
	debugState.info[key] = value
}

export function recordAssetStage(stage: string, result?: string) {
	debugState.lastAssetStage = stage
	if (result !== undefined) debugState.lastAssetResult = result
}
