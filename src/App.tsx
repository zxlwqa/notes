import { Routes, Route, Navigate } from 'react-router-dom'
import { Suspense, lazy } from 'react'
import { AuthProvider } from '@/contexts/Context'
import ProtectedRoute from '@/components/Protected'
import ErrorBoundary from '@/components/Boundary'
import { PageLoading } from '@/components/ui'

import LoginPage from '@/pages/Login'

const ListPage = lazy(() => import('@/pages/List'))
const ViewPage = lazy(() => import('@/pages/View'))
const EditPage = lazy(() => import('@/pages/Edit'))

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
                  <ListPage />
                </Suspense>
              </ProtectedRoute>
            }
          />
          <Route
            path="/notes/:id"
            element={
              <ProtectedRoute>
                <Suspense fallback={<PageLoading />}>
                  <ViewPage />
                </Suspense>
              </ProtectedRoute>
            }
          />
          <Route
            path="/notes/:id/edit"
            element={
              <ProtectedRoute>
                <Suspense fallback={<PageLoading />}>
                  <EditPage />
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