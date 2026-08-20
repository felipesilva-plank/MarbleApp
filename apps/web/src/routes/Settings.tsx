import { useEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { backup, errorMessage } from '../data'
import { usePieces } from '../hooks/usePieces'
import { useMaterials } from '../hooks/useMaterials'
import { capture } from '../lib/analytics'
import { StorageMeter } from '../components/StorageMeter'
import { buildInfo } from '../lib/buildInfo'
import { formatDate } from '../lib/format'
import { storageUsage } from '../lib/storage'
import type { StorageUsage } from '../lib/storage'
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
  const [usage, setUsage] = useState<StorageUsage | null>(null)

  const photoCount = (pieces ?? []).filter((p) => p.hasPhoto).length
  const build = buildInfo()

  // Re-measure whenever the inventory changes: an import is exactly when someone wants to know
  // whether they just filled the browser up.
  useEffect(() => {
    let cancelled = false
    void storageUsage().then((next) => {
      if (!cancelled) setUsage(next)
    })
    return () => {
      cancelled = true
    }
  }, [pieces, materials])

  async function handleExport() {
    setBusy(true)
    setError(null)
    setNotice(null)
    try {
      const json = await backup.exportAll()
      const stamp = new Date().toISOString().slice(0, 10)
      downloadJson(`marbleapp-backup-${stamp}.json`, json)
      capture('backup_exported', {
        piece_count: pieces?.length ?? 0,
        photo_count: photoCount,
      })
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
      // The count comes from importAll, not from `pieces`: that is captured from the render
      // closure and still holds the PRE-import inventory, so a fresh browser restoring 500 pieces
      // reported 0 - which is exactly the number this event exists to answer.
      const restored = await backup.importAll(pendingImport)
      await queryClient.invalidateQueries()
      capture('backup_imported', { piece_count: restored.pieces })
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
        {usage ? (
          <div className="mt-5 border-t border-stone-200 pt-4">
            <StorageMeter usage={usage} />
          </div>
        ) : null}
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

      <Card className="mt-6 p-5">
        <SectionTitle>Build</SectionTitle>
        <p className="mb-4 text-sm text-stone-600">
          Which build this tab is running. Worth checking before reporting something odd — this app
          keeps its data locally, so tabs stay open across deploys.
        </p>
        <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-[auto_1fr]">
          <dt className="text-stone-500">Version</dt>
          <dd className="font-medium text-stone-900">{build.version}</dd>
          <dt className="text-stone-500">Commit</dt>
          <dd className="font-mono text-stone-900">{build.commit}</dd>
          <dt className="text-stone-500">Built</dt>
          <dd className="text-stone-900">{build.builtAt ? formatDate(build.builtAt) : '—'}</dd>
        </dl>
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
