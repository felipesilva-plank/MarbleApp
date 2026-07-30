import { beforeEach, describe, expect, it } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import type { Piece } from '@marble/core'
import { initData } from './data'
import { localAuthPort } from './data/local/authRepo'
import { localPieceRepository } from './data/local/pieceRepo'
import { clearPhotos } from './data/local/photos'
import { renderApp } from './test/renderApp'

/**
 * Render smoke tests: every route mounts against real seeded data without throwing.
 *
 * These catch the class of bug that typecheck and `vite build` cannot — a component that only
 * explodes once React actually renders it (bad hook order, undefined access, a missing provider).
 */

async function signIn() {
  await localAuthPort.register({
    name: 'Ana Souza',
    email: 'ana@yard.example',
    password: 'stone12345',
  })
}

let pieces: Piece[]

beforeEach(async () => {
  localStorage.clear()
  await clearPhotos()
  initData() // writes the demo block → slab → remnant inventory
  pieces = await localPieceRepository.list()
})

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
  beforeEach(signIn)

  it('renders the dashboard with real counts', async () => {
    renderApp('/')

    expect(await screen.findByRole('heading', { name: 'Dashboard' })).toBeInTheDocument()
    expect(await screen.findByText('Pieces tracked')).toBeInTheDocument()
    expect(await screen.findByText(String(pieces.length))).toBeInTheDocument()
  })

  it('nudges about pieces missing their source', async () => {
    renderApp('/')
    expect(await screen.findByText('Missing their source')).toBeInTheDocument()
    // The two seeded orphan remnants — blocks are not counted, they come from a quarry.
    expect(await screen.findByText('See all 2')).toBeInTheDocument()
  })

  it('renders the piece list', async () => {
    renderApp('/pieces')
    expect(await screen.findByRole('heading', { name: 'Pieces' })).toBeInTheDocument()
    expect(await screen.findByText('BLK-0001')).toBeInTheDocument()
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
    const slab = pieces.find((p) => p.code === 'SLB-0001') as Piece
    renderApp(`/pieces/new?parentId=${slab.id}`)
    expect(await screen.findByRole('button', { name: /Add photo/ })).toBeInTheDocument()
  })

  it('does not show the photo control on the edit form', async () => {
    // Photos on an existing piece are managed from its detail page, which writes through
    // immediately rather than waiting for a save.
    const remnant = pieces.find((p) => p.code === 'RMN-0001') as Piece
    renderApp(`/pieces/${remnant.id}/edit`)
    await screen.findByRole('heading', { name: 'Edit RMN-0001' })
    expect(screen.queryByRole('button', { name: /Add photo/ })).not.toBeInTheDocument()
  })

  it('prefills the source when cutting from a piece', async () => {
    const slab = pieces.find((p) => p.code === 'SLB-0001') as Piece
    renderApp(`/pieces/new?parentId=${slab.id}`)

    expect(
      await screen.findByRole('heading', { name: `Cut a piece from ${slab.code}` }),
    ).toBeInTheDocument()
  })

  it('shows the full provenance chain on a remnant', async () => {
    const remnant = pieces.find((p) => p.code === 'RMN-0001') as Piece
    renderApp(`/pieces/${remnant.id}`)

    const breadcrumb = await screen.findByLabelText('Provenance')
    // This is the original problem solved: the remnant knows its slab and its block.
    expect(breadcrumb).toHaveTextContent('BLK-0001')
    expect(breadcrumb).toHaveTextContent('SLB-0001')
    expect(breadcrumb).toHaveTextContent('RMN-0001')
  })

  it('says so plainly when a piece has no recorded source', async () => {
    const orphan = pieces.find((p) => p.code === 'RMN-0006') as Piece
    renderApp(`/pieces/${orphan.id}`)

    expect(await screen.findByText(/No source recorded/)).toBeInTheDocument()
    expect(await screen.findByRole('button', { name: 'Link to its source' })).toBeInTheDocument()
  })

  it('lists what was cut from a slab, with the advisory consumption figure', async () => {
    const slab = pieces.find((p) => p.code === 'SLB-0001') as Piece
    renderApp(`/pieces/${slab.id}`)

    expect(await screen.findByText('Cut from this piece')).toBeInTheDocument()
    expect(await screen.findByText(/account for/)).toBeInTheDocument()
    expect(await screen.findByText(/never changes the status/)).toBeInTheDocument()
  })

  it('renders the family tree', async () => {
    const remnant = pieces.find((p) => p.code === 'RMN-0001') as Piece
    renderApp(`/pieces/${remnant.id}/tree`)

    expect(await screen.findByRole('heading', { name: 'Family tree' })).toBeInTheDocument()
    expect(await screen.findByText('you are here')).toBeInTheDocument()
  })

  it('renders the edit form', async () => {
    const remnant = pieces.find((p) => p.code === 'RMN-0001') as Piece
    renderApp(`/pieces/${remnant.id}/edit`)
    expect(await screen.findByRole('heading', { name: 'Edit RMN-0001' })).toBeInTheDocument()
  })

  it('renders the materials screen', async () => {
    renderApp('/materials')
    expect(await screen.findByRole('heading', { name: 'Materials' })).toBeInTheDocument()
    expect(await screen.findByText('Carrara White')).toBeInTheDocument()
  })

  it('renders settings with storage counts', async () => {
    renderApp('/settings')
    expect(await screen.findByRole('heading', { name: 'Settings' })).toBeInTheDocument()
    expect(await screen.findByRole('button', { name: /Export backup/ })).toBeInTheDocument()
  })

  it('handles a piece id that does not exist', async () => {
    renderApp('/pieces/does-not-exist')
    await waitFor(() => {
      expect(screen.getByText('Piece not found')).toBeInTheDocument()
    })
  })
})
