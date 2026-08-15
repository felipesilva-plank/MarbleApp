import { useMemo, useState } from 'react'
import { NavLink, Outlet, Link, useNavigate } from 'react-router'
import { useAuth } from '../auth/AuthContext'
import { useKeyboardShortcuts } from '../hooks/useKeyboardShortcuts'
import type { Shortcut } from '../hooks/useKeyboardShortcuts'
import { ShortcutSheet } from './ShortcutSheet'
import { Button, cx } from './ui'

const NAV = [
  { to: '/', label: 'Dashboard', end: true },
  { to: '/pieces', label: 'Pieces', end: false },
  { to: '/materials', label: 'Materials', end: false },
  { to: '/settings', label: 'Settings', end: false },
]

function Logo() {
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6 text-stone-900" aria-hidden="true">
      <rect x="2" y="3" width="20" height="18" rx="3" fill="currentColor" opacity="0.12" />
      <rect x="2" y="3" width="20" height="18" rx="3" stroke="currentColor" strokeWidth="1.5" fill="none" />
      <path
        d="M4 15c3-1.5 4.5-6 7-6s3.5 4 5 4 2.5-1.5 4-2.5"
        stroke="currentColor"
        strokeWidth="1.5"
        fill="none"
        strokeLinecap="round"
      />
    </svg>
  )
}

export function Layout() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const [sheetOpen, setSheetOpen] = useState(false)

  const shortcuts = useMemo<Shortcut[]>(
    () => [
      {
        key: '/',
        label: 'Search pieces',
        run: () => {
          // Already on the list: focus the field rather than remounting the route and losing the
          // filter the user has set up.
          const field = document.querySelector<HTMLInputElement>('input[type="search"]')
          if (field) field.focus()
          else navigate('/pieces')
        },
      },
      { key: 'n', label: 'Add a piece', run: () => navigate('/pieces/new') },
      { key: 'p', label: 'Go to pieces', run: () => navigate('/pieces') },
      { key: 'd', label: 'Go to dashboard', run: () => navigate('/') },
      { key: 'm', label: 'Go to materials', run: () => navigate('/materials') },
      { key: '?', label: 'Show this list', run: () => setSheetOpen(true) },
    ],
    [navigate],
  )

  useKeyboardShortcuts(shortcuts)

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-40 border-b border-stone-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
          <Link to="/" className="flex shrink-0 items-center gap-2">
            <Logo />
            <span className="text-base font-semibold tracking-tight text-stone-900">MarbleApp</span>
          </Link>

          <nav className="flex flex-1 flex-wrap items-center gap-1">
            {NAV.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  cx(
                    'rounded-lg px-3 py-1.5 text-sm font-medium transition',
                    isActive
                      ? 'bg-stone-900 text-white'
                      : 'text-stone-600 hover:bg-stone-200/70 hover:text-stone-900',
                  )
                }
              >
                {item.label}
              </NavLink>
            ))}
          </nav>

          <div className="flex items-center gap-3">
            <span className="hidden text-sm text-stone-500 sm:inline" title={user?.email}>
              {user?.name}
            </span>
            <Button size="sm" variant="ghost" onClick={() => void logout()}>
              Sign out
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-8">
        <Outlet />
      </main>

      <footer className="mx-auto max-w-6xl px-4 pb-10">
        <p className="text-xs text-stone-400">
          Demo build — all data is stored in this browser only. Press{' '}
          <kbd className="rounded border border-stone-300 px-1 font-mono">?</kbd> for shortcuts.
        </p>
      </footer>

      <ShortcutSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        shortcuts={shortcuts}
      />
    </div>
  )
}
