import { useMemo } from 'react'
import { Link } from 'react-router'
import {
  IN_STOCK_STATUSES,
  formatArea,
  formatDimensions,
  isUnlinked,
  totalAreaM2,
} from '@marble/core'
import type { Piece } from '@marble/core'
import { usePieces } from '../hooks/usePieces'
import { useMaterials } from '../hooks/useMaterials'
import { formatRelative } from '../lib/format'
import { KindBadge, OrphanBadge, StatusBadge } from '../components/badges'
import { PieceThumb } from '../components/PieceThumb'
import { Button, Card, EmptyState, Loading, PageHeader, SectionTitle } from '../components/ui'

function Stat({
  label,
  value,
  sub,
  to,
}: {
  label: string
  value: string
  sub?: string
  to?: string
}) {
  const body = (
    <Card className="h-full p-4 transition hover:border-stone-300">
      <p className="text-xs font-medium tracking-wide text-stone-500 uppercase">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-stone-900">{value}</p>
      {sub ? <p className="mt-1 text-xs text-stone-500">{sub}</p> : null}
    </Card>
  )
  return to ? (
    <Link to={to} className="block">
      {body}
    </Link>
  ) : (
    body
  )
}

export function Dashboard() {
  const { data: pieces, isLoading } = usePieces()
  const { data: materials } = useMaterials()

  const stats = useMemo(() => {
    const all: Piece[] = pieces ?? []
    const inStock = all.filter((p) => IN_STOCK_STATUSES.includes(p.status))
    const availableRemnants = all.filter((p) => p.kind === 'remnant' && p.status === 'available')
    const unlinked = all.filter(isUnlinked)

    return {
      total: all.length,
      inStock: inStock.length,
      availableRemnants,
      remnantArea: totalAreaM2(availableRemnants),
      unlinked,
      recent: [...all]
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .slice(0, 6),
    }
  }, [pieces])

  if (isLoading) return <Loading />

  return (
    <div>
      <PageHeader
        title="Dashboard"
        subtitle="Your yard at a glance."
        actions={
          <Link to="/pieces/new">
            <Button variant="primary">Add a piece</Button>
          </Link>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Pieces tracked" value={String(stats.total)} to="/pieces" />
        <Stat label="In stock" value={String(stats.inStock)} sub="Available, reserved or partly used" />
        <Stat
          label="Available remnants"
          value={String(stats.availableRemnants.length)}
          sub={`${formatArea(stats.remnantArea)} of usable stone`}
          to="/pieces?kind=remnant&status=available"
        />
        <Stat
          label="Materials"
          value={String(materials?.length ?? 0)}
          to="/materials"
        />
      </div>

      {stats.unlinked.length > 0 ? (
        <section className="mt-10">
          <SectionTitle
            action={
              <Link
                to="/pieces?unlinked=1"
                className="text-sm font-medium text-stone-700 underline underline-offset-2 hover:text-stone-900"
              >
                See all {stats.unlinked.length}
              </Link>
            }
          >
            Missing their source
          </SectionTitle>
          <Card className="divide-y divide-stone-100">
            <div className="px-4 py-3 text-sm text-stone-600">
              These pieces are on the rack but nothing records where they were cut from. Open one
              and link it to its source to close the gap.
            </div>
            {stats.unlinked.slice(0, 4).map((piece) => (
              <Link
                key={piece.id}
                to={`/pieces/${piece.id}`}
                className="flex items-center gap-3 px-4 py-3 transition hover:bg-stone-50"
              >
                <PieceThumb piece={piece} size="sm" />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-stone-900">{piece.code}</span>
                    <KindBadge kind={piece.kind} />
                    <OrphanBadge />
                  </div>
                  <p className="mt-0.5 truncate text-xs text-stone-500">
                    {formatDimensions(piece)}
                    {piece.location ? ` · ${piece.location}` : ''}
                  </p>
                </div>
                <span className="text-xs text-stone-400">{formatRelative(piece.createdAt)}</span>
              </Link>
            ))}
          </Card>
        </section>
      ) : null}

      <section className="mt-10">
        <SectionTitle>Recently added</SectionTitle>
        {stats.recent.length === 0 ? (
          <EmptyState
            title="Nothing tracked yet"
            description="Add your first block or slab and start recording where each cut piece comes from."
            action={
              <Link to="/pieces/new">
                <Button variant="primary">Add a piece</Button>
              </Link>
            }
          />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {stats.recent.map((piece) => (
              <Link key={piece.id} to={`/pieces/${piece.id}`}>
                <Card className="flex h-full items-center gap-3 p-3 transition hover:border-stone-300">
                  <PieceThumb piece={piece} size="md" />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="font-medium text-stone-900">{piece.code}</span>
                      <KindBadge kind={piece.kind} />
                    </div>
                    <p className="mt-1 truncate text-xs text-stone-500">
                      {formatDimensions(piece)}
                    </p>
                    <div className="mt-1.5">
                      <StatusBadge status={piece.status} />
                    </div>
                  </div>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
