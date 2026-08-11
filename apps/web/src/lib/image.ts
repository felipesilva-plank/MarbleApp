/**
 * Photos come off phone cameras at 3-8 MB. Storing that verbatim would blow through the browser's
 * storage budget within a few pieces, so everything is downscaled and re-encoded before it is
 * persisted. ~1600 px on the long edge is plenty to judge veining and colour on screen.
 */

const MAX_EDGE = 1600
const QUALITY = 0.75

export async function compressImage(file: File): Promise<string> {
  if (!file.type.startsWith('image/')) {
    throw new Error('That file is not an image.')
  }

  const bitmap = await createImageBitmap(file)
  try {
    const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height))
    const width = Math.max(1, Math.round(bitmap.width * scale))
    const height = Math.max(1, Math.round(bitmap.height * scale))

    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height

    const context = canvas.getContext('2d')
    if (!context) throw new Error('Could not process the image in this browser.')

    context.drawImage(bitmap, 0, 0, width, height)
    return canvas.toDataURL('image/jpeg', QUALITY)
  } finally {
    bitmap.close()
  }
}

export function approximateDataUrlBytes(dataUrl: string): number {
  const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1)
  return Math.round((base64.length * 3) / 4)
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
