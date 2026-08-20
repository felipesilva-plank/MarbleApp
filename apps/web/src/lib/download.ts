/**
 * Browser file download. Kept out of the routes so the object URL is always revoked - a leaked
 * blob URL pins its bytes for the lifetime of the tab, and this app already lives in a tab that
 * stays open for days.
 */
export function downloadText(filename: string, contents: string, mime: string): void {
  const blob = new Blob([contents], { type: mime })
  const url = URL.createObjectURL(blob)
  try {
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = filename
    anchor.click()
  } finally {
    URL.revokeObjectURL(url)
  }
}
