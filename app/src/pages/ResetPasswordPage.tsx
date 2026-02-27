import { useState } from 'react'
import { Link, useSearchParams, useNavigate } from 'react-router-dom'
import { useAuthStore } from '../stores/authStore'
import { LogoMark } from '../components/brand/Logo'

export function ResetPasswordPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token')
  const { resetPassword } = useAuthStore()

  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (password !== confirmPassword) {
      setError('Passwords do not match')
      return
    }

    setSubmitting(true)
    try {
      await resetPassword(token!, password)
      navigate('/', { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setSubmitting(false)
    }
  }

  const inputClass =
    'w-full px-4 py-3.5 text-[15px] rounded-xl bg-surface-input border border-border-strong text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500 transition-all'

  if (!token) {
    return (
      <div className="min-h-screen bg-surface-secondary flex items-center justify-center px-6">
        <div className="w-full max-w-[440px]">
          <div className="text-center mb-12">
            <LogoMark className="h-10 w-10 text-blue-500 mx-auto mb-4" />
            <h1 className="text-3xl font-bold text-text-primary tracking-tight">Invalid Link</h1>
          </div>
          <div className="bg-surface rounded-2xl shadow-lg border border-border-default px-10 pt-10 pb-8">
            <div className="px-4 py-3.5 rounded-xl bg-red-500/10 border border-red-500/30 text-sm text-red-400 mb-6">
              This reset link is invalid. Please request a new one.
            </div>
            <Link
              to="/forgot-password"
              className="block text-center text-sm text-blue-400 hover:text-blue-300 transition-colors"
            >
              Request a new reset link
            </Link>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-surface-secondary flex items-center justify-center px-6">
      <div className="w-full max-w-[440px]">
        <div className="text-center mb-12">
          <LogoMark className="h-10 w-10 text-blue-500 mx-auto mb-4" />
          <h1 className="text-3xl font-bold text-text-primary tracking-tight">Set New Password</h1>
          <p className="text-base text-text-secondary mt-3">
            Choose a new password for your account
          </p>
        </div>

        <div className="bg-surface rounded-2xl shadow-lg border border-border-default px-10 pt-10 pb-8">
          {error && (
            <div className="mb-8 px-4 py-3.5 rounded-xl bg-red-500/10 border border-red-500/30 text-sm text-red-400">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label className="text-sm font-medium text-text-secondary block mb-2.5">New Password</label>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter new password"
                minLength={6}
                className={inputClass}
              />
            </div>

            <div>
              <label className="text-sm font-medium text-text-secondary block mb-2.5">Confirm Password</label>
              <input
                type="password"
                required
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Confirm new password"
                minLength={6}
                className={inputClass}
              />
            </div>

            <div className="pt-2">
              <button
                type="submit"
                disabled={submitting}
                className="w-full py-3.5 px-4 text-[15px] font-semibold rounded-xl bg-blue-600 text-white hover:bg-blue-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {submitting ? 'Resetting...' : 'Reset Password'}
              </button>
            </div>
          </form>

          <div className="mt-8 pt-6 border-t border-border-default text-center">
            <Link
              to="/login"
              className="text-sm text-blue-400 hover:text-blue-300 transition-colors"
            >
              Back to sign in
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
