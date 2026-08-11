import { Navigate, Route, Routes } from 'react-router'
import { Layout } from './components/Layout'
import { ProtectedRoute } from './components/ProtectedRoute'
import { Dashboard } from './routes/Dashboard'
import { Login } from './routes/Login'
import { Materials } from './routes/Materials'
import { PieceDetail } from './routes/PieceDetail'
import { PieceEdit } from './routes/PieceEdit'
import { PieceList } from './routes/PieceList'
import { PieceNew } from './routes/PieceNew'
import { PieceTree } from './routes/PieceTree'
import { Register } from './routes/Register'
import { Settings } from './routes/Settings'

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />

      <Route
        element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route path="/" element={<Dashboard />} />
        <Route path="/pieces" element={<PieceList />} />
        <Route path="/pieces/new" element={<PieceNew />} />
        <Route path="/pieces/:id" element={<PieceDetail />} />
        <Route path="/pieces/:id/edit" element={<PieceEdit />} />
        <Route path="/pieces/:id/tree" element={<PieceTree />} />
        <Route path="/materials" element={<Materials />} />
        <Route path="/settings" element={<Settings />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
