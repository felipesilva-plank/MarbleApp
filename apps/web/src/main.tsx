import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter } from 'react-router'
import { App } from './App'
import { AuthProvider } from './auth/AuthContext'
import './index.css'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Reads cross the network now. Coming back to a tab is exactly when a rack that someone
      // else has changed should be re-checked, so refetching on focus is worth the request.
      refetchOnWindowFocus: true,
      // A failed write must not be replayed: retrying a create would register the piece twice.
      // Reads are re-run by the query above rather than by a retry policy.
      retry: false,
      // Long enough that clicking through a list and back does not re-request every row.
      staleTime: 30_000,
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
