export interface LiveMarkdownStorage {
	headings: boolean
	dimMarkers: boolean
	monoCode: boolean
}

export const DEFAULTS: LiveMarkdownStorage = {
	headings: true,
	dimMarkers: true,
	monoCode: true,
}

const METHOD = 'bleelblep.live-markdown'

export function callNative(name: string, args: any[] = []): Promise<any> {
	return (revenge.modules.native as any).callNativeMethod(`${METHOD}.${name}`, args)
}
