import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { PhotoPicker } from './PhotoPicker'

const DATA_URL = 'data:image/jpeg;base64,/9j/4AAQSkZJRg=='

/**
 * The contract both call sites rely on: the create form (value held in memory) and the detail
 * page (value written straight through to storage).
 *
 * Actually selecting a file is not covered — compressImage needs createImageBitmap and
 * canvas.toDataURL, neither of which jsdom implements.
 */
describe('PhotoPicker', () => {
  it('invites a photo when there is none', () => {
    render(<PhotoPicker value={null} onChange={vi.fn()} />)

    expect(screen.getByRole('button', { name: /Add photo/ })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Remove' })).not.toBeInTheDocument()
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
  })

  it('shows a custom empty hint', () => {
    render(<PhotoPicker value={null} onChange={vi.fn()} emptyHint="No photo yet" />)
    expect(screen.getByText('No photo yet')).toBeInTheDocument()
  })

  it('previews an existing photo and offers to replace or remove it', () => {
    render(<PhotoPicker value={DATA_URL} onChange={vi.fn()} />)

    expect(screen.getByRole('img')).toHaveAttribute('src', DATA_URL)
    expect(screen.getByRole('button', { name: /Replace photo/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Remove' })).toBeInTheDocument()
  })

  it('clears the photo through onChange rather than mutating anything itself', async () => {
    const onChange = vi.fn()
    render(<PhotoPicker value={DATA_URL} onChange={onChange} />)

    await userEvent.click(screen.getByRole('button', { name: 'Remove' }))
    expect(onChange).toHaveBeenCalledWith(null)
  })

  it('surfaces a rejected onChange inline instead of throwing', async () => {
    const onChange = vi.fn().mockRejectedValue(new Error('Browser storage is full.'))
    render(<PhotoPicker value={DATA_URL} onChange={onChange} />)

    await userEvent.click(screen.getByRole('button', { name: 'Remove' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Browser storage is full.')
  })

  it('disables its controls while the form is saving', () => {
    render(<PhotoPicker value={DATA_URL} onChange={vi.fn()} disabled />)

    expect(screen.getByRole('button', { name: /Replace photo/ })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Remove' })).toBeDisabled()
  })
})
