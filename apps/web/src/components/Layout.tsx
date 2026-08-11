import { NavLink, Outlet, Link } from 'react-router'
import { useAuth } from '../auth/AuthContext'
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
          Demo build — all data is stored in this browser only.
        </p>
      </footer>
    </div>
  )
}
