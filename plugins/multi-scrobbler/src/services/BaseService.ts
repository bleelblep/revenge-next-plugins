import Constants from "../constants"
import { incrementApiCall, recordServiceError } from "../lib/debug"
import { settings } from "../lib/state"
import type { ServiceClient, ServiceType, Track } from "../types"

export abstract class BaseService implements ServiceClient {
	protected retryCount = 0
	protected lastError = 0

	abstract fetchLatestScrobble(): Promise<Track>
	abstract validateCredentials(): Promise<boolean>
	abstract getServiceName(): string
	/** Which settings key this service records errors under. */
	protected abstract serviceKey(): ServiceType

	protected log(...args: any[]) {
		console.log(`[${this.getServiceName()}]`, ...args)
	}

	protected logError(...args: any[]) {
		console.error(`[${this.getServiceName()}] Error:`, ...args)
	}

	protected logVerbose(...args: any[]) {
		if (settings().verboseLogging) console.log(`[${this.getServiceName()}] Verbose:`, ...args)
	}

	protected getErrorMessage(error: any): string {
		if (error?.error && Constants.API_ERROR_CODES[error.error]) {
			return Constants.API_ERROR_CODES[error.error]
		}
		return error?.message || String(error) || "Unknown error"
	}

	protected async handleError(error: any): Promise<never> {
		this.lastError = error?.error || 0
		const message = this.getErrorMessage(error)
		this.logError(message)
		recordServiceError(this.serviceKey(), message)
		throw new Error(`${this.getServiceName()} API Error: ${message}`)
	}

	/**
	 * The original randomised a desktop browser User-Agent per request. Dropped deliberately: it
	 * does nothing for rate limiting, and sending a fake desktop UA from a mobile client is the
	 * kind of thing that gets an API key suspended. Requests go out with the platform default.
	 */
	protected async makeRequest(url: string, options: RequestInit = {}): Promise<any> {
		try {
			this.logVerbose(`Requesting ${url}`)
			incrementApiCall()

			const response = await fetch(url, options)
			if (!response.ok) {
				const error = new Error(`HTTP ${response.status}: ${response.statusText}`)
				recordServiceError(this.serviceKey(), error.message)
				throw error
			}

			const data = await response.json()
			if (data?.error) await this.handleError(data)

			this.retryCount = 0
			return data
		} catch (error) {
			this.retryCount++
			if (this.retryCount > Constants.MAX_RETRY_ATTEMPTS) {
				this.retryCount = 0
				recordServiceError(this.serviceKey(), `Max retries exceeded: ${(error as Error).message}`)
				throw error
			}

			this.logVerbose(`Request failed, retry ${this.retryCount}/${Constants.MAX_RETRY_ATTEMPTS}`)
			await new Promise(resolve => setTimeout(resolve, Constants.RETRY_DELAY))
			return this.makeRequest(url, options)
		}
	}

	protected isDefaultCover(cover?: string): boolean {
		if (!cover) return true
		return Constants.DEFAULT_COVER_HASHES.some(hash => cover.includes(hash))
	}

	protected processAlbumArt(cover?: string): string | null {
		return !cover || this.isDefaultCover(cover) ? null : cover
	}

	public getLastError(): number {
		return this.lastError
	}

	public resetRetryCount() {
		this.retryCount = 0
	}
}
