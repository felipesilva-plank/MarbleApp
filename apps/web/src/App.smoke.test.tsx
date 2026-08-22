import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import type { Piece } from '@marble/core'
import { renderApp } from './test/renderApp'
import { signInFake, startFakeApi, stopFakeApi } from './test/fakeApi'

/**
 * Render smoke tests: every route mounts against a seeded inventory without throwing.
 *
 * These catch the class of bug that typecheck and `vite build` cannot — a component that only
 * explodes once React actually renders it (bad hook order, undefined access, a missing provider).
 *
 * The data comes over `fetch` from `test/fakeApi`, so the real HTTP adapter runs underneath every
 * one of these. What the server owns — constraints, transactions, one shop not seeing another's
 * stone — is asserted in `apps/api` against a real Postgres instead.
 */

let pieces: Piece[]

beforeEach(() => {
  pieces = startFakeApi().pieces
})

afterEach(() => {
  stopFakeApi()
})

const byCode = (code: string) => pieces.find((p) => p.code === code) as Piece

describe('authentication gate', () => {
  it('sends a signed-out visitor to the login screen', async () => {
    renderApp('/pieces')
    expect(await screen.findByText('Sign in to MarbleApp')).toBeInTheDocument()
  })

  it('shows the registration screen', async () => {
    renderApp('/register')
    expect(await screen.findByText('Create your account')).toBeInTheDocument()
  })
})

describe('signed-in routes', () => {
  beforeEach(() => signInFake())

  it('renders the dashboard with real counts', async () => {
    renderApp('/')

    expect(await screen.findByRole('heading', { name: 'Dashboard' })).toBeInTheDocument()

    // The tile, not just the label: `findAllByText` because every piece in the fixture is in
    // stock, so the total and the in-stock count are the same number in two tiles.
    const tile = (await screen.findByText('Pieces tracked')).closest('div') as HTMLElement
    expect(tile).toHaveTextContent(String(pieces.length))
    expect(await screen.findByText('Returned pieces')).toBeInTheDocument()
  })

  it('nudges about pieces missing their source', async () => {
    renderApp('/')
    expect(await screen.findByText('Missing their source')).toBeInTheDocument()
    // The two parentless remnants. The two slabs are parentless too, but they were bought —
    // they never lost an origin.
    expect(await screen.findByText('See all 2')).toBeInTheDocument()
  })

  it('renders the piece list', async () => {
    renderApp('/pieces')
    expect(await screen.findByRole('heading', { name: 'Pieces' })).toBeInTheDocument()
    expect(await screen.findByText('SLB-0001')).toBeInTheDocument()
    expect(await screen.findByText('RMN-0001')).toBeInTheDocument()
  })

  it('renders the create form', async () => {
    renderApp('/pieces/new')
    expect(await screen.findByRole('heading', { name: 'Add a piece' })).toBeInTheDocument()
    expect(await screen.findByLabelText('Length (mm)')).toBeInTheDocument()
  })

  it('offers a photo control while creating a piece', async () => {
    renderApp('/pieces/new')
    expect(await screen.findByText('Photo')).toBeInTheDocument()
    expect(await screen.findByRole('button', { name: /Add photo/ })).toBeInTheDocument()
  })

  it('offers the photo control when cutting from a parent too', async () => {
    const slab = byCode('SLB-0001')
    renderApp(`/pieces/new?parentId=${slab.id}`)
    expect(await screen.findByRole('button', { name: /Add photo/ })).toBeInTheDocument()
  })

  it('does not show the photo control on the edit form', async () => {
    // Photos on an existing piece are managed from its detail page, which writes through
    // immediately rather than waiting for a save.
    const remnant = byCode('RMN-0001')
    renderApp(`/pieces/${remnant.id}/edit`)
    await screen.findByRole('heading', { name: 'Edit RMN-0001' })
    expect(screen.queryByRole('button', { name: /Add photo/ })).not.toBeInTheDocument()
  })

  it('prefills the source when cutting from a piece', async () => {
    const slab = byCode('SLB-0001')
    renderApp(`/pieces/new?parentId=${slab.id}`)

    expect(
      await screen.findByRole('heading', { name: `Cut a piece from ${slab.code}` }),
    ).toBeInTheDocument()
  })

  it('shows the full provenance chain on a re-cut remnant', async () => {
    // RMN-0003 was cut from RMN-0001, which came off SLB-0001 — two levels deep.
    const recut = byCode('RMN-0003')
    renderApp(`/pieces/${recut.id}`)

    const breadcrumb = await screen.findByLabelText('Provenance')
    // This is the original problem solved: the remnant knows every piece above it.
    expect(breadcrumb).toHaveTextContent('SLB-0001')
    expect(breadcrumb).toHaveTextContent('RMN-0001')
    expect(breadcrumb).toHaveTextContent('RMN-0003')
  })

  it('marks a piece that came back from a job', async () => {
    const returned = byCode('RMN-0004')
    renderApp(`/pieces/${returned.id}`)
    expect(await screen.findByText('Returned piece')).toBeInTheDocument()
  })

  it('says so plainly when a piece has no recorded source', async () => {
    const orphan = byCode('RMN-0005')
    renderApp(`/pieces/${orphan.id}`)

    expect(await screen.findByText(/No source recorded/)).toBeInTheDocument()
    expect(await screen.findByRole('button', { name: 'Link to its source' })).toBeInTheDocument()
  })

  it('lists what was cut from a slab, with the advisory consumption figure', async () => {
    const slab = byCode('SLB-0001')
    renderApp(`/pieces/${slab.id}`)

    expect(await screen.findByText('Cut from this piece')).toBeInTheDocument()
    expect(await screen.findByText(/account for/)).toBeInTheDocument()
    expect(await screen.findByText(/never changes the status/)).toBeInTheDocument()
  })

  it('renders the family tree', async () => {
    const remnant = byCode('RMN-0001')
    renderApp(`/pieces/${remnant.id}/tree`)

    expect(await screen.findByRole('heading', { name: 'Family tree' })).toBeInTheDocument()
    expect(await screen.findByText('you are here')).toBeInTheDocument()
  })

  it('renders the edit form', async () => {
    const remnant = byCode('RMN-0001')
    renderApp(`/pieces/${remnant.id}/edit`)
    expect(await screen.findByRole('heading', { name: 'Edit RMN-0001' })).toBeInTheDocument()
  })

  it('renders the materials screen', async () => {
    renderApp('/materials')
    expect(await screen.findByRole('heading', { name: 'Materials' })).toBeInTheDocument()
    expect(await screen.findByText('Carrara White')).toBeInTheDocument()
  })

  it('renders settings, naming the shop the data belongs to', async () => {
    renderApp('/settings')
    expect(await screen.findByRole('heading', { name: 'Settings' })).toBeInTheDocument()
    expect(await screen.findByText('Pedra Viva Stoneworks')).toBeInTheDocument()
    expect(await screen.findByRole('button', { name: /Export backup/ })).toBeInTheDocument()
  })

  it('handles a piece id that does not exist', async () => {
    renderApp('/pieces/does-not-exist')
    await waitFor(() => {
      expect(screen.getByText('Piece not found')).toBeInTheDocument()
    })
  })
})
