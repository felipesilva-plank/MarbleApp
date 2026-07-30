import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter } from 'react-router'
import { App } from './App'
import { AuthProvider } from './auth/AuthContext'
import { initData } from './data'
import './index.css'

// Writes the demo inventory on first run. No-op afterwards, and a no-op entirely once data
// lives on a server.
initData()

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Local reads are instant and always fresh, so refetching on focus is pure noise.
      refetchOnWindowFocus: false,
      retry: false,
      staleTime: 0,
    },
  },
})

const container = document.getElementById('root')
if (!container) throw new Error('Root element missing from index.html')

createRoot(container).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthProvider>
          <App />
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
)
