/**
 * Magic link verification page.
 * Reads token from URL, verifies with API, redirects to app.
 */

import { useEffect, useState } from 'react'
import { useSearchParams, useNavigate, Link } from 'react-router-dom'
import { verifyMagicLink } from '../api/client'

type VerifyStatus = 'verifying' | 'success' | 'error'

export function VerifyPage() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const [status, setStatus] = useState<VerifyStatus>('verifying')
  const [error, setError] = useState('')

  useEffect(() => {
    const token = searchParams.get('token')

    if (!token) {
      setStatus('error')
      setError('No verification token provided')
      return
    }

    const verify = async () => {
      try {
        await verifyMagicLink(token)
        setStatus('success')

        // Redirect to chat after a brief moment
        setTimeout(() => {
          navigate('/chat')
        }, 1500)
      } catch (err) {
        setStatus('error')
        setError(err instanceof Error ? err.message : 'Verification failed')
      }
    }

    verify()
  }, [searchParams, navigate])

  return (
    <div
      style={{
        minHeight: '100vh',
        backgroundColor: 'var(--color-gray-900)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 'var(--space-4)',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '400px',
          backgroundColor: 'var(--color-gray-800)',
          borderRadius: 'var(--radius-lg)',
          overflow: 'hidden',
          border: '1px solid var(--color-gray-700)',
        }}
      >
        {/* Terminal header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--space-2)',
            padding: 'var(--space-3) var(--space-4)',
            backgroundColor: 'var(--color-gray-700)',
            borderBottom: '1px solid var(--color-gray-600)',
          }}
        >
          <div
            style={{
              width: '12px',
              height: '12px',
              borderRadius: '50%',
              backgroundColor: '#ff5f57',
            }}
          />
          <div
            style={{
              width: '12px',
              height: '12px',
              borderRadius: '50%',
              backgroundColor: '#febc2e',
            }}
          />
          <div
            style={{
              width: '12px',
              height: '12px',
              borderRadius: '50%',
              backgroundColor: '#28c840',
            }}
          />
          <span
            style={{
              marginLeft: 'var(--space-2)',
              fontSize: 'var(--text-sm)',
              color: 'var(--color-gray-400)',
            }}
          >
            verify
          </span>
        </div>

        {/* Content */}
        <div style={{ padding: 'var(--space-6)', textAlign: 'center' }}>
          {status === 'verifying' && (
            <div style={{ padding: 'var(--space-8) 0' }}>
              <div
                style={{
                  width: '32px',
                  height: '32px',
                  margin: '0 auto var(--space-4)',
                  border: '3px solid var(--color-gray-600)',
                  borderTopColor: 'var(--color-primary)',
                  borderRadius: '50%',
                  animation: 'spin 1s linear infinite',
                }}
              />
              <p style={{ color: 'var(--color-gray-200)' }}>
                Verifying your link...
              </p>
            </div>
          )}

          {status === 'success' && (
            <div style={{ padding: 'var(--space-8) 0' }}>
              <div
                style={{
                  fontSize: '3rem',
                  color: 'var(--color-primary)',
                  marginBottom: 'var(--space-4)',
                }}
              >
                &#10003;
              </div>
              <p
                style={{
                  color: 'var(--color-primary)',
                  fontWeight: 700,
                  marginBottom: 'var(--space-2)',
                }}
              >
                You're in!
              </p>
              <p
                style={{
                  color: 'var(--color-gray-400)',
                  fontSize: 'var(--text-sm)',
                }}
              >
                Redirecting to dashboard...
              </p>
            </div>
          )}

          {status === 'error' && (
            <div style={{ padding: 'var(--space-8) 0' }}>
              <div
                style={{
                  fontSize: '3rem',
                  color: 'var(--color-error)',
                  marginBottom: 'var(--space-4)',
                }}
              >
                &#10007;
              </div>
              <p
                style={{
                  color: 'var(--color-error)',
                  fontWeight: 700,
                  marginBottom: 'var(--space-2)',
                }}
              >
                Verification failed
              </p>
              <p
                style={{
                  color: 'var(--color-gray-400)',
                  fontSize: 'var(--text-sm)',
                  marginBottom: 'var(--space-6)',
                }}
              >
                {error}
              </p>
              <Link
                to="/login"
                style={{
                  display: 'inline-block',
                  padding: 'var(--space-2) var(--space-4)',
                  backgroundColor: 'var(--color-primary)',
                  color: 'white',
                  borderRadius: 'var(--radius-md)',
                  textDecoration: 'none',
                  fontSize: 'var(--text-sm)',
                  fontWeight: 500,
                }}
              >
                Try again
              </Link>
            </div>
          )}
        </div>
      </div>

      {/* Spin animation */}
      <style>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  )
}
