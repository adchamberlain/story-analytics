import { useEffect } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuthStore } from '../stores/authStore'

export function AuthGate({ children }: { children: React.ReactNode }) {
  const { user, authEnabled, loading, checkStatus } = useAuthStore()

  useEffect(() => {
    checkStatus()
  }, [checkStatus])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="animate-spin h-8 w-8 border-4 border-blue-500 border-t-transparent rounded-full" />
      </div>
    )
  }

  if (authEnabled && !user) {
    return <Navigate to="/login" replace />
  }

  return <>{children}</>
}
