import { useState, useEffect } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useAuthStore } from '../stores/authStore'
import { LogoMark } from '../components/brand/Logo'

/**
 * Login / Register page. Only shown when AUTH_ENABLED=true.
 */
export function LoginPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const inviteToken = searchParams.get('invite')
  const { login, register, user, checkStatus } = useAuthStore()

  // Redirect to home if already logged in
  useEffect(() => {
    checkStatus()
  }, [checkStatus])

  useEffect(() => {
    if (user) navigate('/', { replace: true })
  }, [user, navigate])

  const [mode, setMode] = useState<'login' | 'register'>(inviteToken ? 'register' : 'login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setSubmitting(true)

    try {
      if (mode === 'login') {
        await login(email, password)
      } else {
        await register(email, password, displayName || undefined, inviteToken || undefined)
      }
      navigate('/')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setSubmitting(false)
    }
  }

  const inputClass =
    'w-full px-4 py-3.5 text-[15px] rounded-xl bg-surface-input border border-border-strong text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500 transition-all'

  return (
    <div className="min-h-screen bg-surface-secondary flex items-center justify-center px-6">
      <div className="w-full max-w-[440px]">
        {/* Logo / Title */}
        <div className="text-center mb-12">
          <LogoMark className="h-10 w-10 text-blue-500 mx-auto mb-4" />
          <h1 className="text-3xl font-bold text-text-primary tracking-tight">Story Analytics</h1>
          <p className="text-base text-text-secondary mt-3">
            {mode === 'login' ? 'Sign in to your account' : 'Create a new account'}
          </p>
        </div>

        {/* Form Card */}
        <div className="bg-surface rounded-2xl shadow-lg border border-border-default px-10 pt-10 pb-8">
          {inviteToken && mode === 'register' && (
            <div className="mb-6 px-4 py-3.5 rounded-xl bg-blue-500/10 border border-blue-500/30 text-sm text-blue-400">
              You've been invited to join. Create your account below.
            </div>
          )}
          {error && (
            <div className="mb-8 px-4 py-3.5 rounded-xl bg-red-500/10 border border-red-500/30 text-sm text-red-400">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-6">
            {mode === 'register' && (
              <div>
                <label className="text-sm font-medium text-text-secondary block mb-2.5">Display Name</label>
                <input
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="Optional"
                  className={inputClass}
                />
              </div>
            )}

            <div>
              <label className="text-sm font-medium text-text-secondary block mb-2.5">Email</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className={inputClass}
              />
            </div>

            <div>
              <label className="text-sm font-medium text-text-secondary block mb-2.5">Password</label>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter password"
                minLength={6}
                className={inputClass}
              />
            </div>

            {mode === 'login' && (
              <div className="text-right -mt-2">
                <Link
                  to="/forgot-password"
                  className="text-sm text-text-muted hover:text-blue-400 transition-colors"
                >
                  Forgot password?
                </Link>
              </div>
            )}

            <div className="pt-2">
              <button
                type="submit"
                disabled={submitting}
                className="w-full py-3.5 px-4 text-[15px] font-semibold rounded-xl bg-blue-600 text-white hover:bg-blue-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {submitting
                  ? (mode === 'login' ? 'Signing in...' : 'Creating account...')
                  : (mode === 'login' ? 'Sign In' : 'Create Account')}
              </button>
            </div>
          </form>

          {/* Toggle mode */}
          <div className="mt-8 pt-6 border-t border-border-default text-center">
            <button
              onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError(null) }}
              className="text-sm text-blue-400 hover:text-blue-300 transition-colors"
            >
              {mode === 'login' ? "Don't have an account? Register" : 'Already have an account? Sign in'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
