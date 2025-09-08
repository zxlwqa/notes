import { Routes, Route, Navigate } from 'react-router-dom'
import { Suspense, lazy } from 'react'
import { AuthProvider } from '@/contexts/AuthContext'
import ProtectedRoute from '@/components/ProtectedRoute'
import ErrorBoundary from '@/components/ErrorBoundary'
import { PageLoading } from '@/components/ui'

import LoginPage from '@/pages/LoginPage'

const NotesListPage = lazy(() => import('@/pages/NotesListPage'))
const NoteViewPage = lazy(() => import('@/pages/NoteViewPage'))
const NoteEditPage = lazy(() => import('@/pages/NoteEditPage'))

function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <Routes>
          <Route 
            path="/login" 
            element={<LoginPage />} 
          />
          <Route
            path="/notes"
            element={
              <ProtectedRoute>
                <Suspense fallback={<PageLoading />}>
                  <NotesListPage />
                </Suspense>
              </ProtectedRoute>
            }
          />
          <Route
            path="/notes/:id"
            element={
              <ProtectedRoute>
                <Suspense fallback={<PageLoading />}>
                  <NoteViewPage />
                </Suspense>
              </ProtectedRoute>
            }
          />
          <Route
            path="/notes/:id/edit"
            element={
              <ProtectedRoute>
                <Suspense fallback={<PageLoading />}>
                  <NoteEditPage />
                </Suspense>
              </ProtectedRoute>
            }
          />
          <Route path="/" element={<Navigate to="/login" replace />} />
        </Routes>
      </AuthProvider>
    </ErrorBoundary>
  )
}

export default App

