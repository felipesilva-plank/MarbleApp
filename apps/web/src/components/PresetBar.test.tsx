import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { FilterPreset } from '@marble/core'
import { PresetBar } from './PresetBar'

function preset(overrides: Partial<FilterPreset> = {}): FilterPreset {
  return {
    id: 'p1',
    orgId: 'org_local',
    name: 'Thick offcuts',
    slug: 'thick-offcuts',
    query: 'kind=remnant&t=30',
    createdAt: '2026-08-14T09:00:00.000Z',
    ...overrides,
  }
}

const noop = () => undefined
const baseProps = {
  currentQuery: '',
  materialName: () => undefined,
  onApply: noop,
  onSave: noop,
  onDelete: noop,
}

describe('PresetBar', () => {
  it('renders nothing when there is nothing to save and nothing saved', () => {
    const { container } = render(<PresetBar {...baseProps} presets={[]} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('offers to save once a real filter is set', () => {
    render(<PresetBar {...baseProps} presets={[]} currentQuery="kind=slab" />)
    expect(screen.getByRole('button', { name: /save this filter/i })).toBeEnabled()
  })

  it('does not treat a view switch as a filter worth saving', () => {
    // The bar is visible because a preset exists; the save control is the part that must be off.
    render(<PresetBar {...baseProps} presets={[preset()]} currentQuery="view=grid" />)
    expect(screen.getByRole('button', { name: /save this filter/i })).toBeDisabled()
  })

  it('stays hidden on an unfiltered list with no presets, rather than showing a dead toolbar', () => {
    const { container } = render(<PresetBar {...baseProps} presets={[]} currentQuery="view=grid" />)
    expect(container).toBeEmptyDOMElement()
  })

  it('marks the chip matching the current filter as pressed, ignoring param order', () => {
    render(<PresetBar {...baseProps} presets={[preset()]} currentQuery="t=30&kind=remnant&view=grid" />)
    expect(screen.getByRole('button', { name: 'Thick offcuts' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
  })

  it('leaves the chip unpressed for a different filter', () => {
    render(<PresetBar {...baseProps} presets={[preset()]} currentQuery="kind=block" />)
    expect(screen.getByRole('button', { name: 'Thick offcuts' })).toHaveAttribute(
      'aria-pressed',
      'false',
    )
  })

  it('describes what a preset filters in its tooltip', () => {
    render(<PresetBar {...baseProps} presets={[preset()]} />)
    expect(screen.getByRole('button', { name: 'Thick offcuts' })).toHaveAttribute(
      'title',
      'Remnant · 30 mm thick',
    )
  })

  it('applies a preset when its chip is clicked', async () => {
    const onApply = vi.fn()
    render(<PresetBar {...baseProps} presets={[preset()]} onApply={onApply} />)
    await userEvent.click(screen.getByRole('button', { name: 'Thick offcuts' }))
    expect(onApply).toHaveBeenCalledWith(expect.objectContaining({ id: 'p1' }))
  })

  it('saves on Enter with the typed name', async () => {
    const onSave = vi.fn()
    render(<PresetBar {...baseProps} presets={[]} currentQuery="kind=slab" onSave={onSave} />)

    await userEvent.click(screen.getByRole('button', { name: /save this filter/i }))
    await userEvent.type(screen.getByLabelText('Preset name'), 'Big slabs{Enter}')

    expect(onSave).toHaveBeenCalledWith('Big slabs')
  })

  it('does not save a whitespace-only name', async () => {
    const onSave = vi.fn()
    render(<PresetBar {...baseProps} presets={[]} currentQuery="kind=slab" onSave={onSave} />)

    await userEvent.click(screen.getByRole('button', { name: /save this filter/i }))
    await userEvent.type(screen.getByLabelText('Preset name'), '   ')

    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
    expect(onSave).not.toHaveBeenCalled()
  })

  it('deletes through the chip dismiss control', async () => {
    const onDelete = vi.fn()
    render(<PresetBar {...baseProps} presets={[preset()]} onDelete={onDelete} />)
    await userEvent.click(screen.getByRole('button', { name: /delete preset thick offcuts/i }))
    expect(onDelete).toHaveBeenCalledWith(expect.objectContaining({ id: 'p1' }))
  })

  it('surfaces a save error', () => {
    render(
      <PresetBar
        {...baseProps}
        presets={[preset()]}
        error='A preset called "Thick offcuts" already exists.'
      />,
    )
    expect(screen.getByText(/already exists/)).toBeInTheDocument()
  })
})
