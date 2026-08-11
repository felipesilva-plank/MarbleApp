import { useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { backup, errorMessage } from '../data'
import { usePieces } from '../hooks/usePieces'
import { useMaterials } from '../hooks/useMaterials'
import { Alert, Button, Card, Modal, PageHeader, SectionTitle, Spinner } from '../components/ui'

function downloadJson(filename: string, contents: string) {
  const blob = new Blob([contents], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  URL.revokeObjectURL(url)
}

export function Settings() {
  const queryClient = useQueryClient()
  const { data: pieces } = usePieces()
  const { data: materials } = useMaterials()

  const fileRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [pendingImport, setPendingImport] = useState<string | null>(null)

  const photoCount = (pieces ?? []).filter((p) => p.hasPhoto).length

  async function handleExport() {
    setBusy(true)
    setError(null)
    setNotice(null)
    try {
      const json = await backup.exportAll()
      const stamp = new Date().toISOString().slice(0, 10)
      downloadJson(`marbleapp-backup-${stamp}.json`, json)
      setNotice('Backup downloaded.')
    } catch (caught) {
      setError(errorMessage(caught))
    } finally {
      setBusy(false)
    }
  }

  async function handleFileChosen(file: File | undefined) {
    if (!file) return
    setError(null)
    setNotice(null)
    try {
      setPendingImport(await file.text())
    } catch (caught) {
      setError(errorMessage(caught))
    } finally {
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  async function confirmImport() {
    if (!pendingImport) return
    setBusy(true)
    setError(null)
    try {
      await backup.importAll(pendingImport)
      await queryClient.invalidateQueries()
      setNotice('Backup restored.')
      setPendingImport(null)
    } catch (caught) {
      setError(errorMessage(caught))
      setPendingImport(null)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Settings" subtitle="Back up and restore your inventory." />

      {error ? (
        <div className="mb-6">
          <Alert>{error}</Alert>
        </div>
      ) : null}
      {notice ? (
        <div className="mb-6">
          <Alert tone="info">{notice}</Alert>
        </div>
      ) : null}

      <Card className="mb-6 p-5">
        <SectionTitle>This browser holds everything</SectionTitle>
        <p className="text-sm text-stone-600">
          There is no server yet. Your inventory lives in this browser, on this device — clearing
          site data, switching browsers, or using a different computer means starting over. Export
          a backup regularly.
        </p>
        <dl className="mt-4 grid grid-cols-3 gap-4 text-center">
          <div className="rounded-lg bg-stone-100 py-3">
            <dt className="text-xs text-stone-500">Pieces</dt>
            <dd className="text-xl font-semibold text-stone-900">{pieces?.length ?? 0}</dd>
          </div>
          <div className="rounded-lg bg-stone-100 py-3">
            <dt className="text-xs text-stone-500">Materials</dt>
            <dd className="text-xl font-semibold text-stone-900">{materials?.length ?? 0}</dd>
          </div>
          <div className="rounded-lg bg-stone-100 py-3">
            <dt className="text-xs text-stone-500">Photos</dt>
            <dd className="text-xl font-semibold text-stone-900">{photoCount}</dd>
          </div>
        </dl>
      </Card>

      <Card className="mb-6 p-5">
        <SectionTitle>Export</SectionTitle>
        <p className="mb-4 text-sm text-stone-600">
          Downloads every piece, material and photo as a single JSON file. Keep it somewhere safe —
          it is also what will seed the real database once the backend exists.
        </p>
        <Button variant="primary" onClick={() => void handleExport()} disabled={busy}>
          {busy ? <Spinner /> : null}
          Export backup
        </Button>
      </Card>

      <Card className="p-5">
        <SectionTitle>Import</SectionTitle>
        <p className="mb-4 text-sm text-stone-600">
          Restores from a backup file.{' '}
          <span className="font-medium text-stone-800">
            This replaces everything currently stored
          </span>{' '}
          — export first if you are not sure.
        </p>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={(event) => void handleFileChosen(event.target.files?.[0])}
        />
        <Button onClick={() => fileRef.current?.click()} disabled={busy}>
          Choose a backup file…
        </Button>
      </Card>

      <Modal
        open={pendingImport !== null}
        onClose={() => setPendingImport(null)}
        title="Replace everything with this backup?"
        footer={
          <>
            <Button onClick={() => setPendingImport(null)} disabled={busy}>
              Cancel
            </Button>
            <Button variant="danger" onClick={() => void confirmImport()} disabled={busy}>
              {busy ? <Spinner /> : null}
              Replace and restore
            </Button>
          </>
        }
      >
        <p>
          Your current {pieces?.length ?? 0} piece{(pieces?.length ?? 0) === 1 ? '' : 's'} and{' '}
          {materials?.length ?? 0} material{(materials?.length ?? 0) === 1 ? '' : 's'} will be
          discarded and replaced by the contents of this file. This cannot be undone.
        </p>
      </Modal>
    </div>
  )
}
