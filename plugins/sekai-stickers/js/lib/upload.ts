/**
 * Putting the rendered PNG into the message box as an attachment, the way picking a photo does.
 * The work is in shared/upload.ts, which Pocket Browser also uses; see the note there.
 */

import { attachImage, watchUploads } from '../../../../shared/upload'
import type { Rendered } from './native'

export const patchUpload = () => watchUploads('[Sekai Stickers]')

/** Queues [rendered] as an attachment in [channelId]'s message box. Throws if it can't. */
export const attach = (rendered: Rendered, channelId: string) => attachImage({ ...rendered, mime: 'image/png' }, channelId)
